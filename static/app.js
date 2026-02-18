/* ============================================================
   Data Mesh Maturity Dashboard – Client-Side Logic
   WEPA Branded + Fully Dynamic Manual Score Override
   ============================================================ */

// State
let allDomains = [];
let overviewData = null;
let selectedDomains = new Set();
let radarChart = null;
let distributionChart = null;

// Current detail view state — holds the live domain data for dynamic recalc
let currentDomainData = null;
// Score overrides: { domain: { questionId: overriddenScore } }
let scoreOverrides = {};

// WEPA-aligned colors
const PILLAR_COLORS = {
    'Domain Ownership': { bg: 'rgba(0,100,170,0.25)', border: '#0064AA' },
    'Data as a Product': { bg: 'rgba(0,155,130,0.25)', border: '#009B82' },
    'Self-Serve Data Platform': { bg: 'rgba(0,45,85,0.25)', border: '#002D55' },
    'Federated Governance': { bg: 'rgba(220,245,0,0.25)', border: '#b0c400' },
};

const DOMAIN_COLORS = [
    '#0064AA', '#009B82', '#002D55', '#b0c400', '#e67e22',
    '#d04848', '#7c3aed', '#0891b2', '#e0b420', '#FACDBE',
];

const BAND_COLORS = {
    'Initial': '#d04848',
    'Developing': '#e67e22',
    'Defined': '#e0b420',
    'Managed': '#009B82',
    'Optimized': '#0064AA',
    'Not Assessed': '#94a3b8',
};

function scoreColor(score) {
    if (score === null || score === undefined) return 'var(--muted)';
    if (score >= 4.5) return '#004e85';
    if (score >= 3.5) return '#007d6a';
    if (score >= 2.5) return '#9a7d16';
    if (score >= 1.5) return '#c06a1d';
    return '#b33a3a';
}

function scoreCellClass(score) {
    if (score === null) return 'score-cell-na';
    const rounded = Math.round(score);
    return `score-cell-${Math.min(Math.max(rounded, 1), 5)}`;
}

function bandBadgeClass(band) {
    return 'badge-' + (band || 'not-assessed').toLowerCase().replace(/\s+/g, '-');
}

function bandPillarClass(band) {
    return 'band-' + (band || 'not-assessed').toLowerCase().replace(/\s+/g, '-');
}

function formatDomain(name) {
    return name.replace(/_/g, ' ');
}

// Helper for band calculation
function getBand(val) {
    if (!val && val !== 0) return 'Not Assessed';
    const s = parseFloat(val);
    if (isNaN(s)) return 'Not Assessed';
    if (s >= 4.5) return 'Optimized';
    if (s >= 3.5) return 'Managed';
    if (s >= 2.5) return 'Defined';
    if (s >= 1.5) return 'Developing';
    return 'Initial';
}
window.getBand = getBand;

// ---- API Calls ----
async function fetchDomains() {
    const res = await fetch('/api/domains');
    return res.json();
}

async function fetchOverview() {
    const res = await fetch('/api/overview');
    return res.json();
}

async function fetchDomainDetail(name) {
    const res = await fetch(`/api/domain/${encodeURIComponent(name)}`);
    return res.json();
}

async function fetchOverrides() {
    const res = await fetch('/api/overrides');
    return res.json();
}

async function saveOverride(domain, questionId, score) {
    try {
        await fetch('/api/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, questionId, score }),
        });
    } catch (e) {
        console.error('Failed to save override:', e);
    }
}

// ---- Navigation ----
document.querySelectorAll('.nav-btn').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');
    });
});

// ---- Initialize ----
async function init() {
    try {
        const [domains, overview, savedOverrides] = await Promise.all([
            fetchDomains(), fetchOverview(), fetchOverrides()
        ]);

        // Restore persisted overrides into frontend state
        scoreOverrides = savedOverrides || {};

        // Sort by overall score descending for Executive View
        overview.matrix.sort((a, b) => (b.overall || 0) - (a.overall || 0));

        allDomains = domains;
        overviewData = overview;

        // Header stats
        document.getElementById('header-domains').textContent = domains.length;
        const avgScore = domains.reduce((s, d) => s + (d.overall_score || 0), 0) / domains.length;
        document.getElementById('header-avg').textContent = avgScore.toFixed(1);

        renderHeatmap(overview, domains);
        renderDistributionChart(domains);
        renderBandSummary(domains);
        renderComparisonView(overview, domains);
        renderDomainSelector(domains);
    } catch (e) {
        console.error('Failed to initialize:', e);
    }
}

// ---- Overview: Heatmap ----
function renderHeatmap(overview, domains) {
    const table = document.getElementById('heatmap-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    // Headers
    thead.innerHTML = '<th>Domain</th>';
    overview.pillars.forEach(p => {
        thead.innerHTML += `<th>${p}</th>`;
    });
    thead.innerHTML += '<th>Overall</th>';

    // Rows
    tbody.innerHTML = '';
    overview.matrix.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.domain = row.domain;
        tr.innerHTML = `<td>${formatDomain(row.domain)}</td>`;
        overview.pillars.forEach(p => {
            const val = row[p];
            const display = val !== null ? val.toFixed(1) : '—';
            tr.innerHTML += `<td class="${scoreCellClass(val)}">${display}</td>`;
        });
        const overall = row.overall;
        const oDisplay = overall !== null ? overall.toFixed(1) : '—';
        tr.innerHTML += `<td class="${scoreCellClass(overall)}" style="font-weight:800">${oDisplay}</td>`;

        // Click to switch to detail
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            document.getElementById('domain-select').value = row.domain;
            document.querySelectorAll('.nav-btn').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-view="detail"]').classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-detail').classList.add('active');
            loadDomainDetail(row.domain);
        });

        tbody.appendChild(tr);
    });
}

// ---- Overview: Distribution Chart ----
function renderDistributionChart(domains) {
    const ctx = document.getElementById('chart-distribution').getContext('2d');
    const pillarNames = ['Domain Ownership', 'Data as a Product', 'Self-Serve Data Platform', 'Federated Governance'];
    const datasets = pillarNames.map((p, i) => {
        const values = domains.map(d => {
            const pillar = d.pillars.find(pl => pl.name === p);
            return pillar ? pillar.avg_score : 0;
        });
        const colors = Object.values(PILLAR_COLORS);
        return {
            label: p,
            data: values,
            backgroundColor: colors[i].bg,
            borderColor: colors[i].border,
            borderWidth: 1,
            borderRadius: 4,
        };
    });

    if (distributionChart) distributionChart.destroy();
    distributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: domains.map(d => formatDomain(d.domain)),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#475569', font: { size: 11 }, padding: 16 },
                },
            },
            scales: {
                x: {
                    ticks: { color: '#475569', font: { size: 10 }, maxRotation: 45 },
                    grid: { display: false },
                },
                y: {
                    min: 0, max: 5,
                    ticks: { color: '#475569', stepSize: 1 },
                    grid: { color: 'rgba(0,45,85,0.06)' },
                },
            },
        },
    });
}

// ---- Overview: Band Summary ----
function renderBandSummary(domains) {
    const bands = { 'Optimized': 0, 'Managed': 0, 'Defined': 0, 'Developing': 0, 'Initial': 0 };
    domains.forEach(d => {
        const band = d.overall_band || 'Not Assessed';
        if (bands.hasOwnProperty(band)) bands[band]++;
    });

    const total = domains.length;
    const container = document.getElementById('band-summary');
    container.innerHTML = '';

    Object.entries(bands).forEach(([name, count]) => {
        const pct = total > 0 ? (count / total * 100) : 0;
        container.innerHTML += `
            <div class="band-row">
                <div class="band-dot" style="background:${BAND_COLORS[name]}"></div>
                <div class="band-name">${name}</div>
                <div class="band-bar-bg">
                    <div class="band-bar-fill" style="width:${pct}%;background:${BAND_COLORS[name]}"></div>
                </div>
                <div class="band-count">${count}</div>
            </div>
        `;
    });
}

// ---- Comparison: Radar Chart ----
function renderComparisonView(overview, domains) {
    const container = document.getElementById('domain-checkboxes');
    container.innerHTML = '';

    // Pre-select first 3 domains
    domains.slice(0, 3).forEach(d => selectedDomains.add(d.domain));

    domains.forEach((d, i) => {
        const checked = selectedDomains.has(d.domain);
        const label = document.createElement('label');
        label.className = checked ? 'checked' : '';
        label.innerHTML = `<input type="checkbox" value="${d.domain}" ${checked ? 'checked' : ''}>
            <span>${formatDomain(d.domain)}</span>`;
        label.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedDomains.add(d.domain);
                label.classList.add('checked');
            } else {
                selectedDomains.delete(d.domain);
                label.classList.remove('checked');
            }
            updateRadarChart(overview);
        });
        container.appendChild(label);
    });

    updateRadarChart(overview);
    renderPillarRankings(overview);
}

function updateRadarChart(overview) {
    const ctx = document.getElementById('chart-radar').getContext('2d');
    const selected = overview.matrix.filter(r => selectedDomains.has(r.domain));

    const datasets = selected.map((row, i) => {
        const colorIdx = overview.matrix.findIndex(r => r.domain === row.domain) % DOMAIN_COLORS.length;
        const color = DOMAIN_COLORS[colorIdx];
        return {
            label: formatDomain(row.domain),
            data: overview.pillars.map(p => row[p] || 0),
            fill: true,
            backgroundColor: color + '20',
            borderColor: color,
            borderWidth: 2,
            pointBackgroundColor: color,
            pointRadius: 4,
        };
    });

    if (radarChart) radarChart.destroy();
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: overview.pillars.map(p => {
                return p.replace('Self-Serve Data Platform', 'Self-Serve Platform')
                    .replace('Federated Governance', 'Fed. Governance');
            }),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#475569', font: { size: 11 }, padding: 16 },
                },
            },
            scales: {
                r: {
                    min: 0, max: 5,
                    ticks: { stepSize: 1, color: '#475569', backdropColor: 'transparent' },
                    grid: { color: 'rgba(0,45,85,0.08)' },
                    angleLines: { color: 'rgba(0,45,85,0.08)' },
                    pointLabels: { color: '#002D55', font: { size: 12, weight: '600' } },
                },
            },
        },
    });
}

function renderPillarRankings(overview) {
    const container = document.getElementById('pillar-rankings');
    container.innerHTML = '';

    overview.pillars.forEach(pillar => {
        const sorted = [...overview.matrix]
            .filter(r => r[pillar] !== null)
            .sort((a, b) => (b[pillar] || 0) - (a[pillar] || 0));

        const col = document.createElement('div');
        col.className = 'ranking-column';
        col.innerHTML = `<h4>${pillar}</h4>`;
        sorted.forEach((row, idx) => {
            const score = row[pillar];
            const cssClass = scoreCellClass(score);
            col.innerHTML += `
                <div class="ranking-item">
                    <span class="rank-domain">${idx + 1}. ${formatDomain(row.domain)}</span>
                    <span class="rank-score ${cssClass}">${score !== null ? score.toFixed(1) : '—'}</span>
                </div>`;
        });
        container.appendChild(col);
    });
}

// ---- Detail View ----
function renderDomainSelector(domains) {
    const select = document.getElementById('domain-select');
    domains.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.domain;
        opt.textContent = formatDomain(d.domain);
        select.appendChild(opt);
    });

    select.addEventListener('change', () => {
        if (select.value) loadDomainDetail(select.value);
    });
}

async function loadDomainDetail(domain) {
    const data = await fetchDomainDetail(domain);

    // Apply any stored overrides for this domain
    const overrides = scoreOverrides[domain] || {};
    Object.keys(overrides).forEach(qId => {
        const q = data.questions.find(qq => qq.id === qId);
        if (q) {
            q.score = overrides[qId];
            q.band = getBand(overrides[qId]);
        }
    });

    // Recalculate pillar avgs and overall from (possibly overridden) question scores
    recalcDomainAggregates(data);

    // Store as current for dynamic updates
    currentDomainData = data;

    const content = document.getElementById('detail-content');
    const emptyState = document.getElementById('detail-empty');
    if (emptyState) emptyState.style.display = 'none';
    content.style.display = 'block';

    renderStatsBar(data);
    renderPillarCards(data);
    renderQuestionSections(data);
}

// ---- Recalculate pillar averages + overall from current question scores ----
function recalcDomainAggregates(data) {
    const pillarOrder = ['Domain Ownership', 'Data as a Product', 'Self-Serve Data Platform', 'Federated Governance'];
    const pillarScores = {};

    pillarOrder.forEach(p => { pillarScores[p] = []; });

    data.questions.forEach(q => {
        if (q.score !== null && q.score !== undefined) {
            pillarScores[q.pillar].push(q.score);
        }
    });

    // Update pillar objects
    data.pillars.forEach(p => {
        const scores = pillarScores[p.name] || [];
        p.avg_score = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
        p.band = getBand(p.avg_score);
        p.scored_count = scores.length;
    });

    // Update overall
    const allScores = data.questions.filter(q => q.score !== null && q.score !== undefined).map(q => q.score);
    data.overall_score = allScores.length > 0 ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100 : null;
    data.overall_band = getBand(data.overall_score);
}

function renderStatsBar(data) {
    const bar = document.getElementById('domain-stats-bar');
    const stats = data.stats;
    const overallColor = scoreColor(data.overall_score);
    bar.innerHTML = `
        <div class="stat-chip"><span class="chip-val" style="color:${overallColor}">${data.overall_score !== null ? data.overall_score.toFixed(1) : '—'}</span><span class="chip-label">Overall Score</span></div>
        <div class="stat-chip"><span class="chip-val" style="color:${BAND_COLORS[data.overall_band] || '#94a3b8'}">${data.overall_band}</span><span class="chip-label">Band</span></div>
        <div class="stat-chip"><span class="chip-val">${stats.workspaces}</span><span class="chip-label">Workspaces</span></div>
        <div class="stat-chip"><span class="chip-val">${stats.total_items}</span><span class="chip-label">Total Items</span></div>
        <div class="stat-chip"><span class="chip-val">${stats.has_dev ? '✓' : '✗'}</span><span class="chip-label">DEV Tier</span></div>
        <div class="stat-chip"><span class="chip-val">${stats.has_test ? '✓' : '✗'}</span><span class="chip-label">TEST Tier</span></div>
        <div class="stat-chip"><span class="chip-val">${stats.has_prod ? '✓' : '✗'}</span><span class="chip-label">PROD Tier</span></div>
    `;
}

function renderPillarCards(data) {
    const container = document.getElementById('pillar-cards');
    container.innerHTML = '';

    data.pillars.forEach(p => {
        const card = document.createElement('div');
        card.className = `pillar-card ${bandPillarClass(p.band)}`;
        card.dataset.pillar = p.name;
        card.innerHTML = `
            <div class="pillar-name">${p.name}</div>
            <div class="pillar-score" style="color:${scoreColor(p.avg_score)}">${p.avg_score !== null ? p.avg_score.toFixed(1) : '—'}</div>
            <span class="pillar-band ${bandBadgeClass(p.band)}">${p.band}</span>
            <div style="margin-top:8px;font-size:0.68rem;color:var(--muted)">${p.scored_count}/${p.total_count} scored</div>
        `;
        container.appendChild(card);
    });
}

// ---- Question Sections — All Self-Assessment ----
// Every question gets a dropdown for manual self-assessment.
// Auto/semi questions have the data-computed score pre-selected as default.
// Manual questions start empty (Not Assessed) until user inputs a score.

function renderQuestionSections(data) {
    const container = document.getElementById('question-sections');
    container.innerHTML = '';

    const pillarOrder = ['Domain Ownership', 'Data as a Product', 'Self-Serve Data Platform', 'Federated Governance'];

    pillarOrder.forEach(pillar => {
        const questions = data.questions.filter(q => q.pillar === pillar);
        const pillarInfo = data.pillars.find(p => p.name === pillar);

        const section = document.createElement('div');
        section.className = 'question-section';
        section.dataset.pillar = pillar;

        section.innerHTML = `
            <div class="question-section-header">
                <h3>${pillar}</h3>
                <span class="section-badge ${bandBadgeClass(pillarInfo?.band)}" data-pillar-badge="${pillar}">${pillarInfo?.avg_score !== null ? pillarInfo.avg_score.toFixed(1) : '—'} · ${pillarInfo?.band || 'N/A'}</span>
            </div>
            <table class="question-table">
                <thead>
                    <tr>
                        <th style="width:60px">ID</th>
                        <th>Question</th>
                        <th style="width:90px">Score</th>
                        <th style="width:80px">Band</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;

        const tbody = section.querySelector('tbody');

        questions.forEach(q => {
            const tr = document.createElement('tr');
            tr.dataset.questionId = q.id;

            // Every question gets a dropdown — auto/semi scores are pre-selected
            const scoreDisplay = buildScoreDropdown(q.id, q.score);

            // Band badge
            const band = q.score !== null ? q.band : 'Not Assessed';
            const bandDisplay = `<span class="${bandBadgeClass(band)}" style="font-size:0.72rem;padding:2px 8px;border-radius:10px" data-band-qid="${q.id}">${band}</span>`;

            tr.innerHTML = `
                <td><span class="q-id">${q.id}</span></td>
                <td class="q-text">${q.text}</td>
                <td>${scoreDisplay}</td>
                <td>${bandDisplay}</td>
            `;
            tbody.appendChild(tr);
        });

        container.appendChild(section);
    });
}

function buildScoreDropdown(qId, currentScore) {
    const options = ['<option value="">—</option>'];
    for (let i = 1; i <= 5; i++) {
        const selected = (currentScore !== null && currentScore === i) ? ' selected' : '';
        options.push(`<option value="${i}"${selected}>${i}</option>`);
    }
    return `<select class="manual-select" data-qid="${qId}" onchange="handleScoreChange(this)">${options.join('')}</select>`;
}

// ---- Dynamic Score Change Handler ----
// When any score dropdown changes, this:
//   1. Updates the question's score in currentDomainData
//   2. Stores override so it persists when switching domains and back
//   3. Recalculates pillar averages and overall score
//   4. Re-renders pillar cards, stats bar, section header badges
//   5. Updates overview heatmap row for this domain
window.handleScoreChange = function (selectEl) {
    const qId = selectEl.dataset.qid;
    const val = selectEl.value;
    const newScore = val ? parseInt(val, 10) : null;
    const band = getBand(newScore);

    // 1. Update the band badge in the same row (use data-band-qid, NOT data-qid)
    const row = selectEl.closest('tr');
    const bandCell = row.querySelector(`[data-band-qid="${qId}"]`);
    if (bandCell) {
        bandCell.textContent = band;
        bandCell.className = `${bandBadgeClass(band)}`;
        bandCell.style.cssText = 'font-size:0.72rem;padding:2px 8px;border-radius:10px';
    }

    if (!currentDomainData) return;

    // 2. Update question score in live data
    const question = currentDomainData.questions.find(q => q.id === qId);
    if (question) {
        question.score = newScore;
        question.band = band;
    }

    // 3. Store override
    const domain = currentDomainData.domain;
    if (!scoreOverrides[domain]) scoreOverrides[domain] = {};
    if (newScore !== null) {
        scoreOverrides[domain][qId] = newScore;
    } else {
        delete scoreOverrides[domain][qId];
    }

    // Persist override to backend
    saveOverride(domain, qId, newScore);

    // 4. Recalculate aggregates
    recalcDomainAggregates(currentDomainData);

    // 5. Re-render pillar cards (with animation)
    renderPillarCards(currentDomainData);

    // 6. Re-render stats bar
    renderStatsBar(currentDomainData);

    // 7. Update section header badges
    currentDomainData.pillars.forEach(p => {
        const badge = document.querySelector(`[data-pillar-badge="${p.name}"]`);
        if (badge) {
            badge.textContent = `${p.avg_score !== null ? p.avg_score.toFixed(1) : '—'} · ${p.band || 'N/A'}`;
            badge.className = `section-badge ${bandBadgeClass(p.band)}`;
        }
    });

    // 8. Update overview heatmap row for this domain (if visible)
    updateHeatmapRow(currentDomainData);

    // 9. Update overview allDomains (so charts stay in sync)
    const domIdx = allDomains.findIndex(d => d.domain === domain);
    if (domIdx !== -1) {
        allDomains[domIdx].overall_score = currentDomainData.overall_score;
        allDomains[domIdx].overall_band = currentDomainData.overall_band;
        allDomains[domIdx].pillars = currentDomainData.pillars.map(p => ({ ...p }));

        // Update header avg
        const avgScore = allDomains.reduce((s, d) => s + (d.overall_score || 0), 0) / allDomains.length;
        document.getElementById('header-avg').textContent = avgScore.toFixed(1);

        // Re-render Score Distribution & Maturity Bands
        renderDistributionChart(allDomains);
        renderBandSummary(allDomains);
    }

    // 10. Update overview matrix (for radar chart)
    if (overviewData) {
        const matrixRow = overviewData.matrix.find(r => r.domain === domain);
        if (matrixRow) {
            matrixRow.overall = currentDomainData.overall_score;
            currentDomainData.pillars.forEach(p => {
                matrixRow[p.name] = p.avg_score;
            });
        }
    }
};

// Update a single row in the heatmap without re-rendering the entire table
function updateHeatmapRow(data) {
    const table = document.getElementById('heatmap-table');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(tr => {
        if (tr.dataset.domain === data.domain) {
            const cells = tr.querySelectorAll('td');
            // cells[0] = domain name, cells[1..4] = pillars, cells[5] = overall
            const pillarOrder = ['Domain Ownership', 'Data as a Product', 'Self-Serve Data Platform', 'Federated Governance'];
            pillarOrder.forEach((p, i) => {
                const pillarData = data.pillars.find(pp => pp.name === p);
                const val = pillarData ? pillarData.avg_score : null;
                const display = val !== null ? val.toFixed(1) : '—';
                cells[i + 1].className = scoreCellClass(val);
                cells[i + 1].textContent = display;
            });

            // Overall column
            const lastCell = cells[cells.length - 1];
            const overall = data.overall_score;
            lastCell.className = scoreCellClass(overall);
            lastCell.style.fontWeight = '800';
            lastCell.textContent = overall !== null ? overall.toFixed(1) : '—';
        }
    });
}

// ---- Boot ----
init();
