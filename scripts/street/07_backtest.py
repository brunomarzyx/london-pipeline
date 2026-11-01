"""Point-in-time backtest of the value-vs-momentum screen (lib/screen.ts) -> data/backtest.json + table screen_backtest.

For each formation date F (31 Dec of 2019..2023) the screen is recomputed using ONLY sales dated <= F:
- cleaning (outlier bounds per MSOA x type) uses sales up to F only;
- £/sq m (LSOA and borough medians) uses the 36 months to F;
- momentum is the same Bailey-Muth-Nourse repeat-sales fit as 03_aggregate.py, on pairs whose second sale is <= F,
  12-month average to F against the 12 months before (annual periods end in December).
The live thresholds are applied unchanged (n >= 10, discount <= -10%, edge > 0, >= 150 pairs, one row per MSOA).

Outcome: forward 1y/2y/3y change in each MSOA's and borough's repeat-sales index (calendar-year periods, one BMN fit
over all pairs to Sep 2026; only complete years are used, so end-2023 has no 3y). A pick "beats" its borough when its
forward change is higher than the borough's, and its control is the mean forward change of the other MSOAs in the same
borough. Run: python3 scripts/street/07_backtest.py  (env STREET_DIR, BACKTEST_DB override inputs / output DB).
"""
import os, sys, json, math, sqlite3, importlib
import numpy as np, pandas as pd, duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
agg = importlib.import_module("03_aggregate")

ROOT = os.path.dirname(os.path.dirname(HERE))
STREET = os.environ.get("STREET_DIR", os.path.join(ROOT, "data", "street"))
OUT_DB = os.environ.get("BACKTEST_DB", os.path.join(ROOT, "data", "street.db"))
OUT_JSON = os.path.join(ROOT, "data", "backtest.json")

# Live screen rules (mirrors lib/screen.ts; test_backtest.py checks they still match).
SCREEN_MIN_N = 10
MAX_DISCOUNT = -0.10
MIN_EDGE = 0.0
SCREEN_MIN_PAIRS = 150
FORMATIONS = [2019, 2020, 2021, 2022, 2023]
HORIZONS = [1, 2, 3]
MIN_ENDPOINTS = 5  # pair endpoints needed in a period for its forward index level to count


def build_base(con, street=STREET):
    epc = os.path.join(street, "epc_match.parquet")
    con.execute(f"""
    CREATE OR REPLACE TABLE j AS
    SELECT p.txn_id, p.price, p.date, p.postcode, p.property_type AS type, p.old_new = 'Y' AS new_build,
           coalesce(p.saon,'') AS saon, coalesce(p.paon,'') AS paon,
           pc.lsoa21cd AS lsoa, pc.msoa21cd AS msoa, pc.msoa21nm AS msoa_nm, pc.ladcd AS lad, pc.ladnm AS lad_nm,
           e.floor_area
    FROM '{street}/ppd_london.parquet' p JOIN '{street}/postcodes_london.parquet' pc USING (postcode)
    LEFT JOIN '{epc}' e USING (txn_id)
    WHERE p.ppd_category = 'A' AND p.property_type IN ('D','S','T','F')
      AND p.price BETWEEN {agg.MIN_PRICE} AND {agg.MAX_PRICE}""")


def clean_upto(con, cutoff, name):
    """Cleaned sales dated <= cutoff, outlier bounds computed from those sales only (no look-ahead)."""
    con.execute(f"""
    CREATE OR REPLACE TABLE {name} AS
    WITH jf AS (SELECT * FROM j WHERE date <= DATE '{cutoff}'),
    q AS (SELECT msoa, type, quantile_cont(ln(price), 0.25) q1, quantile_cont(ln(price), 0.75) q3 FROM jf GROUP BY ALL)
    SELECT jf.*, round(jf.price / jf.floor_area) AS ppsm FROM jf JOIN q USING (msoa, type)
    WHERE ln(jf.price) BETWEEN q1 - {agg.OUTLIER_IQR}*(q3-q1) AND q3 + {agg.OUTLIER_IQR}*(q3-q1)""")


def get_pairs(con, table):
    pairs = con.execute(f"""
      WITH s AS (
        SELECT date, price, new_build, msoa, lad,
               lag(date) OVER w AS d1, lag(price) OVER w AS pr1, lag(new_build) OVER w AS nb1
        FROM {table} WINDOW w AS (PARTITION BY postcode, paon, saon ORDER BY date)
      )
      SELECT d1, date AS d2, ln(price::DOUBLE / pr1) AS r, msoa, lad FROM s
      WHERE d1 IS NOT NULL AND NOT nb1""").df()
    yrs = (pairs.d2 - pairs.d1).dt.days / 365.25
    return pairs[(yrs >= agg.MIN_HOLD_YEARS) & ((pairs.r / yrs).abs() <= agg.MAX_ABS_ANN_RET)].copy()


def momentum_1y(g):
    """Same rule as 03_aggregate.repeat_sales: 1y change, or None if too few pairs."""
    if len(g) >= agg.MIN_PAIRS and (g.p2 == 0).sum() >= 5:
        idx = agg.bmn_index(g.p1.values, g.p2.values, g.r.values)
        return math.exp(idx[0] - idx[1]) - 1
    return None


def screen_at(con, cutoff, min_n=SCREEN_MIN_N, min_pairs=SCREEN_MIN_PAIRS, max_discount=MAX_DISCOUNT, min_edge=MIN_EDGE):
    """Live screen using only sales <= cutoff. Returns (picks: one row per MSOA, n_universe)."""
    clean_upto(con, cutoff, "cf")
    lv = con.execute(f"""
      WITH w AS (SELECT * FROM cf WHERE date > DATE '{cutoff}' - INTERVAL {agg.LEVEL_MONTHS} MONTH),
      b AS (SELECT lad, any_value(lad_nm) AS borough, median(ppsm) AS b_ppsm FROM w GROUP BY lad),
      l AS (SELECT lsoa, any_value(msoa) AS msoa, any_value(msoa_nm) AS msoa_nm, any_value(lad) AS lad,
                   count(ppsm) AS n, median(ppsm) AS ppsm FROM w GROUP BY lsoa)
      SELECT l.*, b.borough, b.b_ppsm FROM l JOIN b USING (lad) WHERE l.ppsm IS NOT NULL AND b.b_ppsm IS NOT NULL""").df()
    pairs = get_pairs(con, "cf")
    pairs["p1"] = agg.period_of(pairs.d1.values, cutoff)
    pairs["p2"] = agg.period_of(pairs.d2.values, cutoff)
    pairs = pairs[pairs.p1 != pairs.p2]
    ms = pd.DataFrame([{"msoa": c, "pairs": len(g), "mom1y": momentum_1y(g)} for c, g in pairs.groupby("msoa")])
    bo = pd.DataFrame([{"lad": c, "b_mom1y": momentum_1y(g)} for c, g in pairs.groupby("lad")])
    if ms.empty or bo.empty:
        return pd.DataFrame(), 0
    d = lv.merge(ms, on="msoa").merge(bo, on="lad").dropna(subset=["mom1y", "b_mom1y"])
    d["discount"] = d.ppsm / d.b_ppsm - 1
    d["edge"] = d.mom1y - d.b_mom1y
    ok = d[(d.n >= min_n) & (d.pairs >= min_pairs) & (d.discount <= max_discount) & (d.edge > min_edge)]
    ok = ok.sort_values(["edge", "discount"], ascending=[False, True])
    hits = ok.groupby("msoa").size().rename("hits")
    picks = ok.drop_duplicates("msoa").merge(hits, on="msoa")
    return picks.reset_index(drop=True), d.msoa.nunique()


def forward_index(con, asof):
    """Calendar-year repeat-sales index per MSOA and borough over all pairs. Returns {code: (idx_by_years_ago, endpoint_counts)}."""
    clean_upto(con, asof, "cfull")
    pairs = get_pairs(con, "cfull")
    last = int(asof[:4])
    pairs["p1"] = last - pairs.d1.dt.year.values
    pairs["p2"] = last - pairs.d2.dt.year.values
    pairs = pairs[pairs.p1 != pairs.p2]
    out = {}
    for col in ("msoa", "lad"):
        for code, g in pairs.groupby(col):
            if len(g) < agg.MIN_PAIRS:
                continue
            idx = agg.bmn_index(g.p1.values, g.p2.values, g.r.values)
            cnt = np.bincount(np.concatenate([g.p1.values, g.p2.values]), minlength=len(idx))
            out[code] = (idx, cnt)
    return out, last


def fwd_return(fwd, last, code, year, h):
    """Change in the index from calendar year `year` to `year + h` (complete years only), or None."""
    if code not in fwd or year + h > last - 1:
        return None
    idx, cnt = fwd[code]
    a, b = last - year, last - (year + h)
    if a >= len(idx) or b >= len(idx) or cnt[a] < MIN_ENDPOINTS or cnt[b] < MIN_ENDPOINTS:
        return None
    return math.exp(idx[b] - idx[a]) - 1


def summarise(ex_b, ex_np, base_hits):
    """Cohort stats. ex_b / ex_np: excess forward returns of picks vs borough / vs other MSOAs in the borough."""
    def stats(x):
        x = [v for v in x if v is not None]
        if not x:
            return None, None, None
        return float(np.mean(x)), float(np.median(x)), float(np.mean([v > 0 for v in x]))
    mean_b, med_b, hit_b = stats(ex_b)
    mean_n, med_n, hit_n = stats(ex_np)
    base = [h for h in base_hits if h is not None]
    return {
        "n": sum(v is not None for v in ex_b), "hit_rate": hit_b, "mean_excess": mean_b, "median_excess": med_b,
        "n_vs_rest": sum(v is not None for v in ex_np), "hit_rate_vs_rest": hit_n,
        "mean_excess_vs_rest": mean_n, "median_excess_vs_rest": med_n,
        "base_n": len(base), "base_hit_rate": float(np.mean(base)) if base else None,
    }


def run(con, asof, formations=FORMATIONS, horizons=HORIZONS, **screen_kw):
    fwd, last = forward_index(con, asof)
    msoa_lad = dict(con.execute("SELECT DISTINCT msoa, lad FROM j").fetchall())
    msoa_name = dict(con.execute("SELECT msoa, any_value(msoa_nm) FROM j GROUP BY msoa").fetchall())
    lad_name = dict(con.execute("SELECT lad, any_value(lad_nm) FROM j GROUP BY lad").fetchall())
    by_lad = {}
    for m, l in msoa_lad.items():
        if m in fwd:
            by_lad.setdefault(l, []).append(m)
    pick_rows, acc, meta = [], {}, []
    for y in formations:
        picks, universe = screen_at(con, f"{y}-12-31", **screen_kw)
        meta.append({"formation": y, "picks": int(len(picks)), "universe": int(universe)})
        pickset = set(picks.msoa) if len(picks) else set()
        for h in horizons:
            ex_b, ex_np, base = [], [], []
            for m in (picks.msoa if len(picks) else []):
                lad = msoa_lad[m]
                rm, rb = fwd_return(fwd, last, m, y, h), fwd_return(fwd, last, lad, y, h)
                if rm is None or rb is None:
                    continue
                others = [fwd_return(fwd, last, o, y, h) for o in by_lad.get(lad, []) if o not in pickset]
                others = [o for o in others if o is not None]
                rn = float(np.mean(others)) if others else None
                ex_b.append(rm - rb)
                ex_np.append(None if rn is None else rm - rn)
                pick_rows.append({"formation": y, "horizon": h, "msoa": m, "name": msoa_name.get(m), "borough": lad_name.get(lad),
                                  "ret": rm, "borough_ret": rb, "rest_ret": rn})
            for m in fwd:
                if m in msoa_lad and m not in pickset:
                    rm, rb = fwd_return(fwd, last, m, y, h), fwd_return(fwd, last, msoa_lad[m], y, h)
                    if rm is not None and rb is not None:
                        base.append(rm > rb)
            acc[(y, h)] = (ex_b, ex_np, base)
    rows = []
    for h in horizons:
        for y in formations:
            rows.append({"formation": str(y), "horizon": h, **summarise(*acc[(y, h)])})
        pooled = [sum((acc[(y, h)][i] for y in formations), []) for i in range(3)]
        rows.append({"formation": "all", "horizon": h, **summarise(*pooled)})
    return rows, meta, pick_rows


def main():
    con = duckdb.connect()
    build_base(con)
    asof = str(con.execute("SELECT max(date) FROM j").fetchone()[0])
    rows, meta, pick_rows = run(con, asof)
    for r in meta:
        r["picks_with_any_outcome"] = int(len({p["msoa"] for p in pick_rows if p["formation"] == r["formation"]}))
    out = {
        "asof": asof,
        "params": {"min_n": SCREEN_MIN_N, "max_discount": MAX_DISCOUNT, "min_edge": MIN_EDGE, "min_pairs": SCREEN_MIN_PAIRS,
                   "level_months": agg.LEVEL_MONTHS, "formations": [f"{y}-12-31" for y in FORMATIONS], "horizons": HORIZONS},
        "formations": meta,
        "rows": rows,
    }
    with open(OUT_JSON, "w") as f:
        json.dump(out, f, indent=1)
    db = sqlite3.connect(OUT_DB)
    pd.DataFrame(rows).to_sql("screen_backtest", db, index=False, if_exists="replace")
    pd.DataFrame(pick_rows).to_sql("screen_backtest_picks", db, index=False, if_exists="replace")
    db.commit()
    db.close()
    pct = lambda v: "   n/a" if v is None else f"{v*100:+6.1f}%"
    print("asof", asof, "| formations:", meta)
    print(f"{'form':>5} {'h':>2} {'n':>4} {'hit':>7} {'mean':>8} {'median':>8} | {'n':>4} {'hit':>7} {'mean':>8} | base hit")
    for r in rows:
        print(f"{r['formation']:>5} {r['horizon']:>2} {r['n']:>4} {pct(r['hit_rate'])} {pct(r['mean_excess'])} {pct(r['median_excess'])} | "
              f"{r['n_vs_rest']:>4} {pct(r['hit_rate_vs_rest'])} {pct(r['mean_excess_vs_rest'])} | {pct(r['base_hit_rate'])}")


if __name__ == "__main__":
    main()
