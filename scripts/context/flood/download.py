"""Download Environment Agency Flood Zone data, clipped to Greater London.

Source: planning.data.gov.uk dataset "flood-risk-zone" (Digital Land,
authoritative mirror of EA Flood Map for Planning), full CSV streamed once
and filtered to rows whose geometry bbox intersects an expanded London bbox.
Full national file is ~2 GB; only London-intersecting rows are kept.

Usage: .venv/bin/python scripts/context/flood/download.py
"""
import csv
import os
import re
import ssl
import sys
import urllib.request

URL = "https://files.planning.data.gov.uk/dataset/flood-risk-zone.csv"
RAW_DIR = os.path.join("data", "raw", "flood")
OUT = os.path.join(RAW_DIR, "flood-risk-zone-london.csv")
LOG = os.path.join("logs", "flood.log")

# Expanded Greater London bbox (lon/lat) — generous so polygons crossing the
# boundary are kept; exact clipping happens via point-in-polygon in build.py.
LON_MIN, LON_MAX = -0.65, 0.50
LAT_MIN, LAT_MAX = 51.20, 51.80

csv.field_size_limit(sys.maxsize)

NUM = re.compile(r"-?\d+(?:\.\d+)?")


def geom_bbox(wkt):
    nums = NUM.findall(wkt)
    if len(nums) < 4:
        return None
    xs = [float(n) for n in nums[0::2]]
    ys = [float(n) for n in nums[1::2]]
    return (min(xs), min(ys), max(xs), max(ys))


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    log(f"download: streaming {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "lp-env-hackathon/1.0"})
    try:
        import certifi

        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    kept, total = 0, 0
    out_f = open(OUT, "w", newline="")
    writer = None
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        text = (line.decode("utf-8", "replace") for line in resp)
        reader = csv.DictReader(text)
        for row in reader:
            total += 1
            g = row.get("geometry") or ""
            if not g:
                continue
            bb = geom_bbox(g)
            if bb is None:
                continue
            x0, y0, x1, y1 = bb
            if x1 < LON_MIN or x0 > LON_MAX or y1 < LAT_MIN or y0 > LAT_MAX:
                continue
            if writer is None:
                writer = csv.DictWriter(out_f, fieldnames=reader.fieldnames)
                writer.writeheader()
            writer.writerow(row)
            kept += 1
            if kept % 500 == 0:
                print(f"  ...{kept} kept / {total} scanned", flush=True)
    out_f.close()
    log(f"download: kept {kept} of {total} rows -> {OUT}")
    return 0 if kept else 1


if __name__ == "__main__":
    sys.exit(main())
