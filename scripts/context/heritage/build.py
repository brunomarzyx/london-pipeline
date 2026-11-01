#!/usr/bin/env python3
"""Build data/context/heritage.db from planning.data.gov.uk datasets.

planning.data.gov.uk CSV snapshots (national):
  conservation-area (10,780 rows), listed-building (382,378 rows),
  article-4-direction-area (7,649 rows).
Rows with end-date (expired designations) excluded. The `organisation`
column is blank in these snapshots, so London filtering is geographic:
listed buildings by POINT in the London bbox; polygons by geometry-bbox
intersection with the London bbox (centroid filtering would wrongly drop
edge-straddling areas).

Signal (planning constraint, direction risk), explainable bands:
  0   - none of the three constraints nearby;
  40  - listed building(s) within 100 m only (setting consideration; no
        direct control on the property itself);
  70  - inside a conservation area and/or an Article 4 direction area
        (direct controls on demolition/alterations/permitted development);
  100 - inside a CA/A4 area AND listed building(s) within 100 m, or inside
        both a CA and an A4 area (compounding controls).
Point-in-polygon uses the even-odd rule over all exterior+interior rings,
which treats holes correctly provided they don't overlap other shells.
"""
import csv, math, os, re, sqlite3
from collections import defaultdict

csv.field_size_limit(10 ** 9)
RAW = "data/raw/heritage"
OUT = "data/context/heritage.db"
LOG = "logs/heritage.log"
LON0, LON1, LAT0, LAT1 = -0.55, 0.35, 51.28, 51.70
CELL = 0.02

def log(msg):
    print(msg, flush=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")

def parse_point(s):
    m = re.match(r"POINT \((-?[\d.]+) (-?[\d.]+)\)", s or "")
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)

def parse_rings(geom):
    """All linear rings of a MULTIPOLYGON WKT as [(lon,lat)...] lists."""
    rings = []
    for grp in re.findall(r"\(([^()]+)\)", geom or ""):
        pts = []
        for pair in grp.split(","):
            xy = pair.strip().split()
            if len(xy) == 2:
                try:
                    pts.append((float(xy[0]), float(xy[1])))
                except ValueError:
                    pass
        if len(pts) >= 4:
            rings.append(pts)
    return rings

def point_in_rings(lon, lat, rings):
    inside = False
    for ring in rings:
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % n]
            if (y1 > lat) != (y2 > lat):
                if lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                    inside = not inside
    return inside

def hav_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))

def main():
    # --- listed buildings (points)
    listed = []  # (lon, lat, name, grade)
    n_lb = 0
    with open(f"{RAW}/listed-building.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            n_lb += 1
            if row.get("end-date"):
                continue
            x, y = parse_point(row.get("point"))
            if x is None:
                continue
            if LON0 <= x <= LON1 and LAT0 <= y <= LAT1:
                listed.append((x, y, (row.get("name") or "").strip() or None,
                               (row.get("listed-building-grade") or "").strip() or None))
    log(f"listed-building: {n_lb} rows -> {len(listed)} live London points")
    lb_idx = defaultdict(list)
    for x, y, name, grade in listed:
        lb_idx[(math.floor(y / CELL), math.floor(x / CELL))].append((x, y, name, grade))

    # --- polygons: conservation areas + article 4 areas
    cas, a4s = [], []  # (name_or_ref, rings, bbox)
    for ds, store, label in [("conservation-area", cas, "CA"), ("article-4-direction-area", a4s, "A4")]:
        n = end = 0
        with open(f"{RAW}/{ds}.csv", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                n += 1
                if row.get("end-date"):
                    end += 1
                    continue
                rings = parse_rings(row.get("geometry"))
                if not rings:
                    continue
                xs = [p[0] for r in rings for p in r]
                ys = [p[1] for r in rings for p in r]
                bbox = (min(xs), min(ys), max(xs), max(ys))
                if bbox[2] < LON0 or bbox[0] > LON1 or bbox[3] < LAT0 or bbox[1] > LAT1:
                    continue
                name = (row.get("name") or "").strip() or (row.get("reference") or "").strip()
                store.append((name, (row.get("reference") or "").strip(), rings, bbox))
        log(f"{ds}: {n} rows ({end} ended) -> {len(store)} live London {label} polygons")

    def build_poly_index(items):
        idx = defaultdict(list)
        for si, (_, _, rings, bbox) in enumerate(items):
            x0, y0, x1, y1 = bbox
            for ci in range(math.floor(y0 / CELL), math.floor(y1 / CELL) + 1):
                for cj in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
                    idx[(ci, cj)].append(si)
        return idx
    ca_idx, a4_idx = build_poly_index(cas), build_poly_index(a4s)

    def inside_any(lat, lon, items, idx):
        key = (math.floor(lat / CELL), math.floor(lon / CELL))
        for si in idx.get(key, ()):
            name, ref, rings, bbox = items[si]
            x0, y0, x1, y1 = bbox
            if lon < x0 or lon > x1 or lat < y0 or lat > y1:
                continue
            if point_in_rings(lon, lat, rings):
                return name, ref
        return None, None

    # --- postcodes with centroid backfill
    sdb = sqlite3.connect("data/street.db")
    raw_pcs = sdb.execute("SELECT postcode, lat, lon, lsoa, msoa FROM postcodes").fetchall()
    sdb.close()
    lsoa_ll, msoa_ll = defaultdict(list), defaultdict(list)
    for pc, lat, lon, lsoa, msoa in raw_pcs:
        if lat is not None and lon is not None:
            lsoa_ll[lsoa].append((lat, lon))
            msoa_ll[msoa].append((lat, lon))
    lsoa_c = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in lsoa_ll.items()}
    msoa_c = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in msoa_ll.items()}
    pcs = []
    for pc, lat, lon, lsoa, msoa in raw_pcs:
        if lat is None or lon is None:
            if lsoa in lsoa_c:
                lat, lon = lsoa_c[lsoa]
            elif msoa in msoa_c:
                lat, lon = msoa_c[msoa]
            else:
                continue
        pcs.append((pc, lat, lon))

    def listed_near(lat, lon, r_m=100):
        dlat = r_m / 111000.0 + 0.0005
        dlon = r_m / (111000.0 * max(0.5, math.cos(math.radians(lat)))) + 0.0005
        ci0, ci1 = math.floor((lat - dlat) / CELL), math.floor((lat + dlat) / CELL)
        cj0, cj1 = math.floor((lon - dlon) / CELL), math.floor((lon + dlon) / CELL)
        cnt, best, bestn, bestg = 0, None, None, None
        for ci in range(ci0, ci1 + 1):
            for cj in range(cj0, cj1 + 1):
                for x, y, name, grade in lb_idx.get((ci, cj), ()):
                    if abs(y - lat) > dlat or abs(x - lon) > dlon:
                        continue
                    d = hav_m(lat, lon, y, x)
                    if d <= r_m:
                        cnt += 1
                        if best is None or d < best:
                            best, bestn, bestg = d, name, grade
        return cnt, best, bestn, bestg

    rows = []
    stat = defaultdict(int)
    for i, (pc, lat, lon) in enumerate(pcs):
        ca_name, _ = inside_any(lat, lon, cas, ca_idx)
        a4_name, a4_ref = inside_any(lat, lon, a4s, a4_idx)
        cnt, best, bestn, bestg = listed_near(lat, lon)
        in_ca = ca_name is not None
        in_a4 = a4_name is not None
        direct = (1 if in_ca else 0) + (1 if in_a4 else 0)
        if direct >= 2 or (direct >= 1 and cnt > 0):
            score = 100
        elif direct >= 1:
            score = 70
        elif cnt > 0:
            score = 40
        else:
            score = 0
        stat[score] += 1
        rows.append((pc, 1 if in_ca else 0, ca_name, cnt,
                     round(best) if best is not None else None, bestn, bestg,
                     1 if in_a4 else 0, a4_ref, score))
        if (i + 1) % 100000 == 0:
            log(f"  ... {i+1}/{len(pcs)}")
    log(f"scored {len(rows)}; band counts {dict(sorted(stat.items()))}")

    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.execute("CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, in_ca INTEGER, ca_name TEXT, listed_100m INTEGER, nearest_listed_m INTEGER, nearest_listed_name TEXT, nearest_listed_grade TEXT, in_a4 INTEGER, a4_ref TEXT, score REAL)")
    out.executemany("INSERT INTO postcode_metrics VALUES(?,?,?,?,?,?,?,?,?,?)", rows)
    out.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    out.executemany("INSERT INTO meta VALUES(?,?)", [
        ("asof", "2026-11-01"),
        ("source", "planning.data.gov.uk conservation-area, listed-building, article-4-direction-area CSVs"),
        ("n_ca_london", str(len(cas))),
        ("n_listed_london", str(len(listed))),
        ("n_a4_london", str(len(a4s))),
        ("n_postcodes", str(len(rows))),
    ])
    out.execute("CREATE INDEX ix_pm ON postcode_metrics(postcode)")
    out.commit()
    log(f"wrote {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    out.close()

if __name__ == "__main__":
    main()
