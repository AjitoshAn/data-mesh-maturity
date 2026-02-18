#!/usr/bin/env python3
"""Data Mesh Maturity Assessment Dashboard — Lightweight Deployment Version.

Serves pre-computed JSON data from the data/ directory.
Score overrides are persisted to data/overrides.json.
No pandas/numpy/CSV dependencies required.
"""

import copy
import json
from pathlib import Path
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

DATA_DIR = Path(__file__).parent / "data"
OVERRIDES_FILE = DATA_DIR / "overrides.json"

# Load pre-computed data at startup
with open(DATA_DIR / "domains.json") as f:
    DOMAINS_DATA = json.load(f)

with open(DATA_DIR / "overview.json") as f:
    OVERVIEW_DATA = json.load(f)

with open(DATA_DIR / "details.json") as f:
    DETAILS_DATA = json.load(f)

# Load persisted overrides: { domain: { questionId: score } }
if OVERRIDES_FILE.exists():
    with open(OVERRIDES_FILE) as f:
        OVERRIDES = json.load(f)
    print(f"✓ Loaded {sum(len(v) for v in OVERRIDES.values())} score overrides")
else:
    OVERRIDES = {}

print(f"✓ Loaded pre-computed data for {len(DOMAINS_DATA)} domains")


def _save_overrides():
    """Persist overrides to disk."""
    with open(OVERRIDES_FILE, "w") as f:
        json.dump(OVERRIDES, f, indent=2)


def _get_band(score):
    """Map a numeric score to a maturity band."""
    if score is None:
        return "Not Assessed"
    s = float(score)
    if s >= 4.5:
        return "Optimized"
    if s >= 3.5:
        return "Managed"
    if s >= 2.5:
        return "Defined"
    if s >= 1.5:
        return "Developing"
    return "Initial"


def _apply_overrides(domain_name, detail):
    """Apply score overrides to a domain detail dict (mutates in place)."""
    overrides = OVERRIDES.get(domain_name, {})
    if not overrides:
        return detail

    data = copy.deepcopy(detail)

    # Apply overrides to individual questions
    for q in data.get("questions", []):
        qid = q.get("id", "")
        if qid in overrides:
            q["score"] = overrides[qid]
            q["band"] = _get_band(overrides[qid])

    # Recalculate pillar averages
    for pillar in data.get("pillars", []):
        pillar_name = pillar["name"]
        pillar_questions = [q for q in data["questions"] if q.get("pillar") == pillar_name]
        scored = [q["score"] for q in pillar_questions if q.get("score") is not None]
        if scored:
            pillar["avg_score"] = round(sum(scored) / len(scored), 1)
            pillar["band"] = _get_band(pillar["avg_score"])
        else:
            pillar["avg_score"] = None
            pillar["band"] = "Not Assessed"

    # Recalculate overall score
    pillar_scores = [p["avg_score"] for p in data["pillars"] if p.get("avg_score") is not None]
    if pillar_scores:
        data["overall_score"] = round(sum(pillar_scores) / len(pillar_scores), 1)
        data["overall_band"] = _get_band(data["overall_score"])
    else:
        data["overall_score"] = None
        data["overall_band"] = "Not Assessed"

    return data


def _get_domains_with_overrides():
    """Return DOMAINS_DATA with overrides applied."""
    result = []
    for d in DOMAINS_DATA:
        domain_name = d["domain"]
        if domain_name in OVERRIDES and OVERRIDES[domain_name]:
            # Re-derive from detailed data with overrides
            detail = _apply_overrides(domain_name, DETAILS_DATA.get(domain_name, {}))
            entry = copy.deepcopy(d)
            entry["overall_score"] = detail.get("overall_score", d["overall_score"])
            entry["overall_band"] = detail.get("overall_band", d["overall_band"])
            entry["pillars"] = detail.get("pillars", d["pillars"])
            result.append(entry)
        else:
            result.append(d)
    return result


def _get_overview_with_overrides():
    """Return OVERVIEW_DATA with overrides applied."""
    data = copy.deepcopy(OVERVIEW_DATA)
    for row in data["matrix"]:
        domain_name = row["domain"]
        if domain_name in OVERRIDES and OVERRIDES[domain_name]:
            detail = _apply_overrides(domain_name, DETAILS_DATA.get(domain_name, {}))
            row["overall"] = detail.get("overall_score", row.get("overall"))
            for p in detail.get("pillars", []):
                row[p["name"]] = p["avg_score"]
    return data


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/domains")
def api_domains():
    """Return summary scores for all domains (with overrides applied)."""
    return jsonify(_get_domains_with_overrides())


@app.route("/api/domain/<name>")
def api_domain_detail(name):
    """Return detailed scores for a single domain (with overrides applied)."""
    if name not in DETAILS_DATA:
        return jsonify({"error": f"Domain '{name}' not found"}), 404
    return jsonify(_apply_overrides(name, DETAILS_DATA[name]))


@app.route("/api/overview")
def api_overview():
    """Cross-domain comparison matrix (with overrides applied)."""
    return jsonify(_get_overview_with_overrides())


@app.route("/api/overrides")
def api_get_overrides():
    """Return all current overrides."""
    return jsonify(OVERRIDES)


@app.route("/api/override", methods=["POST"])
def api_save_override():
    """Save a score override. Body: { domain, questionId, score }
    Set score to null to remove an override."""
    body = request.get_json(force=True)
    domain = body.get("domain")
    qid = body.get("questionId")
    score = body.get("score")

    if not domain or not qid:
        return jsonify({"error": "domain and questionId required"}), 400

    if domain not in OVERRIDES:
        OVERRIDES[domain] = {}

    if score is None:
        OVERRIDES[domain].pop(qid, None)
        # Clean up empty domain entries
        if not OVERRIDES[domain]:
            del OVERRIDES[domain]
    else:
        OVERRIDES[domain][qid] = score

    _save_overrides()
    return jsonify({"ok": True, "overrides": OVERRIDES.get(domain, {})})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
