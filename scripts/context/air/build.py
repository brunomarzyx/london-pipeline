"""Build data/context/air.db: per-postcode LAEI 2022 NO2 and PM2.5.

Input: data/raw/air/LAEI2022-Concentrations-Data-CSV.zip (LAEI2022_V1_NO2.csv,
LAEI2022_V1_PM25.csv — 20 m OSGB grids, modelled 2022 annual means, ug/m3).
Method (pure stdlib):
  1. Convert street.db postcode WGS84 lat/lon to OSGB eastings/northings with a
     WGS84->OSGB36 Helmert transform + Airy 1830 transverse Mercator.
  2. Stream each grid once (rows share a northing, eastings ascend in 20 m
     steps); join postcodes whose northing falls in the row's 20 m band by
     bisection, then pick the nearest cell by easting.
  3. score = London percentile of NO2 (100 = dirtiest).

Usage: .venv/bin/python scripts/context/air/build.py
"""
import bisect
import io
import math
import os
import sqlite3
import zipfile

ZIP = os.path.join("data", "raw", "air", "LAEI2022-Concentrations-Data-CSV.zip")
STREET = os.path.join("data", "street.db")
OUT = os.path.join("data", "context", "air.db")
LOG = os.path.join("logs", "air.log")

FILES = {"no2": "CSV/LAEI2022_V1_NO2.csv", "pm25": "CSV/LAEI2022_V1_PM25.csv"}


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


# --- WGS84 -> OSGB grid (OSTN-lite Helmert, ~2-3 m accuracy, fine for 20 m cells)
def wgs_to_osgb(lat, lon):
    a1, b1 = 6378137.0, 6356752.3141  # WGS84
    e2 = 1 - (b1 * b1) / (a1 * a1)
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    v = a1 / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
    x = v * math.cos(lat_r) * math.cos(lon_r)
    y = v * math.cos(lat_r) * math.sin(lon_r)
    z = v * (1 - e2) * math.sin(lat_r)
    # Helmert WGS84 -> OSGB36
    tx, ty, tz = -446.448, 125.157, -542.060
    s = 20.4894e-6
    sec = math.pi / (180 * 3600)
    rx, ry, rz = -0.1502 * sec, -0.2470 * sec, -0.8421 * sec
    x2 = tx + (1 + s) * x - rz * y + ry * z
    y2 = ty + rz * x + (1 + s) * y - rx * z
    z2 = tz - ry * x + rx * y + (1 + s) * z
    # -> lat/lon on Airy 1830
    a, b = 6377563.396, 6356256.910
    e2a = 1 - (b * b) / (a * a)
    p = math.hypot(x2, y2)
    lon2 = math.atan2(y2, x2)
    lat2 = math.atan2(z2, p * (1 - e2a))
    for _ in range(5):
        v = a / math.sqrt(1 - e2a * math.sin(lat2) ** 2)
        lat2 = math.atan2(z2 + e2a * v * math.sin(lat2), p)
    # Transverse Mercator to grid
    F0, lat0, lon0 = 0.9996012717, math.radians(49), math.radians(-2)
    E0, N0 = 400000.0, -100000.0
    n = (a - b) / (a + b)
    B = lat2
    sinB, cosB, tanB = math.sin(B), math.cos(B), math.tan(B)
    v = a * F0 / math.sqrt(1 - e2a * sinB * sinB)
    p2 = v * (1 - e2a) / (1 - e2a * sinB * sinB)
    eta2 = v / p2 - 1
    M = b * F0 * (
        (1 + n + 5 / 4 * n * n + 5 / 4 * n**3) * (B - lat0)
        - (3 * n + 3 * n * n + 21 / 8 * n**3) * math.sin(B - lat0) * math.cos(B + lat0)
        + (15 / 8 * n * n + 15 / 8 * n**3) * math.sin(2 * (B - lat0)) * math.cos(2 * (B + lat0))
        - 35 / 24 * n**3 * math.sin(3 * (B - lat0)) * math.cos(3 * (B + lat0))
    )
    dL = lon2 - lon0
    I, II = M + N0, v / 2 * sinB * cosB
    III = v / 24 * sinB * cosB**3 * (5 - tanB * tanB + 9 * eta2)
    IIIA = v / 720 * sinB * cosB**5 * (61 - 58 * tanB * tanB + tanB**4)
    IV = v * cosB
    V = v / 6 * cosB**3 * (v / p2 - tanB * tanB)
    VI = v / 120 * cosB**5 * (5 - 18 * tanB * tanB + tanB**4 + 14 * eta2 - 58 * tanB * tanB * eta2)
    N = I + II * dL**2 + III * dL**4 + IIIA * dL**6
    E = E0 + IV * dL + V * dL**3 + VI * dL**5
    return E, N


def sample_grid(member, pts_sorted):
    """pts_sorted: list of [N, E, idx] descending by N. Returns dict idx->conc."""
    z = zipfile.ZipFile(ZIP)
    Ns = [-p[0] for p in pts_sorted]  # ascending key for bisect on -N
    out, cur_y, xs, cs, irregular = {}, None, [], [], 0
    nrows = 0

    def flush():
        nonlocal irregular
        if cur_y is None or not xs:
            return
        lo = bisect.bisect_left(Ns, -(cur_y + 10))
        hi = bisect.bisect_right(Ns, -(cur_y - 10))
        x0 = xs[0]
        step_ok = all(b - a == 20 for a, b in zip(xs, xs[1:]))
        if not step_ok:
            irregular += 1
        for k in range(lo, hi):
            Np, Ep, idx = pts_sorted[k][0], pts_sorted[k][1], pts_sorted[k][2]
            if idx in out:
                continue
            if step_ok:
                i = int(round((Ep - x0) / 20))
                if 0 <= i < len(xs) and abs(Ep - (x0 + 20 * i)) <= 10:
                    out[idx] = cs[i]
            else:
                j = bisect.bisect_left(xs, Ep)
                best = None
                for jj in (j - 1, j):
                    if 0 <= jj < len(xs) and abs(xs[jj] - Ep) <= 10:
                        best = jj
                        break
                if best is not None:
                    out[idx] = cs[best]

    with z.open(member) as f:
        t = io.TextIOWrapper(f)
        t.readline()
        for line in t:
            x, y, c = line.split(",")
            x, y, c = int(x), int(y), float(c)
            if y != cur_y:
                flush()
                nrows += 1
                cur_y, xs, cs = y, [], []
            xs.append(x)
            cs.append(c)
        flush()
    log(f"sample: {member}: {nrows} rows, {len(out)} postcodes matched, irregular={irregular}")
    return out


def main():
    # sanity: Trafalgar Sq (51.5074,-0.1278) ~ TQ300800 -> (530000,180000)
    E, N = wgs_to_osgb(51.5074, -0.1278)
    log(f"helmert check: Trafalgar Sq -> E={E:.0f} N={N:.0f}")
    assert abs(E - 530000) < 500 and abs(N - 180000) < 500, (E, N)

    sdb = sqlite3.connect(STREET)
    pcs = sdb.execute("SELECT postcode, lat, lon FROM postcodes").fetchall()
    sdb.close()
    pts, located = [], 0  # [N, E, postcode]
    for pc, lat, lon in pcs:
        if lat is None or lon is None:
            continue
        E, N = wgs_to_osgb(lat, lon)
        pts.append([N, E, pc])
        located += 1
    pts.sort(key=lambda p: -p[0])
    log(f"build: {located} located postcodes (of {len(pcs)})")

    vals = {k: sample_grid(m, pts) for k, m in FILES.items()}
    both = set(vals["no2"]) & set(vals["pm25"])
    log(f"build: postcodes with both pollutants: {len(both)}")

    no2s = sorted(vals["no2"][pc] for pc in both)
    n = len(no2s)

    def pct(x):
        import bisect as b

        below = b.bisect_left(no2s, x)
        equal = b.bisect_right(no2s, x) - below
        return round(100 * (below + 0.5 * equal) / n) if n else None

    rows = [(pc, vals["no2"][pc], vals["pm25"][pc], pct(vals["no2"][pc])) for pc in both]
    if os.path.exists(OUT):
        os.remove(OUT)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    db = sqlite3.connect(OUT)
    db.execute("CREATE TABLE air(postcode TEXT PRIMARY KEY, no2 REAL, pm25 REAL, score INTEGER)")
    db.executemany("INSERT INTO air VALUES (?,?,?,?)", rows)
    db.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    db.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("source", "GLA/TfL LAEI 2022 modelled concentrations (London Datastore)"),
            ("asof", "2022"),
            ("postcodes", str(len(rows))),
            ("no2_max", str(max(no2s) if no2s else "")),
        ],
    )
    db.commit()
    db.close()
    log(f"build: wrote {OUT} ({len(rows)} postcodes)")


if __name__ == "__main__":
    main()
