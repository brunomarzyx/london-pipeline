#!/usr/bin/env python3
"""Build EPC & retrofit-risk aggregates for London postcodes.

Reads the main repo's EPC extract READ-ONLY
(../../london-pipeline/data/street/epc/epc_*.parquet, latest cert per home),
joins each cert to street.db postcodes for street/sector/LSOA/MSOA codes,
and writes aggregated shares to data/context/epc.json.

No downloads: reuses the existing extract (see logs/epc-fetch.log in main repo).
Usage: python3 scripts/context/epc/build_epc.py
"""
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))  # scripts/context/epc
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # repo root
MAIN = os.path.abspath(os.path.join(ROOT, "..", "london-pipeline"))
EPC_DIR = os.path.join(MAIN, "data", "street", "epc")
STREET_DB = os.path.join(ROOT, "data", "street.db")
OUT = os.path.join(ROOT, "data", "context", "epc.json")
LOG = os.path.join(ROOT, "logs", "epc.log")

RATINGS = ["A", "B", "C", "D", "E", "F", "G"]
RNUM = {r: i + 1 for i, r in enumerate(RATINGS)}
RLET = {i + 1: r for i, r in enumerate(RATINGS)}

LOGF = open(LOG, "a")


def log(msg):
    LOGF.write(msg + "\n")
    print(msg)


def norm_pc(raw):
    if raw is None:
        return None
    s = re.sub(r"[^A-Z0-9]", "", str(raw).upper())
    if len(s) < 5 or len(s) > 7:
        return None
    out, inw = s[:-3], s[-3:]
    if not re.match(r"^[A-Z]{1,2}\d[A-Z\d]?$", out):
        return None
    if not re.match(r"^\d[A-Z]{2}$", inw):
        return None
    return f"{out} {inw}"


def main():
    files = sorted(f for f in os.listdir(EPC_DIR) if f.startswith("epc_") and f.endswith(".parquet"))
    if not files:
        log("ERROR: no epc_*.parquet found in " + EPC_DIR)
        sys.exit(1)
    log(f"EPC source files: {len(files)} ({files[0]}..{files[-1]})")

    # Latest cert per home: key = UPRN else address+postcode; keep max lodgement_date.
    latest = {}  # key -> (date, postcode, rating)
    total_rows = 0
    for f in files:
        t = pq.read_table(os.path.join(EPC_DIR, f),
                          columns=["uprn", "address1", "address2", "address",
                                   "postcode", "current_energy_rating", "lodgement_date"])
        d = t.to_pylist()
        total_rows += len(d)
        for r in d:
            rating = (r["current_energy_rating"] or "").strip().upper()
            if rating not in RNUM:
                continue
            pc = norm_pc(r["postcode"])
            if not pc:
                continue
            uprn = (r["uprn"] or "").strip()
            if uprn:
                key = "U" + uprn
            else:
                key = "A" + "|".join((r["address1"] or "", r["address2"] or "",
                                      r["address"] or "")).strip().upper() + "|" + pc
            date = r["lodgement_date"] or ""
            prev = latest.get(key)
            if prev is None or date >= prev[0]:
                latest[key] = (date, pc, rating)
    log(f"rows read: {total_rows}; unique homes after latest-cert dedupe: {len(latest)}")

    con = sqlite3.connect(STREET_DB)
    pc2area = {}
    for pc, skey, sector, lsoa, msoa in con.execute(
            "SELECT postcode, street_key, sector, lsoa, msoa FROM postcodes"):
        pc2area[pc] = (skey or "", sector or "", lsoa or "", msoa or "")
    con.close()
    log(f"street.db postcodes loaded: {len(pc2area)}")

    # Aggregate counts per (level, code).
    counts = defaultdict(lambda: [0] * 7)  # (level,code) -> [nA..nG]
    unmatched = 0
    for _date, pc, rating in latest.values():
        a = pc2area.get(pc)
        if not a:
            unmatched += 1
            continue
        skey, sector, lsoa, msoa = a
        if skey:
            counts[("street", skey)][RNUM[rating] - 1] += 1
        if sector:
            counts[("sector", sector)][RNUM[rating] - 1] += 1
        if lsoa:
            counts[("lsoa", lsoa)][RNUM[rating] - 1] += 1
        if msoa:
            counts[("msoa", msoa)][RNUM[rating] - 1] += 1
    log(f"EPC certs with no street.db postcode match (outside London extract): {unmatched}")

    levels = {}
    for level in ("street", "sector", "lsoa", "msoa"):
        entries = {}
        for (lv, code), c in counts.items():
            if lv != level:
                continue
            n = sum(c)
            if n == 0:
                continue
            n_dg = sum(c[3:])   # D,E,F,G
            n_eg = sum(c[4:])   # E,F,G
            n_fg = sum(c[5:])   # F,G (unlettable under current MEES E minimum)
            # Median rating letter.
            mid = (n - 1) // 2
            acc, med = 0, "G"
            for i, k in enumerate(c):
                acc += k
                if acc > mid:
                    med = RATINGS[i]
                    break
            entries[code] = {"n": n, "dg": round(n_dg / n, 4), "eg": round(n_eg / n, 4),
                             "fg": round(n_fg / n, 4), "med": med}
        # Percentile of badness on share_dg within this level: % of areas at/below.
        import bisect
        sorted_dg = sorted(e["dg"] for e in entries.values())
        m = len(sorted_dg)
        for e in entries.values():
            e["pct"] = round(100 * bisect.bisect_right(sorted_dg, e["dg"]) / m, 1) if m else 0.0
        levels[level] = entries
        log(f"level {level}: {len(entries)} areas")

    asof = max(f.split("_")[1].split(".")[0] for f in files)  # latest cert year present
    payload = {
        "asof": f"{asof}-12-31",
        "source": "MHCLG domestic EPC full load via main-repo extract (OGL); latest cert per home",
        "min_n": 10,
        "levels": levels,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f)
    size_mb = os.path.getsize(OUT) / 1e6
    log(f"wrote {OUT} ({size_mb:.1f} MB)")
    assert size_mb < 40, "output over 40 MB budget"
    LOGF.close()


if __name__ == "__main__":
    main()
