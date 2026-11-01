#!/usr/bin/env python3
"""Build short-let density aggregates per LSOA 2021.

Input: data/raw/shortlets/listings-YYYY-MM-DD.csv.gz (Inside Airbnb London).
Keeps entire-home listings with coords, assigns each to the nearest postcode
centroid in street.db (grid-bucketed search), and counts per LSOA:
n_entire and n_gt90 (availability_365 > 90, London's 90-night rule threshold).

Dwelling counts: 3 real attempts to get ONS Census 2021 dwellings via nomis
failed (search API needs registered uid; CSV links are JS-generated; direct
API guesses return the help page). Falls back to the per-LSOA count percentile
allowed by the spec. See docs/features/shortlets.md.

Output: data/context/shortlets.json
Usage: python3 scripts/context/shortlets/build_shortlets.py [csv.gz path]
"""
import csv
import gzip
import json
import math
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
STREET_DB = os.path.join(ROOT, "data", "street.db")
RAW = os.path.join(ROOT, "data", "raw", "shortlets")
OUT = os.path.join(ROOT, "data", "context", "shortlets.json")
LOG = os.path.join(ROOT, "logs", "shortlets.log")

LOGF = open(LOG, "a")


def log(msg):
    LOGF.write(msg + "\n")
    print(msg)


CELL = 0.005  # ~350-550 m grid cells for the postcode centroid index


def cell_of(lat, lon):
    return (math.floor(lat / CELL), math.floor(lon / CELL))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src is None:
        cands = sorted(f for f in os.listdir(RAW) if f.startswith("listings-") and f.endswith(".csv.gz"))
        if not cands:
            log("ERROR: no listings-*.csv.gz in " + RAW)
            sys.exit(1)
        src = os.path.join(RAW, cands[-1])
    asof = os.path.basename(src)[len("listings-"):-len(".csv.gz")]
    log(f"source file: {src} (asof {asof})")

    con = sqlite3.connect(STREET_DB)
    grid = {}   # cell -> list of (lat, lon, lsoa)
    n_pc = 0
    for pc, lsoa, lat, lon in con.execute(
            "SELECT postcode, lsoa, lat, lon FROM postcodes WHERE lat IS NOT NULL"):
        if not lsoa:
            continue
        grid.setdefault(cell_of(lat, lon), []).append((lat, lon, lsoa))
        n_pc += 1
    con.close()
    log(f"postcode centroids indexed: {n_pc}")

    def nearest_lsoa(lat, lon):
        c0 = cell_of(lat, lon)
        best, best_d2 = None, float("inf")
        for ring in range(6):  # up to ~3 km
            found = False
            for dx in range(-ring, ring + 1):
                for dy in range(-ring, ring + 1):
                    if max(abs(dx), abs(dy)) != ring:
                        continue
                    for plat, plon, lsoa in grid.get((c0[0] + dx, c0[1] + dy), ()):
                        d2 = (plat - lat) ** 2 + ((plon - lon) * 0.623) ** 2
                        if d2 < best_d2:
                            best_d2, best = d2, lsoa
                            found = True
            if found:
                break
        return best

    n_all = n_entire = n_gt90 = n_nogeo = n_unmatched = 0
    per_lsoa = {}
    with gzip.open(src, "rt", newline="") as f:
        for row in csv.DictReader(f):
            n_all += 1
            if row.get("room_type") != "Entire home/apt":
                continue
            try:
                lat, lon = float(row["latitude"]), float(row["longitude"])
            except (TypeError, ValueError):
                n_nogeo += 1
                continue
            if not (51.2 < lat < 51.8 and -0.6 < lon < 0.4):
                n_nogeo += 1
                continue
            lsoa = nearest_lsoa(lat, lon)
            if not lsoa:
                n_unmatched += 1
                continue
            n_entire += 1
            e = per_lsoa.setdefault(lsoa, [0, 0])
            e[0] += 1
            try:
                avail = int(row.get("availability_365") or 0)
            except ValueError:
                avail = 0
            if avail > 90:
                e[1] += 1
                n_gt90 += 1
    log(f"rows: {n_all}; entire-home with coords matched: {n_entire}; "
        f"of those avail>90: {n_gt90}; bad-geo: {n_nogeo}; unmatched: {n_unmatched}")

    # Percentile of badness on n_entire across ALL London LSOAs in street.db
    # (zeros included, so quiet LSOAs score low).
    con = sqlite3.connect(STREET_DB)
    all_lsoa = [r[0] for r in con.execute("SELECT DISTINCT lsoa FROM postcodes WHERE lsoa<>''")]
    con.close()
    import bisect
    vals = sorted(per_lsoa.get(c, [0, 0])[0] for c in all_lsoa)
    m = len(vals)
    lsoa_out = {}
    for c in all_lsoa:
        ne, g90 = per_lsoa.get(c, [0, 0])
        lsoa_out[c] = {"n": ne, "gt90": g90,
                       "pct": round(100 * bisect.bisect_right(vals, ne) / m, 1)}
    payload = {
        "asof": asof,
        "source": "Inside Airbnb London listings (CC BY 4.0); LSOA 2021 by nearest postcode centroid",
        "denominator": "per-LSOA count percentile (nomis dwelling counts unobtainable; see docs)",
        "lsoa": lsoa_out,
        "totals": {"listings": n_all, "entire_home": n_entire, "entire_gt90": n_gt90},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f)
    size_mb = os.path.getsize(OUT) / 1e6
    log(f"wrote {OUT} ({size_mb:.1f} MB), {len(lsoa_out)} LSOAs")
    assert size_mb < 40
    LOGF.close()


if __name__ == "__main__":
    main()
