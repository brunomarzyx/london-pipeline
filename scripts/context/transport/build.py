#!/usr/bin/env python3
"""Build data/context/transport.db: Elizabeth line proximity + price premium.

Stations: checked list of Elizabeth line stations in Greater London, coords
from TfL open data (Line/elizabeth StopPoints snapshot in data/raw/transport).
Opening dates: Elizabeth-line service since 24 May 2022 (central section);
Bond Street 24 Oct 2022. Surface stations are older stations rebranded from
TfL Rail; through-running Nov 2022, full timetable May 2023 (see docs).

Premium method (honest cross-section): street.db sales cover 2023-10-01 to
2026-09-30 only -- entirely AFTER opening -- so no before/after comparison is
possible. Instead: per borough (LAD), median sale price within 1 km of an
Elizabeth line station vs borough-wide median over the same window, using
indexed postcode lookups. Correlation only; see docs/features/transport.md.
"""
import json, math, os, sqlite3
from collections import defaultdict

RAW = "data/raw/transport"
OUT = "data/context/transport.db"
LOG = "logs/transport.log"

# naptanId -> (display name, Elizabeth-line service start date, note)
LONDON_STATIONS = {
    "910GABWDXR": ("Abbey Wood", "2022-05-24", "central section opens"),
    "910GACTONML": ("Acton Main Line", "2022-05-24", "ex TfL Rail"),
    "910GBONDST": ("Bond Street", "2022-10-24", "opened after central section"),
    "910GCANWHRF": ("Canary Wharf", "2022-05-24", "central section opens"),
    "910GCHDWLHT": ("Chadwell Heath", "2022-05-24", "ex TfL Rail"),
    "910GCUSTMHS": ("Custom House", "2022-05-24", "central section opens"),
    "910GEALINGB": ("Ealing Broadway", "2022-05-24", "ex TfL Rail"),
    "910GFRNDXR": ("Farringdon", "2022-05-24", "central section opens"),
    "910GFRSTGT": ("Forest Gate", "2022-05-24", "ex TfL Rail"),
    "910GGIDEAPK": ("Gidea Park", "2022-05-24", "ex TfL Rail"),
    "910GGODMAYS": ("Goodmayes", "2022-05-24", "ex TfL Rail"),
    "910GHANWELL": ("Hanwell", "2022-05-24", "ex TfL Rail"),
    "910GHAYESAH": ("Hayes & Harlington", "2022-05-24", "ex TfL Rail"),
    "910GHRLDWOD": ("Harold Wood", "2022-05-24", "ex TfL Rail"),
    "910GHTRWAPT": ("Heathrow Terminals 2 & 3", "2022-05-24", "ex TfL Rail"),
    "910GHTRWTM4": ("Heathrow Terminal 4", "2022-05-24", "ex TfL Rail"),
    "910GHTRWTM5": ("Heathrow Terminal 5", "2022-05-24", "ex TfL Rail"),
    "910GILFORD": ("Ilford", "2022-05-24", "ex TfL Rail"),
    "910GLIVSTLL": ("Liverpool Street", "2022-05-24", "central section opens"),
    "910GMANRPK": ("Manor Park", "2022-05-24", "ex TfL Rail"),
    "910GMRYLAND": ("Maryland", "2022-05-24", "ex TfL Rail"),
    "910GPADTLL": ("Paddington", "2022-05-24", "central section opens"),
    "910GROMFORD": ("Romford", "2022-05-24", "ex TfL Rail"),
    "910GSTFD": ("Stratford", "2022-05-24", "ex TfL Rail"),
    "910GSTHALL": ("Southall", "2022-05-24", "ex TfL Rail"),
    "910GSVNKNGS": ("Seven Kings", "2022-05-24", "ex TfL Rail"),
    "910GTOTCTRD": ("Tottenham Court Road", "2022-05-24", "central section opens"),
    "910GWCHAPXR": ("Whitechapel", "2022-05-24", "central section opens"),
    "910GWDRYTON": ("West Drayton", "2022-05-24", "ex TfL Rail"),
    "910GWEALING": ("West Ealing", "2022-05-24", "ex TfL Rail"),
    "910GWOLWXR": ("Woolwich", "2022-05-24", "central section opens"),
}
# Outside Greater London (excluded, documented): Burnham, Brentwood, Iver,
# Langley, Maidenhead, Reading, Shenfield, Slough, Taplow, Twyford.

def log(msg):
    print(msg, flush=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")

def hav_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))

def median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

def main():
    stops = json.load(open(f"{RAW}/tfl_elizabeth_stoppoints.json"))
    by_naptan = {s["naptanId"]: s for s in stops}
    stations = []
    for nid, (name, since, note) in LONDON_STATIONS.items():
        s = by_naptan.get(nid)
        assert s is not None, f"station {nid} {name} missing from TfL snapshot"
        stations.append({"id": nid, "name": name, "lat": s["lat"], "lon": s["lon"],
                         "since": since, "note": note})
    log(f"checked stations in Greater London: {len(stations)}")
    outsiders = sorted(set(by_naptan) - set(LONDON_STATIONS))
    log(f"excluded outside London: {len(outsiders)}")

    # postcode coords with LSOA/MSOA centroid backfill (same approach as schools)
    sdb = sqlite3.connect("data/street.db")
    raw_pcs = sdb.execute("SELECT postcode, lat, lon, lsoa, msoa, lad FROM postcodes").fetchall()
    lsoa_ll, msoa_ll = defaultdict(list), defaultdict(list)
    for pc, lat, lon, lsoa, msoa, lad in raw_pcs:
        if lat is not None and lon is not None:
            lsoa_ll[lsoa].append((lat, lon))
            msoa_ll[msoa].append((lat, lon))
    lsoa_c = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in lsoa_ll.items()}
    msoa_c = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in msoa_ll.items()}
    pcs = []
    for pc, lat, lon, lsoa, msoa, lad in raw_pcs:
        if lat is None or lon is None:
            if lsoa in lsoa_c:
                lat, lon = lsoa_c[lsoa]
            elif msoa in msoa_c:
                lat, lon = msoa_c[msoa]
            else:
                continue
        pcs.append((pc, lat, lon, lad))

    # nearest station per postcode (31 stations: brute force is fine)
    rows = []
    for pc, lat, lon, lad in pcs:
        best, bestd = None, None
        for st in stations:
            d = hav_m(lat, lon, st["lat"], st["lon"])
            if bestd is None or d < bestd:
                best, bestd = st, d
        rows.append((pc, best["name"], round(bestd), bestd, lad))
    rows.sort(key=lambda t: t[3])
    n = len(rows)
    log(f"scored {n} postcodes; median nearest-station dist {rows[n//2][2]} m")

    # premium: indexed sales lookups; near-station = sale postcode within 1 km
    pc_loc = {pc: (lat, lon) for pc, lat, lon, lad in pcs}
    sales = sdb.execute("SELECT price, postcode, lad FROM sales").fetchall()
    sdb.close()
    log(f"sales in window: {len(sales)}")
    near_by_lad, all_by_lad = defaultdict(list), defaultdict(list)
    st_coords = [(st["lat"], st["lon"]) for st in stations]
    for price, salepc, lad in sales:
        loc = pc_loc.get(salepc)
        if loc is None or price is None:
            continue
        all_by_lad[lad].append(price)
        lat, lon = loc
        for slat, slon in st_coords:
            # quick box reject then haversine
            if abs(slat - lat) > 0.012 or abs(slon - lon) > 0.016:
                continue
            if hav_m(lat, lon, slat, slon) <= 1000:
                near_by_lad[lad].append(price)
                break
    win = sdb_meta_window()
    log(f"sales window {win}; LADs with near-station sales: {len(near_by_lad)}")

    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.execute("CREATE TABLE stations(id TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, elizabeth_since TEXT, note TEXT)")
    out.executemany("INSERT INTO stations VALUES(?,?,?,?,?,?)",
                    [(s["id"], s["name"], s["lat"], s["lon"], s["since"], s["note"]) for s in stations])
    out.execute("CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, station_name TEXT, dist_m INTEGER, score REAL, lad TEXT)")
    for rank, (pc, name, dm, _, lad) in enumerate(rows):
        out.execute("INSERT INTO postcode_metrics VALUES(?,?,?,?,?)",
                    (pc, name, dm, round(rank / (n - 1) * 100, 1), lad))
    out.execute("CREATE TABLE borough_premium(lad TEXT PRIMARY KEY, near_n INTEGER, near_median INTEGER, borough_n INTEGER, borough_median INTEGER, premium_pct REAL)")
    for lad, prices in sorted(all_by_lad.items()):
        near = near_by_lad.get(lad, [])
        bm = median(prices)
        if len(near) >= 10 and len(prices) >= 10 and bm:
            nm = median(near)
            prem = round((nm - bm) / bm * 100, 1)
        else:
            nm, prem = (median(near) if near else None), None
        out.execute("INSERT INTO borough_premium VALUES(?,?,?,?,?,?)",
                    (lad, len(near), round(nm) if nm else None, len(prices), round(bm), prem))
    out.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    out.executemany("INSERT INTO meta VALUES(?,?)", [
        ("asof", "2026-09-30"),
        ("sales_window", "2023-10-01 to 2026-09-30"),
        ("n_stations", str(len(stations))),
        ("n_postcodes", str(n)),
        ("central_opening", "2022-05-24"),
    ])
    out.execute("CREATE INDEX ix_pm ON postcode_metrics(postcode)")
    out.commit()
    log(f"wrote {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    out.close()

def sdb_meta_window():
    c = sqlite3.connect("data/street.db")
    r = c.execute("SELECT min(date), max(date) FROM sales").fetchone()
    c.close()
    return f"{r[0]} to {r[1]}"

if __name__ == "__main__":
    main()
