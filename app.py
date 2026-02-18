#!/usr/bin/env python3
"""Data Mesh Maturity Assessment Dashboard — Lightweight Deployment Version.

Serves pre-computed JSON data from the data/ directory.
No pandas/numpy/CSV dependencies required.
"""

import json
from pathlib import Path
from flask import Flask, jsonify, render_template

app = Flask(__name__)

DATA_DIR = Path(__file__).parent / "data"

# Load pre-computed data at startup
with open(DATA_DIR / "domains.json") as f:
    DOMAINS_DATA = json.load(f)

with open(DATA_DIR / "overview.json") as f:
    OVERVIEW_DATA = json.load(f)

with open(DATA_DIR / "details.json") as f:
    DETAILS_DATA = json.load(f)

print(f"✓ Loaded pre-computed data for {len(DOMAINS_DATA)} domains")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/domains")
def api_domains():
    """Return summary scores for all domains."""
    return jsonify(DOMAINS_DATA)


@app.route("/api/domain/<name>")
def api_domain_detail(name):
    """Return detailed scores for a single domain."""
    if name not in DETAILS_DATA:
        return jsonify({"error": f"Domain '{name}' not found"}), 404
    return jsonify(DETAILS_DATA[name])


@app.route("/api/overview")
def api_overview():
    """Cross-domain comparison matrix."""
    return jsonify(OVERVIEW_DATA)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
