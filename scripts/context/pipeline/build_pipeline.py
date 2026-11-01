#!/usr/bin/env python3
"""Build new-housing-supply aggregates per LSOA 2021 from PLD download.

Input: data/raw/pipeline/pld_approved_2015.jsonl (see download_pld.py).
Steps: parse dates, classify status (completed / started / approved-not-started,
drop lapsed-with-no-start), dedupe near-identical locations (4dp lat/lon,
keep max units), then per-LSOA pressure = units approved-not-started +
under construction within 1 km of the LSOA centroid, plus top-3 sites.

Output: data/context/pipeline.json
Usage: python3 scripts/context/pipeline/build_pipeline.py
"""
import bisect
import json
import math
import os
import sqlite3
from collections import defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
RAW = os.path.join(ROOT, "data", "raw", "pipeline", "pld_approved_2015.jsonl")
STREET_DB = os.path.join(ROOT, "data", "street.db")
OUT = os.path.join(ROOT, "data", "context", "pipeline.json")
LOG = os.path.join(ROOT, "logs", "pipeline.log")

TODAY = date(2026, 11, 1)
LOGF = open(LOG, "a")


def log(msg):
    LOGF.write(msg + "\n")
    print(msg, flush=True)


def parse_d(s):
    if not s or not isinstance(s, str):
        return None
    p = s.strip().split("/")
    try:
        if len(p) == 3:
            d, m, y = (int(x) for x in p)
            return date(y, m, d)
        if len(p) == 2:
            m, y = (int(x) for x in p)
            return date(y, m, 1)
    except ValueError:
        return None
    return None


def km(lat1, lon1, lat2, lon2):
    x = (lon2 - lon1) * 69.3
    y = (lat2 - lat1) * 111.0
    return math.hypot(x, y)


def main():
    recs = []
    n_raw = n_nounits = n_nodate = n_lapsed = n_comp = n_start = n_ns = 0
    with open(RAW) as f:
        for line in f:
            r = json.loads(line)
            n_raw += 1
            try:
                units = int(r.get("units") or 0)
            except (TypeError, ValueError):
                units = 0
            if units < 1:
                n_nounits += 1
                continue
            dec = parse_d(r.get("dec"))
            if dec is None:
                n_nodate += 1
                continue
            try:
                lat, lon = float(r.get("lat")), float(r.get("lon"))
            except (TypeError, ValueError):
                continue
            if not (51.28 <= lat <= 51.70 and -0.52 <= lon <= 0.34):
                continue
            comm, comp, laps = parse_d(r.get("comm")), parse_d(r.get("comp")), parse_d(r.get("laps"))
            if comp is not None:
                status = "completed"
                n_comp += 1
            elif comm is not None:
                status = "started"
                n_start += 1
            elif laps is not None and laps < TODAY:
                n_lapsed += 1
                continue
            else:
                status = "not_started"
                n_ns += 1
            name = (r.get("site") or "").strip() or (r.get("desc") or "")[:80]
            recs.append({"ref": r.get("ref"), "borough": r.get("borough"),
                         "name": name, "units": units, "status": status,
                         "dec": r.get("dec"), "comp": r.get("comp"),
                         "lat": lat, "lon": lon})
    log(f"raw={n_raw} nounits={n_nounits} nodate={n_nodate} lapsed_dropped={n_lapsed} "
        f"completed={n_comp} started={n_start} not_started={n_ns}")

    # Dedupe: same ~11m cell -> keep max units (ties: earliest decision).
    cells = defaultdict(list)
    for r in recs:
        cells[(round(r["lat"], 4), round(r["lon"], 4))].append(r)
    sites = []
    dup = 0
    for members in cells.values():
        if len(members) == 1:
            sites.append(members[0])
        else:
            dup += len(members) - 1
            members.sort(key=lambda r: (-r["units"], r["dec"] or ""))
            sites.append(members[0])
    active = [s for s in sites if s["status"] in ("not_started", "started")]
    log(f"sites after dedupe: {len(sites)} (merged {dup}); active: {len(active)}")

    # LSOA centroids from street.db postcode centroids.
    con = sqlite3.connect(STREET_DB)
    acc = defaultdict(lambda: [0.0, 0.0, 0])
    for lsoa, lat, lon in con.execute(
            "SELECT lsoa, lat, lon FROM postcodes WHERE lat IS NOT NULL AND lsoa<>''"):
        a = acc[lsoa]
        a[0] += lat
        a[1] += lon
        a[2] += 1
    con.close()
    centro = {c: (a[0] / a[2], a[1] / a[2]) for c, a in acc.items()}
    log(f"LSOA centroids: {len(centro)}")

    # Grid-bucket active sites for 1km lookups.
    CELL = 0.01
    grid = defaultdict(list)
    for s in active:
        grid[(math.floor(s["lat"] / CELL), math.floor(s["lon"] / CELL))].append(s)

    lsoa_out = {}
    for lsoa, (clat, clon) in centro.items():
        ns = st = 0
        near = []
        c0 = (math.floor(clat / CELL), math.floor(clon / CELL))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for s in grid.get((c0[0] + dx, c0[1] + dy), ()):
                    d = km(clat, clon, s["lat"], s["lon"])
                    if d <= 1.0:
                        if s["status"] == "not_started":
                            ns += s["units"]
                        else:
                            st += s["units"]
                        near.append((s["units"], d, s))
        near.sort(key=lambda t: -t[0])
        top3 = [{"ref": s["ref"], "name": s["name"][:80], "borough": s["borough"],
                 "units": s["units"], "status": s["status"], "dec": s["dec"],
                 "dist_km": round(d, 2)} for _, d, s in near[:3]]
        lsoa_out[lsoa] = {"ns": ns, "st": st, "tot": ns + st, "top": top3}

    vals = sorted(v["tot"] for v in lsoa_out.values())
    m = len(vals)
    for v in lsoa_out.values():
        v["pct"] = round(100 * bisect.bisect_right(vals, v["tot"]) / m, 1)

    payload = {
        "asof": "2026-11-01",
        "source": "Planning London Datahub guest API (planningdata.london.gov.uk), "
                  "Approved decisions 2015-01-01..2026-09-30 with >=1 proposed residential unit",
        "note": "Sites within ~11m merged to largest scheme (conservative); "
                "lapsed-with-no-start dropped; completed excluded from pressure",
        "lsoa": lsoa_out,
        "totals": {"records": n_raw, "sites": len(sites), "active": len(active)},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f)
    size_mb = os.path.getsize(OUT) / 1e6
    log(f"wrote {OUT} ({size_mb:.1f} MB)")
    assert size_mb < 40
    LOGF.close()


if __name__ == "__main__":
    main()
