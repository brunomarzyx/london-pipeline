#!/usr/bin/env python3
"""Download approved residential schemes from the Planning London Datahub guest API.

GET-style filters do not fit in a URL, so queries are POSTed with curl
(Python's ssl here lacks certs). Pagination slices by decision quarter with
from/size (each slice is far below the 10k window).

Endpoint: https://planningdata.london.gov.uk/api-guest/applications/_search
(Elasticsearch-style, no key on the guest endpoint; verified 1 Nov 2026.)

Output: data/raw/pipeline/pld_approved_2015.jsonl (one minimal record/line).
Usage: python3 scripts/context/pipeline/download_pld.py
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
OUT = os.path.join(ROOT, "data", "raw", "pipeline", "pld_approved_2015.jsonl")
LOG = os.path.join(ROOT, "logs", "pipeline.log")
API = "https://planningdata.london.gov.uk/api-guest/applications/_search"

LOGF = open(LOG, "a")


def log(msg):
    LOGF.write(msg + "\n")
    print(msg, flush=True)


FIELDS = ["id", "lpa_app_no", "borough", "site_name", "street_name",
          "description", "decision", "decision_date", "status",
          "actual_commencement_date", "actual_completion_date", "lapsed_date",
          "postcode", "centroid",
          "application_details.residential_details.total_no_proposed_residential_units"]


def quarters():
    qs = []
    for y in range(2015, 2027):
        for q, (m0, m1) in enumerate([(1, 3), (4, 6), (7, 9), (10, 12)], 1):
            if y == 2026 and q == 4:
                continue
            last = {3: 31, 6: 30, 9: 30, 12: 31}[m1]
            qs.append((f"01/{m0:02d}/{y}", f"{last:02d}/{m1:02d}/{y}"))
    return qs


def fetch(body):
    with open("/tmp/pld-body.json", "w") as f:
        json.dump(body, f)
    out = subprocess.run(
        ["curl", "-sSL", "--max-time", "120", "-X", "POST", API,
         "-H", "Content-Type: application/json", "-d", "@/tmp/pld-body.json"],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"curl failed: {out.stderr[:200]}")
    return json.loads(out.stdout)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    seen = set()
    total = 0
    with open(OUT, "w") as f:
        for gte, lte in quarters():
            base_must = [
                {"match": {"decision": "Approved"}},
                {"range": {"application_details.residential_details."
                           "total_no_proposed_residential_units": {"gte": 1}}},
                {"geo_bounding_box": {"centroid": {
                    "top_left": {"lat": 51.70, "lon": -0.52},
                    "bottom_right": {"lat": 51.28, "lon": 0.34}}}},
                {"range": {"decision_date": {"gte": gte, "lte": lte}}},
            ]
            offset, qn = 0, 0
            while True:
                d = fetch({"size": 2000, "from": offset,
                           "_source": {"includes": FIELDS},
                           "query": {"bool": {"must": base_must}}})
                hits = d["hits"]["hits"]
                if not hits:
                    break
                for h in hits:
                    s = h["_source"]
                    rid = h["_id"]
                    if rid in seen:
                        continue
                    seen.add(rid)
                    rd = ((s.get("application_details") or {})
                          .get("residential_details") or {})
                    c = s.get("centroid") or {}
                    f.write(json.dumps({
                        "id": rid,
                        "ref": s.get("lpa_app_no"),
                        "borough": s.get("borough"),
                        "site": s.get("site_name") or s.get("street_name") or "",
                        "desc": (s.get("description") or "")[:160],
                        "units": rd.get("total_no_proposed_residential_units"),
                        "dec": s.get("decision_date"),
                        "comm": s.get("actual_commencement_date"),
                        "comp": s.get("actual_completion_date"),
                        "laps": s.get("lapsed_date"),
                        "lat": c.get("lat"), "lon": c.get("lon"),
                    }) + "\n")
                    total += 1
                qn += len(hits)
                offset += len(hits)
            log(f"quarter {gte}..{lte}: {qn} records")
    log(f"wrote {OUT}: {total} unique records ({os.path.getsize(OUT)/1e6:.1f} MB)")
    LOGF.close()


if __name__ == "__main__":
    main()
