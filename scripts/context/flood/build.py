"""Build data/context/flood.db: per-postcode Flood Zone from EA data.

Input: data/raw/flood/flood-risk-zone-london.csv (see download.py).
Source: planning.data.gov.uk dataset "flood-risk-zone" (authoritative mirror
of EA Flood Map for Planning (Rivers and Sea); entry-date 2023-08-24).
Method: parse MULTIPOLYGON WKT (pure Python), grid-index polygons, assign each
postcode in street.db its max overlapping flood-risk-level (2 or 3); postcodes
outside all polygons are Flood Zone 1 (EA definition: FZ1 is all land not in
FZ2/FZ3). Score: FZ1 -> 5, FZ2 -> 55, FZ3 -> 90 (ordinal bands, see docs).

Usage: .venv/bin/python scripts/context/flood/build.py
"""
import csv
import os
import sqlite3
import sys

csv.field_size_limit(sys.maxsize)

RAW = os.path.join("data", "raw", "flood", "flood-risk-zone-london.csv")
STREET = os.path.join("data", "street.db")
OUT = os.path.join("data", "context", "flood.db")
LOG = os.path.join("logs", "flood.log")

SCORE = {1: 5, 2: 55, 3: 90}


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def split_top(s, sep=","):
    parts, depth, cur = [], 0, []
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return parts


def parse_ring(s):
    pts = []
    for pair in s.split(","):
        pair = pair.strip()
        if not pair:
            continue
        x, y = pair.split()[:2]
        pts.append((float(x), float(y)))
    return pts


def parse_multipolygon(wkt):
    """Return list of (exterior, [holes]) with bboxes: ((x0,y0,x1,y1), ext, holes)."""
    inner = wkt[wkt.index("(") + 1: wkt.rindex(")")]
    polys = []
    for poly in split_top(inner):
        poly = poly.strip()
        if poly.startswith("("):
            poly = poly[1:]
        if poly.endswith(")"):
            poly = poly[:-1]
        rings = []
        for r in split_top(poly):
            r = r.strip()
            while len(r) >= 2 and r.startswith("(") and r.endswith(")"):
                r = r[1:-1].strip()
            if r:
                rings.append(parse_ring(r))
        rings = [r for r in rings if len(r) >= 4]
        if not rings:
            continue
        ext, holes = rings[0], rings[1:]
        xs = [p[0] for p in ext]
        ys = [p[1] for p in ext]
        polys.append(((min(xs), min(ys), max(xs), max(ys)), ext, holes))
    return polys


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


class Grid:
    def __init__(self, polys, nx=200, ny=120):
        x0 = min(p[0][0] for p in polys)
        y0 = min(p[0][1] for p in polys)
        x1 = max(p[0][2] for p in polys)
        y1 = max(p[0][3] for p in polys)
        self.x0, self.y0 = x0, y0
        self.dx = (x1 - x0) / nx or 1e-9
        self.dy = (y1 - y0) / ny or 1e-9
        self.nx, self.ny = nx, ny
        self.cells = {}
        for i, p in enumerate(polys):
            (a, b, c, d), _, _ = p
            ix0 = max(0, int((a - x0) / self.dx))
            ix1 = min(nx - 1, int((c - x0) / self.dx))
            iy0 = max(0, int((b - y0) / self.dy))
            iy1 = min(ny - 1, int((d - y0) / self.dy))
            for ix in range(ix0, ix1 + 1):
                for iy in range(iy0, iy1 + 1):
                    self.cells.setdefault((ix, iy), []).append(i)
        self.polys = polys

    def query(self, x, y):
        ix = int((x - self.x0) / self.dx)
        iy = int((y - self.y0) / self.dy)
        if not (0 <= ix < self.nx and 0 <= iy < self.ny):
            return None
        idxs = self.cells.get((ix, iy))
        if not idxs:
            return None
        for i in idxs:
            (a, b, c, d), ext, holes = self.polys[i]
            if not (a <= x <= c and b <= y <= d):
                continue
            if point_in_ring(x, y, ext) and not any(
                point_in_ring(x, y, h) for h in holes
            ):
                return True
        return False


def main():
    polys_by_level = {2: [], 3: []}
    n = 0
    with open(RAW) as f:
        for row in csv.DictReader(f):
            try:
                lvl = int(row["flood-risk-level"])
            except (ValueError, TypeError):
                continue
            if lvl not in (2, 3):
                continue
            g = row.get("geometry") or ""
            if "POLYGON" not in g:
                continue
            try:
                polys = parse_multipolygon(g)
            except (ValueError, IndexError):
                continue
            polys_by_level[lvl].extend(polys)
            n += 1
    log(f"build: parsed {n} rows -> {len(polys_by_level[3])} FZ3 + "
        f"{len(polys_by_level[2])} FZ2 polygons")
    grid3 = Grid(polys_by_level[3]) if polys_by_level[3] else None
    grid2 = Grid(polys_by_level[2]) if polys_by_level[2] else None

    sdb = sqlite3.connect(STREET)
    pcs = list(sdb.execute(
        "SELECT postcode, lat, lon FROM postcodes"))
    sdb.close()
    log(f"build: {len(pcs)} postcodes to classify")

    rows, counts = [], {1: 0, 2: 0, 3: 0}
    unlocated = 0
    for k, (pc, lat, lon) in enumerate(pcs):
        zone = None
        if lat is not None and lon is not None:
            zone = 1
            if grid3 and grid3.query(lon, lat):
                zone = 3
            elif grid2 and grid2.query(lon, lat):
                zone = 2
            counts[zone] += 1
        else:
            unlocated += 1
        rows.append((pc, zone, SCORE.get(zone) if zone else None))
        if (k + 1) % 100000 == 0:
            print(f"  ...{k + 1}", flush=True)

    if os.path.exists(OUT):
        os.remove(OUT)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    db = sqlite3.connect(OUT)
    db.execute("CREATE TABLE flood(postcode TEXT PRIMARY KEY, zone INTEGER, score INTEGER)")
    db.executemany("INSERT INTO flood VALUES (?,?,?)", rows)
    db.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    total = sum(counts.values())
    meta = {
        "source": "planning.data.gov.uk dataset flood-risk-zone (EA Flood Map for Planning mirror)",
        "asof": "2023-08-24",
        "postcodes": str(len(rows)),
        "classified": str(total),
        "unlocated": str(unlocated),
        "share_fz3": f"{counts[3] / total:.4f}",
        "share_fz2": f"{counts[2] / total:.4f}",
        "share_fz1": f"{counts[1] / total:.4f}",
    }
    db.executemany("INSERT INTO meta VALUES (?,?)", meta.items())
    db.commit()
    db.close()
    log(f"build: wrote {OUT}: {counts} shares "
        f"FZ3={counts[3]/total:.3f} FZ2={counts[2]/total:.3f} FZ1={counts[1]/total:.3f}")


if __name__ == "__main__":
    main()
