#!/usr/bin/env python3
"""Build data/global.json from BIS bulk downloads (run once, 30 Oct 2026).

Sources (BIS data portal, topic RPP / policy rates / long CPI):
  https://data.bis.org/static/bulk/WS_DPP_csv_col.zip    detailed residential property prices
  https://data.bis.org/static/bulk/WS_LONG_CPI_csv_col.zip  long consumer-price series
  https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip    central bank policy rates (daily)

City series used (BIS Series id, city-level COVERED_AREA):
  London     M:GB:2:1:0:1:0:0  monthly GBP per dwelling (nominal level)
  Paris      Q:FR:2:8:1:1:0:0  quarterly existing-flats index (nominal)
  Berlin     Q:DE:2:1:0:2:6:0  quarterly all-dwellings index (nominal)
  Tel Aviv   M:IL:3:1:0:1:6:0  monthly all-dwellings index (nominal)
  Toronto    Q:CA:3:0:0:2:6:0  quarterly Greater Toronto index (nominal)
  Sao Paulo  M:BR:2:1:0:2:6:0  monthly all-dwellings index (nominal)
  Sydney     Q:AU:2:1:0:2:6:0  quarterly all-dwellings index (nominal)
  Tokyo      M:JP:3:1:0:3:6:0  monthly all-dwellings index (nominal)
Real values are derived at runtime by deflating with national CPI
(never invent: a missing observation stays missing).
"""
import csv
import io
import json
import math
import sys
import urllib.request
import zipfile

DPP_URL = "https://data.bis.org/static/bulk/WS_DPP_csv_col.zip"
CPI_URL = "https://data.bis.org/static/bulk/WS_LONG_CPI_csv_col.zip"
CBPOL_URL = "https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip"

CITIES = [
    {"key": "london", "city": "London", "country": "United Kingdom",
     "country_code": "GB", "rate_code": "GB",
     "series": "M:GB:2:1:0:1:0:0", "freq": "M", "unit": "GBP per dwelling"},
    {"key": "paris", "city": "Paris", "country": "France",
     "country_code": "FR", "rate_code": "XM",
     "series": "Q:FR:2:8:1:1:0:0", "freq": "Q", "unit": "index, existing flats Paris"},
    {"key": "berlin", "city": "Berlin", "country": "Germany",
     "country_code": "DE", "rate_code": "XM",
     "series": "Q:DE:2:1:0:2:6:0", "freq": "Q", "unit": "index, all dwellings Berlin"},
    {"key": "tel-aviv", "city": "Tel Aviv", "country": "Israel",
     "country_code": "IL", "rate_code": "IL",
     "series": "M:IL:3:1:0:1:6:0", "freq": "M", "unit": "index, all dwellings Tel Aviv"},
    {"key": "toronto", "city": "Toronto", "country": "Canada",
     "country_code": "CA", "rate_code": "CA",
     "series": "Q:CA:3:0:0:2:6:0", "freq": "Q", "unit": "index, Greater Toronto"},
    {"key": "sao-paulo", "city": "Sao Paulo", "country": "Brazil",
     "country_code": "BR", "rate_code": "BR",
     "series": "M:BR:2:1:0:2:6:0", "freq": "M", "unit": "index, all dwellings Sao Paulo"},
    {"key": "sydney", "city": "Sydney", "country": "Australia",
     "country_code": "AU", "rate_code": "AU",
     "series": "Q:AU:2:1:0:2:6:0", "freq": "Q", "unit": "index, all dwellings Sydney"},
    {"key": "tokyo", "city": "Tokyo", "country": "Japan",
     "country_code": "JP", "rate_code": "JP",
     "series": "M:JP:3:1:0:3:6:0", "freq": "M", "unit": "index, all dwellings Tokyo"},
]

# Checked but deliberately not included (see data/SOURCES.md).
EXCLUDED = [
    {"city": "Dubai", "reason": "city series ends 2024-04 and BIS has no UAE policy rate"},
    {"city": "New York", "reason": "BIS US city series does not name the metro, so it cannot be labelled"},
    {"city": "Singapore", "reason": "only a national series; cut to keep 8 cities"},
    {"city": "Istanbul", "reason": "city series found; cut to keep 8 cities"},
    {"city": "Seoul", "reason": "city series found; cut to keep 8 cities"},
    {"city": "Mexico City", "reason": "city series found; cut to keep 8 cities"},
]


RAW = {"dpp": "data/raw/bis-dpp-col.zip", "cpi": "data/raw/bis-long-cpi-col.zip",
       "cbpol": "data/raw/bis-cbpol-flat.zip"}


URL_TO_RAW = {DPP_URL: RAW["dpp"], CPI_URL: RAW["cpi"], CBPOL_URL: RAW["cbpol"]}


def fetch_zip(url):
    if url in URL_TO_RAW:
        with open(URL_TO_RAW[url], "rb") as f:
            data = f.read()
    else:
        with urllib.request.urlopen(url, timeout=300) as r:
            data = r.read()
    z = zipfile.ZipFile(io.BytesIO(data))
    name = z.namelist()[0]
    return z.read(name).decode("utf-8")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def main(out_path):
    dpp = list(csv.DictReader(io.StringIO(fetch_zip(DPP_URL))))
    dpp_by_series = {r["Series"]: r for r in dpp}
    time_cols = [c for c in dpp[0].keys() if c[:1].isdigit()]

    cpi = list(csv.DictReader(io.StringIO(fetch_zip(CPI_URL))))
    cpi_monthly = {}
    for r in cpi:
        if r["FREQ"] != "M":
            continue
        vals = [(c, num(r[c])) for c in r if c[:4].isdigit() and num(r[c]) is not None]
        if not vals:
            continue
        # Index-level series (latest value well above a YoY rate).
        if vals[-1][1] > 50:
            cpi_monthly[r["REF_AREA"]] = vals

    print("parsing policy rates (large file, one pass)...", flush=True)
    policy = {}
    reader = csv.DictReader(io.StringIO(fetch_zip(CBPOL_URL)))
    for r in reader:
        area = r["REF_AREA:Reference area"][:2]
        if area not in ("GB", "XM", "IL", "CA", "BR", "AU", "JP"):
            continue
        v = num(r["OBS_VALUE:Observation Value"])
        tp = r["TIME_PERIOD:Time period or range"]
        if v is None or len(tp) < 7:
            continue
        m = tp[:7]
        cur = policy.get((area, m))
        if cur is None or tp > cur[0]:
            policy[(area, m)] = (tp, v)
    policy_m = {}
    for (area, m), (_, v) in policy.items():
        policy_m.setdefault(area, []).append([m, v])
    for area in policy_m:
        policy_m[area].sort()

    cities = []
    for c in CITIES:
        row = dpp_by_series[c["series"]]
        price = [[t, num(row[t])] for t in time_cols if num(row[t]) is not None]
        cities.append({
            **c,
            "nominal": True,
            "price": price,
            "cpi": [[t, v] for t, v in cpi_monthly.get(c["country_code"], [])],
            "policy": policy_m.get(c["rate_code"], []),
        })
        print(f"{c['city']}: {len(price)} price obs "
              f"({price[0][0]}..{price[-1][0]}), "
              f"{len(cities[-1]['cpi'])} CPI, {len(cities[-1]['policy'])} policy months")

    doc = {
        "pulled": "2026-10-30",
        "sources": {"dpp": DPP_URL, "cpi": CPI_URL, "cbpol": CBPOL_URL},
        "note": ("City-level BIS series are nominal; lib/global.ts deflates them "
                 "with national CPI into real indices. Supply data is not comparable "
                 "across cities, so this view is prices and rates only."),
        "cities": cities,
        "checked_not_included": EXCLUDED,
    }
    with open(out_path, "w") as f:
        json.dump(doc, f)
    print("wrote", out_path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/global.json")
