#!/usr/bin/env python3
"""Build data/context/greenspace.db from OS Open Greenspace (TQ GML).

Signal: distance to nearest public park/garden/playing-field access point +
public green area within 800 m. Score = mean of the London percentile of
distance (badness) and the London percentile of -area, i.e. equal weights:
a family buyer needs green space both near and of usable size (stated here
and in docs/features/greenspace.md). Precomputed per postcode.

Area rule (documented): each site's area from its exterior ring(s) via
shoelace in OSGB36 metres; a site counts toward a postcode's 800 m total when
the postcode is inside the polygon or within 800 m of its edge (exact
point-in-polygon / point-segment test in local metres). Interior holes are
not subtracted, and overlapping designations (e.g. a playing field inside a
park) count twice, so the total is capped at the 800 m circle area
(pi*800^2 m2) and labelled an upper-bound estimate.
"""
import math, os, re, sqlite3
from collections import defaultdict

RAW_DIR = "data/raw/greenspace/OS Open Greenspace (GML) TQ/data"
OUT = "data/context/greenspace.db"
LOG = "logs/greenspace.log"
KEEP_FUNCTIONS = {"Public Park Or Garden", "Playing Field"}

def log(msg):
    print(msg, flush=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")

def ring_area(pts):
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2

def hav_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))

def main():
    import glob
    gmls = glob.glob(f"{RAW_DIR}/*.gml")
    assert gmls, "no GML in data/raw/greenspace (download TQ GML first)"
    src = open(gmls[0], encoding="utf-8").read()
    log(f"parsed {os.path.basename(gmls[0])} ({len(src)/1e6:.1f} MB)")

    # --- sites: id -> (function, name, exteriors)
    sites = {}
    for m in re.finditer(r'<ogsp:GreenspaceSite gml:id="([^"]+)">(.*?)</ogsp:GreenspaceSite>', src, re.S):
        sid, body = m.group(1), m.group(2)
        fn = re.search(r'<ogsp:function[^>]*>([^<]+)</ogsp:function>', body)
        nm = re.search(r'<ogsp:distinctiveName1>([^<]*)</ogsp:distinctiveName1>', body)
        exts = re.findall(r'<gml:exterior>.*?<gml:posList>([^<]+)</gml:posList>', body, re.S)
        rings = []
        for e in exts:
            nums = list(map(float, e.split()))
            rings.append([(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)])
        sites[sid] = (fn.group(1) if fn else None, nm.group(1) if nm else None, rings)
    log(f"sites total {len(sites)}")

    # --- access points for kept functions
    ap = []  # (easting, northing, site_id)
    for m in re.finditer(r'<ogsp:AccessPoint gml:id="[^"]+">(.*?)</ogsp:AccessPoint>', src, re.S):
        body = m.group(1)
        ref = re.search(r'<ogsp:refToGreenspaceSite>([^<]+)</ogsp:refToGreenspaceSite>', body)
        pos = re.search(r'<gml:pos>([^<]+)</gml:pos>', body)
        if not ref or not pos:
            continue
        fn = sites.get(ref.group(1), (None,))[0]
        if fn not in KEEP_FUNCTIONS:
            continue
        e, n_ = map(float, pos.group(1).split())
        ap.append((e, n_, ref.group(1)))
    kept = {sid: v for sid, v in sites.items() if v[0] in KEEP_FUNCTIONS}
    log(f"kept sites {len(kept)} ({sorted(KEEP_FUNCTIONS)}); access points {len(ap)}")

    from pyproj import Transformer
    tr = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)

    # site areas + centroids (WGS84); keep exterior rings in WGS84 for
    # precise point-in-polygon / edge-distance tests (centroid rule alone
    # understates big sites like Hampstead Heath).
    site_rows = []
    site_polys = []  # (area, [(lon,lat)...], bbox)
    for sid, (fn, name, rings) in kept.items():
        area = sum(ring_area(r) for r in rings)
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        if not xs:
            continue
        ce, cn = sum(xs) / len(xs), sum(ys) / len(ys)
        clon, clat = tr.transform(ce, cn)
        site_rows.append((sid, name, fn, area, clat, clon))
        ll_rings = []
        for r in rings:
            rx = [p[0] for p in r]
            ry = [p[1] for p in r]
            lo, la = tr.transform(rx, ry)
            ll_rings.append(list(zip(lo, la)))
        los = [p[0] for r in ll_rings for p in r]
        las = [p[1] for r in ll_rings for p in r]
        site_polys.append((area, ll_rings, (min(los), min(las), max(los), max(las))))
    log(f"sites with geometry {len(site_rows)}")

    # access points to WGS84 (batch)
    es = [a[0] for a in ap]
    ns = [a[1] for a in ap]
    lons, lats = tr.transform(es, ns)
    ap_ll = list(zip(lats, lons, [a[2] for a in ap]))

    # grid indexes (cell ~0.02 deg)
    CELL = 0.02
    ap_idx = defaultdict(list)
    for la, lo, sid in ap_ll:
        ap_idx[(math.floor(la / CELL), math.floor(lo / CELL))].append((la, lo))
    # index each site in every grid cell its bbox touches (big sites span cells)
    st_idx = defaultdict(list)
    for si, (area, rings, bbox) in enumerate(site_polys):
        x0, y0, x1, y1 = bbox
        for ci in range(math.floor(y0 / CELL), math.floor(y1 / CELL) + 1):
            for cj in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
                st_idx[(ci, cj)].append(si)

    def nearest_ap(lat, lon):
        best = None
        ring = 0
        while True:
            for di in range(-ring, ring + 1):
                for dj in range(-ring, ring + 1):
                    if max(abs(di), abs(dj)) != ring:
                        continue
                    for la, lo in ap_idx.get((math.floor(lat / CELL) + di, math.floor(lon / CELL) + dj), ()):
                        d = hav_m(lat, lon, la, lo)
                        if best is None or d < best:
                            best = d
            if best is not None and (ring + 1) * CELL * 111000 * 0.6 > best:
                break
            ring += 1
            if ring > 60:
                if best is None:  # full scan fallback
                    for cell in ap_idx.values():
                        for la, lo in cell:
                            d = hav_m(lat, lon, la, lo)
                            if best is None or d < best:
                                best = d
                break
        return best

    def point_in_ring(lon, lat, ring):
        inside = False
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % n]
            if (y1 > lat) != (y2 > lat):
                if lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                    inside = not inside
        return inside

    def area_within(lat, lon, r_m=800):
        # equirectangular metres around postcode; precise per-site test:
        # inside polygon OR min edge distance <= r_m -> count full site area.
        kx = 111000.0 * max(0.5, math.cos(math.radians(lat)))
        ky = 111000.0
        dlat = r_m / ky + 0.002
        dlon = r_m / kx + 0.002
        ci0, ci1 = math.floor((lat - dlat) / CELL), math.floor((lat + dlat) / CELL)
        cj0, cj1 = math.floor((lon - dlon) / CELL), math.floor((lon + dlon) / CELL)
        cand = set()
        for ci in range(ci0, ci1 + 1):
            for cj in range(cj0, cj1 + 1):
                cand.update(st_idx.get((ci, cj), ()))
        total = 0.0
        for si in cand:
            area, rings, bbox = site_polys[si]
            x0, y0, x1, y1 = bbox
            if x1 < lon - dlon or x0 > lon + dlon or y1 < lat - dlat or y0 > lat + dlat:
                continue
            hit = False
            for ring in rings:
                if point_in_ring(lon, lat, ring):
                    hit = True
                    break
                for i in range(len(ring)):
                    ax, ay = ring[i]
                    bx, by = ring[(i + 1) % len(ring)]
                    # point-segment distance in local metres
                    px, py = (lon - ax) * kx, (lat - ay) * ky
                    dx, dy = (bx - ax) * kx, (by - ay) * ky
                    L2 = dx * dx + dy * dy
                    t = (px * dx + py * dy) / L2 if L2 else 0.0
                    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                    ex, ey = px - t * dx, py - t * dy
                    if ex * ex + ey * ey <= r_m * r_m:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                total += area
        return total

    # postcodes with centroid backfill
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

    CIRCLE_M2 = math.pi * 800 * 800  # upper bound: green cannot exceed the 800 m circle
    dists, areas, rows = [], [], []
    for i, (pc, lat, lon) in enumerate(pcs):
        d = nearest_ap(lat, lon)
        a = min(area_within(lat, lon), CIRCLE_M2)
        if d is None:
            continue
        dists.append(d)
        areas.append(a)
        rows.append((pc, round(d), round(a)))
        if (i + 1) % 100000 == 0:
            log(f"  ... {i+1}/{len(pcs)}")
    n = len(rows)
    # percentile ranks (bisect_left on sorted arrays)
    sd = sorted(dists)
    sa = sorted(areas)
    import bisect
    log(f"scored {n}; median AP dist {sd[n//2]:.0f} m; median area800 {sa[n//2]/10000:.1f} ha")

    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.execute("CREATE TABLE sites(id TEXT PRIMARY KEY, name TEXT, function TEXT, area_m2 REAL, clat REAL, clon REAL)")
    out.executemany("INSERT INTO sites VALUES(?,?,?,?,?,?)", site_rows)
    out.execute("CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, ap_m INTEGER, area_800m INTEGER, score REAL)")
    for (pc, dm, am), d, a in zip(rows, dists, areas):
        pd = bisect.bisect_left(sd, d) / (n - 1) * 100 if n > 1 else 0
        pa = bisect.bisect_left(sa, a) / (n - 1) * 100 if n > 1 else 0
        score = round((pd + (100 - pa)) / 2, 1)
        out.execute("INSERT INTO postcode_metrics VALUES(?,?,?,?)", (pc, dm, am, score))
    out.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    out.executemany("INSERT INTO meta VALUES(?,?)", [
        ("asof", "2026-11-01"),
        ("source", "OS Open Greenspace TQ (GML) via OS Data Hub downloads API"),
        ("n_sites", str(len(site_rows))),
        ("n_access_points", str(len(ap_ll))),
        ("n_postcodes", str(n)),
    ])
    out.execute("CREATE INDEX ix_pm ON postcode_metrics(postcode)")
    out.commit()
    log(f"wrote {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    out.close()

if __name__ == "__main__":
    main()
