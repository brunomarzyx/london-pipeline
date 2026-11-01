#!/usr/bin/env python3
"""Build data/context/schools.db from GIAS + Ofsted MI.

Filter: open, state-funded, primary/secondary/all-through in London with
easting/northing. Ofsted join on URN for latest OEIF overall effectiveness.
Output: schools(urn,name,phase,lat,lon,rating,inspection_date) +
postcode_metrics(postcode, pri_urn, pri_m, sec_urn, sec_m,
pri_good_1km, sec_good_1km, score) where score = London percentile (0=best)
of badness = pri_m + sec_m (equal weights: primary and secondary access
matter equally for a family buyer; stated here and in docs/features).
"""
import csv, glob, math, os, sqlite3, sys

RAW = "data/raw/schools"
OUT = "data/context/schools.db"
LOG = "logs/schools.log"

def log(msg):
    print(msg, flush=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")

STATE_GROUPS_EXCLUDE = {"Independent schools", "Colleges", "Universities"}
PHASE_MAP = {
    "Primary": "primary",
    "Middle deemed primary": "primary",
    "Secondary": "secondary",
    "Middle deemed secondary": "secondary",
    "All-through": "all-through",
}
CAP_M = 20000.0  # cap per-phase distance for badness (documented)

def main():
    gias_files = sorted(glob.glob(f"{RAW}/edubasealldata*.csv"))
    assert gias_files, "no GIAS csv in data/raw/schools (run download.sh)"
    gias = max(gias_files)  # newest date-stamped file
    asof = os.path.basename(gias)[len("edubasealldata"):-len(".csv")]
    ofsted_files = sorted(glob.glob(f"{RAW}/ofsted_latest_*.csv"))
    assert ofsted_files, "no Ofsted MI csv in data/raw/schools"
    ofsted = ofsted_files[-1]

    from pyproj import Transformer
    tr = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)

    # --- Ofsted: URN -> (overall effectiveness 1-4, graded inspection start date)
    ratings = {}
    with open(ofsted, encoding="cp1252") as f:
        r = csv.DictReader(f)
        for row in r:
            urn = row["URN"].strip()
            eff = row["Latest OEIF overall effectiveness"].strip()
            if urn and eff in ("1", "2", "3", "4"):
                ratings[urn] = (int(eff),
                    row["Inspection start date of latest OEIF graded inspection"].strip() or None)
    log(f"ofsted {os.path.basename(ofsted)}: {len(ratings)} URNs with OEIF graded rating")

    # --- GIAS filter
    schools = []
    n_ldn_open = 0
    with open(gias, encoding="cp1252") as f:
        r = csv.DictReader(f)
        for row in r:
            if row["GOR (name)"] != "London":
                continue
            if row["EstablishmentStatus (name)"] not in ("Open", "Open, but proposed to close"):
                continue
            n_ldn_open += 1
            if row["EstablishmentTypeGroup (name)"] in STATE_GROUPS_EXCLUDE:
                continue
            if "independent" in row["TypeOfEstablishment (name)"].lower():
                continue
            phase = PHASE_MAP.get(row["PhaseOfEducation (name)"])
            if not phase:
                continue
            if not row["Easting"] or not row["Northing"]:
                continue
            try:
                lon, lat = tr.transform(float(row["Easting"]), float(row["Northing"]))
            except Exception:
                continue
            if not (49.5 < lat < 52.0 and -1.5 < lon < 1.5):
                continue
            urn = row["URN"].strip()
            rating, insp = ratings.get(urn, (None, None))
            schools.append({"urn": urn, "name": row["EstablishmentName"].strip(),
                            "phase": phase, "lat": lat, "lon": lon,
                            "rating": rating, "insp": insp})
    log(f"GIAS {os.path.basename(gias)}: {n_ldn_open} open London establishments -> "
        f"{len(schools)} state-funded primary/secondary/all-through with coords")
    n_good = sum(1 for s in schools if s["rating"] in (1, 2))
    log(f"of those, {n_good} rated good/outstanding (OEIF 1/2)")

    pri = [s for s in schools if s["phase"] in ("primary", "all-through") and s["rating"] in (1, 2)]
    sec = [s for s in schools if s["phase"] in ("secondary", "all-through") and s["rating"] in (1, 2)]
    log(f"good/outstanding: {len(pri)} primary-or-allthrough, {len(sec)} secondary-or-allthrough")

    # --- postcodes (all London in street.db). 46% lack lat/lon: backfill
    # from LSOA centroid (sibling postcodes with coords), else MSOA centroid.
    sdb = sqlite3.connect("data/street.db")
    raw_pcs = sdb.execute("SELECT postcode, lat, lon, lsoa, msoa FROM postcodes").fetchall()
    sdb.close()
    from collections import defaultdict
    lsoa_ll, msoa_ll = defaultdict(list), defaultdict(list)
    for pc, lat, lon, lsoa, msoa in raw_pcs:
        if lat is not None and lon is not None:
            lsoa_ll[lsoa].append((lat, lon))
            msoa_ll[msoa].append((lat, lon))
    def centroid(pts):
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    lsoa_c = {k: centroid(v) for k, v in lsoa_ll.items()}
    msoa_c = {k: centroid(v) for k, v in msoa_ll.items()}
    pcs, n_fill = [], 0
    for pc, lat, lon, lsoa, msoa in raw_pcs:
        if lat is None or lon is None:
            if lsoa in lsoa_c:
                lat, lon = lsoa_c[lsoa]
            elif msoa in msoa_c:
                lat, lon = msoa_c[msoa]
            else:
                continue
            n_fill += 1
        pcs.append((pc, lat, lon))
    log(f"postcodes to score: {len(pcs)} (of {len(raw_pcs)}; {n_fill} via LSOA/MSOA centroid)")

    # --- grid index over good schools (cell ~0.02 deg)
    CELL = 0.02
    def build_index(items):
        idx = {}
        for s in items:
            key = (math.floor(s["lat"] / CELL), math.floor(s["lon"] / CELL))
            idx.setdefault(key, []).append(s)
        return idx
    pri_idx, sec_idx = build_index(pri), build_index(sec)

    def hav_m(lat1, lon1, lat2, lon2):
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = p2 - p1, math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 6371000 * 2 * math.asin(math.sqrt(a))

    def query(lat, lon, idx):
        # expanding ring search for nearest; box scan for 1km count
        best, bestn = None, None
        ring = 0
        while True:
            found = False
            for di in range(-ring, ring + 1):
                for dj in range(-ring, ring + 1):
                    if max(abs(di), abs(dj)) != ring:
                        continue
                    for s in idx.get((math.floor(lat / CELL) + di, math.floor(lon / CELL) + dj), ()):
                        found = True
                        d = hav_m(lat, lon, s["lat"], s["lon"])
                        if best is None or d < best:
                            best, bestn = d, s
            # stop when ring radius (deg->m approx 111km*cell) exceeds best found
            if best is not None and (ring + 1) * CELL * 111000 * 0.6 > best:
                break
            ring += 1
            if ring > 60:
                # sparse fallback: full scan (rare)
                if best is None:
                    for cell in idx.values():
                        for s in cell:
                            d = hav_m(lat, lon, s["lat"], s["lon"])
                            if best is None or d < best:
                                best, bestn = d, s
                break
        cnt = 0
        if best is not None:
            dlat = 1000 / 111000.0
            dlon = 1000 / (111000.0 * max(0.5, math.cos(math.radians(lat))))
            # generous cell sweep around 1km box
            for di in range(-2, 3):
                for dj in range(-2, 3):
                    for s in idx.get((math.floor(lat / CELL) + di, math.floor(lon / CELL) + dj), ()):
                        if abs(s["lat"] - lat) <= dlat and abs(s["lon"] - lon) <= dlon:
                            if hav_m(lat, lon, s["lat"], s["lon"]) <= 1000:
                                cnt += 1
        return bestn, best, cnt

    rows = []
    for i, (pc, lat, lon) in enumerate(pcs):
        if lat is None or lon is None:
            continue
        ps, pd, pcnt = query(lat, lon, pri_idx)
        ss, sd, scnt = query(lat, lon, sec_idx)
        if pd is None or sd is None:
            continue
        bad = min(pd, CAP_M) + min(sd, CAP_M)
        rows.append((pc, ps["urn"], round(pd), ss["urn"], round(sd), pcnt, scnt, bad))
        if (i + 1) % 100000 == 0:
            log(f"  ... {i+1}/{len(pcs)} postcodes")
    rows.sort(key=lambda t: t[-1])
    n = len(rows)
    log(f"scored {n} postcodes")

    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.execute("CREATE TABLE schools(urn TEXT PRIMARY KEY, name TEXT, phase TEXT, lat REAL, lon REAL, rating INTEGER, inspection_date TEXT)")
    out.executemany("INSERT INTO schools VALUES(?,?,?,?,?,?,?)",
                    [(s["urn"], s["name"], s["phase"], s["lat"], s["lon"], s["rating"], s["insp"]) for s in schools])
    out.execute("CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, pri_urn TEXT, pri_m INTEGER, sec_urn TEXT, sec_m INTEGER, pri_good_1km INTEGER, sec_good_1km INTEGER, score REAL)")
    for rank, t in enumerate(rows):
        score = round(rank / (n - 1) * 100, 1) if n > 1 else 0.0
        out.execute("INSERT INTO postcode_metrics VALUES(?,?,?,?,?,?,?,?)", (*t[:-1], score))
    out.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    out.executemany("INSERT INTO meta VALUES(?,?)", [
        ("asof_gias", f"{asof[:4]}-{asof[4:6]}-{asof[6:8]}"),
        ("asof_ofsted", "2026-09-30"),
        ("n_schools", str(len(schools))),
        ("n_good", str(n_good)),
        ("n_postcodes", str(n)),
    ])
    out.execute("CREATE INDEX ix_pm ON postcode_metrics(postcode)")
    out.commit()
    size = os.path.getsize(OUT)
    log(f"wrote {OUT} ({size/1e6:.1f} MB)")
    out.close()

if __name__ == "__main__":
    main()
