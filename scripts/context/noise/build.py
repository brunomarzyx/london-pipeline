"""Build data/context/noise.db: per-postcode Defra Round 4 road/rail Lden.

Input: data/raw/noise/{road,rail}-lden-london.tif (10 m OSGB float32 GeoTIFFs,
see download.py). Minimal pure-stdlib tiled-TIFF reader; sample at postcode
eastings/northings (WGS84->OSGB Helmert, same maths as the air builder).

Bands (WHO/END banding): <55 dB low, 55-65 medium, 65-70 high, >70 very high.
Values <= 0 read from the grid mean "below the mapping threshold" and count as
low. Score from the noisier of road/rail: low -> 15, medium -> 50, high -> 80,
very high -> 95 (equal-ish steps on the 4-point ordinal band scale, headroom at
both ends).

Usage: .venv/bin/python scripts/context/noise/build.py
"""
import math
import os
import sqlite3
import struct

RAW_DIR = os.path.join("data", "raw", "noise")
STREET = os.path.join("data", "street.db")
OUT = os.path.join("data", "context", "noise.db")
LOG = os.path.join("logs", "noise.log")

TIFFS = {"road": "road-lden-london.tif", "rail": "rail-lden-london.tif"}
SCORE = {"low": 15, "medium": 50, "high": 80, "very high": 95}
ORDER = ["low", "medium", "high", "very high"]


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def read_float_tiff(path):
    """Return (W, H, x0, y1, px, data) for a tiled/striped float32 TIFF.
    x0/y1 = top-left corner in grid CRS; px = pixel size. data = list of rows
    (top row first) of floats."""
    with open(path, "rb") as f:
        d = f.read()
    endian = ">" if d[:2] == b"MM" else "<"
    off = struct.unpack(endian + "I", d[4:8])[0]
    n = struct.unpack(endian + "H", d[off: off + 2])[0]
    tags = {}
    for i in range(n):
        tag, typ, cnt, raw = struct.unpack(endian + "HHI4s", d[off + 2 + i * 12: off + 2 + (i + 1) * 12])
        v = struct.unpack(endian + "I", raw)[0]
        if typ == 3 and cnt == 1:
            v = struct.unpack(endian + "H", raw[:2])[0]
        elif typ == 4 and cnt > 1:
            v = struct.unpack(endian + f"{cnt}I", d[v: v + 4 * cnt])
        elif typ == 12 and cnt > 1:
            v = struct.unpack(endian + f"{cnt}d", d[v: v + 8 * cnt])
        tags[tag] = v
    W, H = tags[256], tags[257]
    assert tags[258] == 32 and tags.get(339, 3) == 3, tags  # float32
    tw, th = tags.get(322, W), tags.get(323, tags.get(278, H))
    offs = tags[324] if isinstance(tags[324], tuple) else (tags[324],)
    counts = tags[325] if isinstance(tags[325], tuple) else (tags[325],)
    # georeference: model tiepoint (33922) + pixel scale (33550), or
    # model transformation matrix (34264): x = m[0]*i + m[1]*j + m[3], etc.
    tie = tags.get(33922)
    scale = tags.get(33550)
    if tie is not None and scale is not None:
        x0 = tie[3] - tie[0] * scale[0]
        y1 = tie[4] - tie[1] * scale[1]
        px = scale[0]
    else:
        m = tags[34264]
        x0, px = m[3], m[0]
        y1 = m[7]
        assert abs(m[1]) < 1e-9 and abs(m[4]) < 1e-9 and abs(m[5] + px) < 1e-9, m[:8]
    data = [[0.0] * W for _ in range(H)]
    ntx = (W + tw - 1) // tw
    for t, (to, tc) in enumerate(zip(offs, counts)):
        tx, ty = t % ntx, t // ntx
        npx = tc // 4
        vals = struct.unpack(endian + f"{npx}f", d[to: to + tc])
        for k, v in enumerate(vals):
            ix, iy = tx * tw + (k % tw), ty * th + (k // tw)
            if ix < W and iy < H:
                data[iy][ix] = v
    return W, H, x0, y1, px, data


def wgs_to_osgb(lat, lon):
    a1, b1 = 6378137.0, 6356752.3141
    e2 = 1 - (b1 * b1) / (a1 * a1)
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    v = a1 / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
    x = v * math.cos(lat_r) * math.cos(lon_r)
    y = v * math.cos(lat_r) * math.sin(lon_r)
    z = v * (1 - e2) * math.sin(lat_r)
    tx, ty, tz = -446.448, 125.157, -542.060
    s = 20.4894e-6
    sec = math.pi / (180 * 3600)
    rx, ry, rz = -0.1502 * sec, -0.2470 * sec, -0.8421 * sec
    x2 = tx + (1 + s) * x - rz * y + ry * z
    y2 = ty + rz * x + (1 + s) * y - rx * z
    z2 = tz - ry * x + rx * y + (1 + s) * z
    a, b = 6377563.396, 6356256.910
    e2a = 1 - (b * b) / (a * a)
    p = math.hypot(x2, y2)
    lon2 = math.atan2(y2, x2)
    lat2 = math.atan2(z2, p * (1 - e2a))
    for _ in range(5):
        v = a / math.sqrt(1 - e2a * math.sin(lat2) ** 2)
        lat2 = math.atan2(z2 + e2a * v * math.sin(lat2), p)
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
    return (
        E0 + v * cosB * dL + v / 6 * cosB**3 * (v / p2 - tanB * tanB) * dL**3
        + v / 120 * cosB**5 * (5 - 18 * tanB * tanB + tanB**4 + 14 * eta2
                              - 58 * tanB * tanB * eta2) * dL**5,
        M + N0 + v / 2 * sinB * cosB * dL**2
        + v / 24 * sinB * cosB**3 * (5 - tanB * tanB + 9 * eta2) * dL**4
        + v / 720 * sinB * cosB**5 * (61 - 58 * tanB * tanB + tanB**4) * dL**6,
    )


def band(db):
    if db is None or db <= 0:
        return "low"
    if db < 55:
        return "low"
    if db < 65:
        return "medium"
    if db < 70:
        return "high"
    return "very high"


def main():
    grids = {}
    for k, name in TIFFS.items():
        W, H, x0, y1, px, data = read_float_tiff(os.path.join(RAW_DIR, name))
        grids[k] = (x0, y1, px, W, H, data)
        log(f"grid {k}: {W}x{H} px={px} origin=({x0:.0f},{y1:.0f})")
    sdb = sqlite3.connect(STREET)
    pcs = sdb.execute("SELECT postcode, lat, lon FROM postcodes").fetchall()
    sdb.close()

    def sample(g, E, N):
        x0, y1, px, W, H, data = g
        ix = int(round((E - x0) / px - 0.5))
        iy = int(round((y1 - N) / px - 0.5))
        if 0 <= ix < W and 0 <= iy < H:
            return data[iy][ix]
        return None

    counts = {b: 0 for b in ORDER} | {"both_null": 0}
    out = []
    for pc, lat, lon in pcs:
        if lat is None or lon is None:
            out.append((pc, None, None, None, None))
            counts["both_null"] += 1
            continue
        E, N = wgs_to_osgb(lat, lon)
        rv = sample(grids["road"], E, N)
        lv = sample(grids["rail"], E, N)
        rb, lb = band(rv), band(lv)
        top = rb if ORDER.index(rb) >= ORDER.index(lb) else lb
        out.append((pc, rv, lv, top, SCORE[top]))
        counts[top] += 1
    if os.path.exists(OUT):
        os.remove(OUT)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    db = sqlite3.connect(OUT)
    db.execute("CREATE TABLE noise(postcode TEXT PRIMARY KEY, road_lden REAL, rail_lden REAL, band TEXT, score INTEGER)")
    db.executemany("INSERT INTO noise VALUES (?,?,?,?,?)", out)
    db.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
    db.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("source", "Defra strategic noise mapping Round 4 (2022) Lden, road + rail"),
            ("asof", "2022"),
            ("postcodes", str(len([r for r in out if r[3] is not None]))),
            ("band_shares", ",".join(f"{b}={counts[b]}" for b in ORDER)),
        ],
    )
    db.commit()
    db.close()
    log(f"build: wrote {OUT}: {counts}")


if __name__ == "__main__":
    main()
