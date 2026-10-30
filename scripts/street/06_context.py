"""Neighbourhood context per LSOA (2021) -> table lsoa_context in data/street.db.

- Deprivation: MHCLG English Indices of Deprivation 2025, File 1 (IMD rank 1 = most deprived of 33,755; decile).
- Transport: TfL PTAL 2015, average access index by LSOA 2011 (London Datastore). Joined on LSOA code;
  LSOAs whose 2011 code changed in 2021 inherit the mean of their MSOA (flagged ptal_imputed = 1).
- Crime: data.police.uk street-level crime, Metropolitan + City of London forces, last CRIME_MONTHS months
  in the latest archive, streamed from the public S3 archive (London members only, ~150 MB of 1.7 GB).
  Counts by LSOA; crime_pctile is the LSOA's percentile within London (100 = most recorded crime).
  Central LSOAs with heavy footfall (West End, stations) rank high on counts that are not resident risk.
Every number is labelled with its source year in the app.
"""
import csv, io, os, sqlite3
import duckdb, openpyxl, requests
from remotezip import RemoteZip

CRIME_MONTHS = 12
ARCHIVE = "https://data.police.uk/data/archive/latest.zip"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = os.path.join(ROOT, "data", "context")
DB = os.path.join(ROOT, "data", "street.db")
PTAL_BANDS = [(0, "0"), (0.01, "1a"), (2.51, "1b"), (5.01, "2"), (10.01, "3"), (15.01, "4"), (20.01, "5"), (25.01, "6a"), (40.01, "6b")]


def ptal_band(ai):
    """TfL PTAL band from an access index (AI) value."""
    band = "0"
    for lo, b in PTAL_BANDS:
        if ai >= lo:
            band = b
    return band


def imd_rows():
    ws = openpyxl.load_workbook(os.path.join(C, "imd2025_file1.xlsx"), read_only=True)["IMD25"]
    it = ws.iter_rows(values_only=True)
    next(it)
    return [(r[0], int(r[4]), int(r[5])) for r in it if r[0] and str(r[2]).startswith("E09")]


def crime_rows():
    url = requests.head(ARCHIVE, allow_redirects=False, timeout=30).headers["location"]
    out = {}
    with RemoteZip(url) as z:
        members = sorted(i.filename for i in z.infolist()
                         if i.filename.endswith(("metropolitan-street.csv", "city-of-london-street.csv")))
        months = sorted({m.split("/")[0] for m in members})[-CRIME_MONTHS:]
        for m in members:
            if m.split("/")[0] not in months:
                continue
            with z.open(m) as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                    l = row.get("LSOA code") or ""
                    if not l.startswith("E01"):
                        continue
                    t = row.get("Crime type", "")
                    c = out.setdefault(l, [0, 0, 0])
                    c[0] += 1
                    c[1] += t == "Burglary"
                    c[2] += t == "Violence and sexual offences"
    return out, months[0], months[-1]


def main():
    imd = imd_rows()
    crime, m0, m1 = crime_rows()
    db = sqlite3.connect(DB)
    lsoas = [r[0] for r in db.execute("SELECT DISTINCT lsoa, msoa FROM postcodes WHERE lsoa LIKE 'E01%'")]
    msoa_of = dict(db.execute("SELECT DISTINCT lsoa, msoa FROM postcodes WHERE lsoa LIKE 'E01%'").fetchall())
    ptal = {}
    with open(os.path.join(C, "ptal_lsoa2011.csv")) as f:
        for r in csv.DictReader(f):
            ptal[r["LSOA2011"]] = float(r["AvPTAI2015"])
    # MSOA mean for LSOAs whose code changed between 2011 and 2021.
    by_msoa = {}
    for l in lsoas:
        if l in ptal:
            by_msoa.setdefault(msoa_of[l], []).append(ptal[l])
    imd_d = {l: (rank, dec) for l, rank, dec in imd}
    con = duckdb.connect()
    rows = []
    for l in lsoas:
        ai, imputed = ptal.get(l), 0
        if ai is None and by_msoa.get(msoa_of[l]):
            ai, imputed = sum(by_msoa[msoa_of[l]]) / len(by_msoa[msoa_of[l]]), 1
        rank, dec = imd_d.get(l, (None, None))
        cr = crime.get(l, [0, 0, 0]) if crime else [None, None, None]
        rows.append((l, rank, dec, None if ai is None else round(ai, 1), None if ai is None else ptal_band(ai), imputed,
                     cr[0], cr[1], cr[2]))
    con.execute("CREATE TABLE t (lsoa VARCHAR, imd_rank INT, imd_decile INT, ptai DOUBLE, ptal VARCHAR, ptal_imputed INT, crime_12m INT, burglary_12m INT, violence_12m INT)")
    con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?)", rows)
    df = con.execute("SELECT *, round(100 * percent_rank() OVER (ORDER BY crime_12m)) AS crime_pctile FROM t").df()
    db.execute("DROP TABLE IF EXISTS lsoa_context")
    df.to_sql("lsoa_context", db, index=False)
    db.execute("CREATE INDEX ix_ctx ON lsoa_context(lsoa)")
    for k, v in {"crime_window": f"{m0} to {m1}", "context_source": "MHCLG IoD 2025 (File 1); TfL PTAL 2015 by LSOA; data.police.uk street crime (Met + City)"}.items():
        db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (k, v))
    db.commit()
    n = len(rows)
    print(f"LSOAs {n}; IMD {df.imd_rank.notna().sum()}; PTAL {df.ptai.notna().sum()} (imputed {int(df.ptal_imputed.sum())}); "
          f"crime>0 {(df.crime_12m > 0).sum()}; window {m0}..{m1}; total crimes {int(df.crime_12m.sum())}")


if __name__ == "__main__":
    main()
