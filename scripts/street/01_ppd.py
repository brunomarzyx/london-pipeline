"""Download HM Land Registry Price Paid yearly files and keep Greater London only.

Source: HM Land Registry Price Paid Data (OGL v3). One CSV per year, no header.
Output: data/street/ppd_london.parquet (one row per transaction, 2016 onwards).
Raw national files are deleted after filtering to save disk.
"""
import os, subprocess, duckdb

BASE = "http://prod2.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com"
YEARS = range(2016, 2027)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TMP = os.path.join(ROOT, "data", "street", "tmp")
OUT = os.path.join(ROOT, "data", "street")
COLS = ["txn_id", "price", "date", "postcode", "property_type", "old_new", "duration",
        "paon", "saon", "street", "locality", "town", "district", "county",
        "ppd_category", "record_status"]

os.makedirs(TMP, exist_ok=True)
con = duckdb.connect()
parts = []
for y in YEARS:
    part = os.path.join(TMP, f"ppd_{y}.parquet")
    parts.append(part)
    if os.path.exists(part):
        print(y, "already done"); continue
    csv = os.path.join(TMP, f"pp-{y}.csv")
    subprocess.run(["curl", "-sfL", "--retry", "3", "-o", csv, f"{BASE}/pp-{y}.csv"], check=True)
    cols = ", ".join(f"'{c}': 'VARCHAR'" for c in COLS)
    con.execute(f"""
        COPY (
          SELECT txn_id, CAST(price AS BIGINT) AS price, CAST(date AS TIMESTAMP)::DATE AS date,
                 upper(trim(postcode)) AS postcode, property_type, old_new, duration,
                 paon, saon, upper(trim(street)) AS street, locality, town, district, ppd_category, record_status
          FROM read_csv('{csv}', header=false, columns={{{cols}}}, quote='"')
          WHERE county = 'GREATER LONDON'
        ) TO '{part}' (FORMAT parquet)""")
    n = con.execute(f"SELECT count(*) FROM '{part}'").fetchone()[0]
    os.remove(csv)
    print(y, n, "London rows", flush=True)

con.execute(f"COPY (SELECT * FROM read_parquet({parts!r})) TO '{OUT}/ppd_london.parquet' (FORMAT parquet)")
print("total", con.execute(f"SELECT count(*), min(date), max(date) FROM '{OUT}/ppd_london.parquet'").fetchone())
