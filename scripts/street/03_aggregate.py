"""Street / sector / LSOA / MSOA / borough price statistics -> data/street.db (SQLite).

Inputs: data/street/ppd_london.parquet, data/street/postcodes_london.parquet
Method (all constants named below, tested in test_aggregate.py):
- Clean: PPD category A (standard market sales) only, types D/S/T/F, price in [MIN_PRICE, MAX_PRICE],
  postcode must map to a London LSOA; drop log-price outliers beyond OUTLIER_IQR x IQR within MSOA x type.
- Levels (median price etc.) use the last LEVEL_MONTHS months. A level is "reliable" only with n >= MIN_N.
- Momentum uses a repeat-sales index (Bailey-Muth-Nourse): pairs of sales of the same address, first sale
  not a new build, annual periods ending in the data's last month. Fitted per MSOA and borough when the area
  has >= MIN_PAIRS pairs; otherwise null (the app falls back to the next level up).
"""
import os, sqlite3, math, duckdb, numpy as np

MIN_PRICE, MAX_PRICE = 50_000, 50_000_000
OUTLIER_IQR = 3.0
LEVEL_MONTHS = 36
MIN_N = 10
MIN_PAIRS = 60
MAX_ABS_ANN_RET = 0.5
MIN_HOLD_YEARS = 0.5

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = os.path.join(ROOT, "data", "street")
DB = os.path.join(ROOT, "data", "street.db")


def clean_sales(con):
    # EPC match is optional: without it the £/sq m columns are simply null.
    epc = os.path.join(S, "epc_match.parquet")
    EPC_SRC = f"'{epc}'" if os.path.exists(epc) else "(SELECT NULL::VARCHAR txn_id, NULL::DOUBLE floor_area, NULL::INT rooms, NULL::VARCHAR rating WHERE false)"
    con.execute(f"""
    CREATE TABLE clean AS
    WITH j AS (
      SELECT p.txn_id, p.price, p.date, p.postcode, p.property_type AS type, p.old_new = 'Y' AS new_build,
             p.duration AS tenure, coalesce(p.saon,'') AS saon, coalesce(p.paon,'') AS paon, p.street,
             pc.sector, pc.district_pc, pc.lsoa21cd AS lsoa, pc.lsoa21nm AS lsoa_nm, pc.msoa21cd AS msoa,
             pc.msoa21nm AS msoa_nm, pc.ladcd AS lad, pc.ladnm AS lad_nm, pc.lat, pc.lon
      FROM '{S}/ppd_london.parquet' p JOIN '{S}/postcodes_london.parquet' pc USING (postcode)
      WHERE p.ppd_category = 'A' AND p.property_type IN ('D','S','T','F')
        AND p.price BETWEEN {MIN_PRICE} AND {MAX_PRICE}
    ), q AS (
      SELECT msoa, type, quantile_cont(ln(price), 0.25) q1, quantile_cont(ln(price), 0.75) q3
      FROM j GROUP BY ALL
    )
    SELECT j.*, CASE WHEN j.street IS NULL OR j.street = '' THEN NULL ELSE j.district_pc || '|' || j.street END AS street_key,
           e.floor_area, e.rooms, e.rating AS epc_rating, round(j.price / e.floor_area) AS ppsm
    FROM j JOIN q USING (msoa, type) LEFT JOIN {EPC_SRC} e USING (txn_id)
    WHERE ln(j.price) BETWEEN q.q1 - {OUTLIER_IQR}*(q.q3-q.q1) AND q.q3 + {OUTLIER_IQR}*(q.q3-q.q1)
    """)


def level_stats(con, asof):
    lv = {"street": ("street_key", "initcap(any_value(street)) || ', ' || any_value(district_pc)"),
          "sector": ("sector", "any_value(sector)"),
          "lsoa": ("lsoa", "any_value(lsoa_nm)"),
          "msoa": ("msoa", "any_value(msoa_nm)"),
          "borough": ("lad", "any_value(lad_nm)"),
          "london": ("'LONDON'", "'London'")}
    parts = []
    for level, (key, name) in lv.items():
        parts.append(f"""
        SELECT '{level}' AS level, {key} AS code, {name} AS name, any_value(lad) AS lad, any_value(lad_nm) AS lad_nm,
          count(*) FILTER (WHERE date > d36) AS n_36m,
          median(price) FILTER (WHERE date > d36) AS med_36m,
          quantile_cont(price, 0.25) FILTER (WHERE date > d36) AS p25_36m,
          quantile_cont(price, 0.75) FILTER (WHERE date > d36) AS p75_36m,
          count(*) FILTER (WHERE date > d36 AND type = 'F') AS n_flat,
          median(price) FILTER (WHERE date > d36 AND type = 'F') AS med_flat,
          quantile_cont(price, 0.25) FILTER (WHERE date > d36 AND type = 'F') AS p25_flat,
          quantile_cont(price, 0.75) FILTER (WHERE date > d36 AND type = 'F') AS p75_flat,
          count(*) FILTER (WHERE date > d36 AND type <> 'F') AS n_house,
          median(price) FILTER (WHERE date > d36 AND type <> 'F') AS med_house,
          quantile_cont(price, 0.25) FILTER (WHERE date > d36 AND type <> 'F') AS p25_house,
          quantile_cont(price, 0.75) FILTER (WHERE date > d36 AND type <> 'F') AS p75_house,
          count(ppsm) FILTER (WHERE date > d36) AS n_ppsm,
          median(ppsm) FILTER (WHERE date > d36) AS med_ppsm,
          count(ppsm) FILTER (WHERE date > d36 AND type = 'F') AS n_ppsm_flat,
          median(ppsm) FILTER (WHERE date > d36 AND type = 'F') AS med_ppsm_flat,
          quantile_cont(ppsm, 0.25) FILTER (WHERE date > d36 AND type = 'F') AS p25_ppsm_flat,
          quantile_cont(ppsm, 0.75) FILTER (WHERE date > d36 AND type = 'F') AS p75_ppsm_flat,
          count(ppsm) FILTER (WHERE date > d36 AND type <> 'F') AS n_ppsm_house,
          median(ppsm) FILTER (WHERE date > d36 AND type <> 'F') AS med_ppsm_house,
          quantile_cont(ppsm, 0.25) FILTER (WHERE date > d36 AND type <> 'F') AS p25_ppsm_house,
          quantile_cont(ppsm, 0.75) FILTER (WHERE date > d36 AND type <> 'F') AS p75_ppsm_house,
          count(*) FILTER (WHERE date > d12) AS n_12m,
          count(*) FILTER (WHERE date > d24 AND date <= d12) AS n_prev12,
          avg(lat) FILTER (WHERE date > d36) AS lat, avg(lon) FILTER (WHERE date > d36) AS lon
        FROM clean, (SELECT DATE '{asof}' - INTERVAL {LEVEL_MONTHS} MONTH AS d36,
                            DATE '{asof}' - INTERVAL 12 MONTH AS d12, DATE '{asof}' - INTERVAL 24 MONTH AS d24)
        WHERE {key} IS NOT NULL GROUP BY {key}""")
    df = con.execute(" UNION ALL ".join(parts)).df()
    df["reliable"] = (df["n_36m"] >= MIN_N).astype(int)
    return df


def period_of(dates, asof):
    """Annual periods ending in the as-of month. Last period = index max."""
    m = dates.astype("datetime64[M]").astype(int)
    a = np.datetime64(asof, "M").astype(int)
    return (a - m) // 12  # 0 = latest 12 months, 1 = the 12 before, ...


def bmn_index(p1, p2, y):
    """Bailey-Muth-Nourse repeat-sales OLS. Periods are 'years ago' (0 = latest). Returns log index by period, base = oldest."""
    T = int(max(p1.max(), p2.max())) + 1
    X = np.zeros((len(y), T))
    X[np.arange(len(y)), p2] += 1
    X[np.arange(len(y)), p1] -= 1
    X = X[:, :-1]  # drop oldest period as base
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return np.append(beta, 0.0)  # index by 'years ago'


def repeat_sales(con, asof):
    pairs = con.execute("""
      WITH s AS (
        SELECT postcode || '|' || paon || '|' || saon AS prop, date, price, new_build, msoa, lad,
               lag(date) OVER w AS d1, lag(price) OVER w AS pr1, lag(new_build) OVER w AS nb1
        FROM clean WINDOW w AS (PARTITION BY postcode, paon, saon ORDER BY date)
      )
      SELECT d1, date AS d2, ln(price::DOUBLE / pr1) AS r, msoa, lad FROM s
      WHERE d1 IS NOT NULL AND NOT nb1
    """).df()
    yrs = (pairs.d2 - pairs.d1).dt.days / 365.25
    pairs = pairs[(yrs >= MIN_HOLD_YEARS) & ((pairs.r / yrs).abs() <= MAX_ABS_ANN_RET)].copy()
    pairs["p1"] = period_of(pairs.d1.values, asof)
    pairs["p2"] = period_of(pairs.d2.values, asof)
    pairs = pairs[pairs.p1 != pairs.p2]
    out = []
    for level, col in [("msoa", "msoa"), ("borough", "lad"), ("london", None)]:
        groups = [("LONDON", pairs)] if col is None else pairs.groupby(col)
        for code, g in groups:
            row = {"level": level, "code": code, "rs_pairs": len(g), "rs_chg_1y": None, "rs_chg_5y": None}
            if len(g) >= MIN_PAIRS and (g.p2 == 0).sum() >= 5:
                idx = bmn_index(g.p1.values, g.p2.values, g.r.values)
                row["rs_chg_1y"] = math.exp(idx[0] - idx[1]) - 1
                if len(idx) > 5:
                    row["rs_chg_5y"] = math.exp(idx[0] - idx[5]) - 1
            out.append(row)
    return out, len(pairs)


def main():
    con = duckdb.connect()
    con.execute("CREATE MACRO initcap(s) AS array_to_string(list_transform(string_split(lower(s), ' '), "
                "lambda w: upper(left(w, 1)) || substr(w, 2)), ' ')")
    clean_sales(con)
    asof = str(con.execute("SELECT max(date) FROM clean").fetchone()[0])
    stats = level_stats(con, asof)
    rs, npairs = repeat_sales(con, asof)
    import pandas as pd
    stats = stats.merge(pd.DataFrame(rs), on=["level", "code"], how="left")

    pcmap = con.execute("""
      WITH sk AS (
        SELECT postcode, arg_max(street_key, n) AS street_key FROM (
          SELECT postcode, street_key, count(*) n FROM clean WHERE street_key IS NOT NULL GROUP BY ALL) GROUP BY postcode)
      SELECT pc.postcode, pc.sector, pc.lsoa21cd AS lsoa, pc.msoa21cd AS msoa, pc.ladcd AS lad, pc.lat, pc.lon, sk.street_key
      FROM '""" + S + """/postcodes_london.parquet' pc LEFT JOIN sk USING (postcode)""").df()
    sales = con.execute(f"""
      SELECT txn_id, date::VARCHAR AS date, price, postcode, type, new_build::INT AS new_build, tenure,
             trim(saon || ' ' || paon || ' ' || coalesce(initcap(street), '')) AS address,
             street_key, sector, lsoa, msoa, lad, lat, lon, floor_area, ppsm, epc_rating
      FROM clean WHERE date > DATE '{asof}' - INTERVAL {LEVEL_MONTHS} MONTH""").df()

    if os.path.exists(DB):
        os.remove(DB)
    db = sqlite3.connect(DB)
    stats.to_sql("area_stats", db, index=False)
    pcmap.to_sql("postcodes", db, index=False)
    sales.to_sql("sales", db, index=False)
    meta = {"asof": asof, "level_months": LEVEL_MONTHS, "min_n": MIN_N, "min_pairs": MIN_PAIRS,
            "clean_sales": con.execute("SELECT count(*) FROM clean").fetchone()[0], "repeat_pairs": npairs,
            "source": "HM Land Registry Price Paid (OGL v3); MHCLG domestic EPC register (floor area); ONS postcode lookup May 2026; OS Code-Point Open"}
    db.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    db.executemany("INSERT INTO meta VALUES (?, ?)", [(k, str(v)) for k, v in meta.items()])
    for sql in ["CREATE INDEX ix_area ON area_stats(level, code)", "CREATE INDEX ix_pc ON postcodes(postcode)",
                "CREATE INDEX ix_sales_sector ON sales(sector, date)", "CREATE INDEX ix_sales_street ON sales(street_key)",
                "CREATE INDEX ix_sales_pc ON sales(postcode)", "CREATE INDEX ix_sales_lsoa ON sales(lsoa, postcode)"]:
        db.execute(sql)
    db.commit()
    print(meta)
    print(stats.groupby("level").agg(n=("code", "size"), reliable=("reliable", "sum"),
                                     rs=("rs_chg_1y", lambda s: s.notna().sum())))


if __name__ == "__main__":
    main()
