"""Download Defra strategic noise mapping Round 4 (2022) Lden grids, London clip.

Sources (no login; WCS GetCoverage on the EA/Defra WMS servers):
- road: https://environment.data.gov.uk/spatialdata/road-noise-all-metrics-england-round-4/wcs
  coverage 562c9d56-...__Road_Noise_Lden_England_Round_4_All
- rail: https://environment.data.gov.uk/spatialdata/noise-data/wcs
  coverage 3fb3c2d7-...__Rail_Noise_Lden_England_Round_4_All
10 m OSGB (EPSG:27700) float32 GeoTIFFs, clipped to a padded London bbox.
Skips files already present.

Usage: .venv/bin/python scripts/context/noise/download.py
"""
import os
import ssl
import sys
import urllib.parse
import urllib.request

RAW_DIR = os.path.join("data", "raw", "noise")
LOG = os.path.join("logs", "noise.log")

LAYERS = {
    "road-lden-london.tif": (
        "https://environment.data.gov.uk/spatialdata/road-noise-all-metrics-england-round-4/wcs",
        "562c9d56-7c2d-4d42-83bb-578d6e97a517__Road_Noise_Lden_England_Round_4_All",
    ),
    "rail-lden-london.tif": (
        "https://environment.data.gov.uk/spatialdata/noise-data/wcs",
        "3fb3c2d7-292c-4e0a-bd5b-d8e4e1fe2947__Rail_Noise_Lden_England_Round_4_All",
    ),
}

# Padded Greater-London bbox in EPSG:27700 (postcodes span E 503978-561082,
# N 156844-200536; snapped outwards to whole metres).
E0, E1, N0, N1 = 503400, 561700, 156300, 201100


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    try:
        import certifi

        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    for name, (base, cov) in LAYERS.items():
        out = os.path.join(RAW_DIR, name)
        if os.path.exists(out) and os.path.getsize(out) > 10_000_000:
            log(f"download: {out} present ({os.path.getsize(out)} bytes), skipping")
            continue
        # Build manually: two repeated SUBSET params, which urlencode can't express.
        url = (
            base + "?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID="
            + urllib.parse.quote(cov, safe="")
            + "&SUBSETTINGCRS=" + urllib.parse.quote("http://www.opengis.net/def/crs/EPSG/0/27700", safe="")
            + f"&SUBSET=E({E0},{E1})&SUBSET=N({N0},{N1})&FORMAT=image/tiff"
        )
        log(f"download: {name} <- GetCoverage {cov.split('__')[-1]}")
        req = urllib.request.Request(url, headers={"User-Agent": "lp-env-hackathon/1.0"})
        got = 0
        with urllib.request.urlopen(req, timeout=300, context=ctx) as resp:
            with open(out, "wb") as f:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    got += len(chunk)
                    if got % (20 << 20) < (1 << 20):
                        print(f"  ...{got >> 20} MB", flush=True)
        log(f"download: wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    sys.exit(main() or 0)
