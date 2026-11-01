"""Download LAEI 2022 modelled annual-mean concentration grids.

Source: London Datastore, "London Atmospheric Emissions Inventory (LAEI) 2022"
(task allows LAEI 2019 or newest; 2022 published Aug 2025 supersedes 2019).
File: LAEI2022-Concentrations-Data-CSV.zip (~189 MB) with 20 m OSGB grids for
NO2, PM2.5, etc. Skips download when the zip is already present.

Usage: .venv/bin/python scripts/context/air/download.py
"""
import os
import ssl
import sys
import urllib.request

URL = "https://data.london.gov.uk/download/2lg5g/7jy/LAEI2022-Concentrations-Data-CSV.zip"
RAW_DIR = os.path.join("data", "raw", "air")
OUT = os.path.join(RAW_DIR, "LAEI2022-Concentrations-Data-CSV.zip")
LOG = os.path.join("logs", "air.log")
EXPECT = 188904001


def log(msg):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    if os.path.exists(OUT) and os.path.getsize(OUT) == EXPECT:
        log(f"download: {OUT} already present ({EXPECT} bytes), skipping")
        return 0
    try:
        import certifi

        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    log(f"download: streaming {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "lp-env-hackathon/1.0"})
    Mog = 0
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        with open(OUT, "wb") as f:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                Mog += len(chunk)
                if Mog % (20 << 20) < (1 << 20):
                    print(f"  ...{Mog >> 20} MB", flush=True)
    log(f"download: wrote {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    sys.exit(main() or 0)
