"""London postcode table: postcode -> OA/LSOA/MSOA/borough, postcode sector, lat/long.

Sources (both OGL):
- ONS Postcode to OA (2021) to LSOA to MSOA to LAD (May 2026) Best Fit Lookup (ArcGIS item 2713c3a627454ff88add814226264d77)
- OS Code-Point Open (postcode unit centroids, British National Grid)
Output: data/street/postcodes_london.parquet
"""
import os, zipfile, duckdb
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, "data", "street")

for z, sub in [("pcd_lookup.zip", "pcd"), ("codepo.zip", "codepo")]:
    dst = os.path.join(D, sub)
    if not os.path.exists(dst):
        zipfile.ZipFile(os.path.join(D, z)).extractall(dst)

con = duckdb.connect()
lookup = [os.path.join(D, "pcd", f) for f in os.listdir(os.path.join(D, "pcd")) if f.endswith(".csv")][0]
cp_cols = "{'pc':'VARCHAR','pqi':'INT','e':'DOUBLE','n':'DOUBLE','cc':'VARCHAR','a':'VARCHAR','b':'VARCHAR','c':'VARCHAR','lad':'VARCHAR','ward':'VARCHAR'}"
rows = con.execute(f"""
  WITH lu AS (
    SELECT upper(trim(pcds)) AS postcode, oa21cd, lsoa21cd, lsoa21nm, msoa21cd, msoa21nm, ladcd, ladnm, doterm
    FROM read_csv('{lookup}', header=true, all_varchar=true)
    WHERE ladcd LIKE 'E09%'
  ), cp AS (
    SELECT upper(regexp_replace(pc, '\\s+', '', 'g')) AS pc7, e, n
    FROM read_csv('{D}/codepo/Data/CSV/*.csv', header=false, columns={cp_cols})
  )
  SELECT lu.*, split_part(lu.postcode, ' ', 1) || ' ' || left(split_part(lu.postcode, ' ', 2), 1) AS sector,
         split_part(lu.postcode, ' ', 1) AS district_pc, cp.e, cp.n
  FROM lu LEFT JOIN cp ON cp.pc7 = replace(lu.postcode, ' ', '')
""").fetchall()
cols = [d[0] for d in con.description]

tf = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
ei, ni = cols.index("e"), cols.index("n")
out = []
for r in rows:
    lon = lat = None
    if r[ei] is not None:
        lon, lat = tf.transform(r[ei], r[ni])
    out.append(tuple(r) + (lat, lon))
con.execute("CREATE TABLE pc (" + ", ".join(f"{c} VARCHAR" if c not in ("e", "n") else f"{c} DOUBLE" for c in cols) + ", lat DOUBLE, lon DOUBLE)")
con.executemany(f"INSERT INTO pc VALUES ({', '.join(['?'] * (len(cols) + 2))})", out)
con.execute(f"COPY pc TO '{D}/postcodes_london.parquet' (FORMAT parquet)")
print(con.execute("SELECT count(*), count(lat), count(DISTINCT lsoa21cd), count(DISTINCT msoa21cd), count(DISTINCT sector), count(DISTINCT ladcd) FROM pc").fetchone())
