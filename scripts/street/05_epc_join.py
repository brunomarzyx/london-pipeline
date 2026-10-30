"""Match Land Registry sales to EPC certificates -> data/street/epc_match.parquet (txn_id, floor_area, rooms, rating, quality).

Price Paid has no UPRN, so matching is on postcode + address:
- num_key: sorted house/flat identifiers (numbers with optional letter, e.g. 21A, and lone flat letters, e.g. FLAT B -> B).
- Candidates share postcode AND num_key; ties (two blocks with a Flat 13 in one postcode) are broken by
  Jaccard overlap of the remaining name words (MIN_JACCARD). Addresses with no numbers need JACCARD_NAMED.
- Floor area: the certificate closest in time to the sale. Areas outside [MIN_AREA, MAX_AREA] are dropped,
  as are implausible prices per sq m outside [MIN_PPSM, MAX_PPSM] (bad matches or data errors).
"""
import os, duckdb

MIN_AREA, MAX_AREA = 15, 1000
MIN_PPSM, MAX_PPSM = 1_500, 60_000
MIN_JACCARD = 0.0      # numbered addresses: num_key must match exactly; words only rank ties
JACCARD_NAMED = 0.5    # named-only houses ("Rose Cottage") need real word overlap
STOP = ["FLAT", "APARTMENT", "UNIT", "THE", "AND", "LONDON"]

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = os.path.join(ROOT, "data", "street")

NUM = r"'\b([0-9]+[A-Z]?|[A-Z])\b'"
WORD = r"'[A-Z]{3,}'"


def keys(expr):
    return f"""array_to_string(list_sort(regexp_extract_all(upper({expr}), {NUM})), ' ') AS num_key,
      list_filter(list_distinct(regexp_extract_all(upper({expr}), {WORD})), lambda w: NOT list_contains({STOP}, w)) AS words"""


def main():
    con = duckdb.connect()
    con.execute(f"""CREATE TABLE ppd AS SELECT txn_id, price, date, postcode, property_type,
        {keys("coalesce(saon,'') || ' ' || coalesce(paon,'') || ' ' || coalesce(street,'')")}
      FROM '{S}/ppd_london.parquet'""")
    con.execute(f"""CREATE TABLE epc AS SELECT uprn, postcode, try_cast(total_floor_area AS DOUBLE) AS floor_area,
        try_cast(number_habitable_rooms AS INT) AS rooms, current_energy_rating AS rating,
        try_cast(lodgement_date AS DATE) AS ldate, {keys("address")}
      FROM '{S}/epc/epc_*.parquet' WHERE try_cast(total_floor_area AS DOUBLE) BETWEEN {MIN_AREA} AND {MAX_AREA}""")
    con.execute(f"""CREATE TABLE m AS
      WITH c AS (
        SELECT p.txn_id, p.price, e.floor_area, e.rooms, e.rating, p.num_key = '' AS named,
          len(list_intersect(p.words, e.words)) / greatest(len(list_distinct(list_concat(p.words, e.words))), 1) AS jac,
          abs(date_diff('day', p.date, e.ldate)) AS gap
        FROM ppd p JOIN epc e ON p.postcode = e.postcode AND p.num_key = e.num_key)
      SELECT txn_id, arg_min(floor_area, (-jac, gap)) AS floor_area, arg_min(rooms, (-jac, gap)) AS rooms,
             arg_min(rating, (-jac, gap)) AS rating, max(jac) AS jac, any_value(price) AS price
      FROM c WHERE (NOT named AND jac >= {MIN_JACCARD}) OR (named AND jac >= {JACCARD_NAMED})
      GROUP BY txn_id""")
    con.execute(f"""COPY (SELECT txn_id, floor_area, rooms, rating, round(jac, 2) AS jac FROM m
      WHERE price / floor_area BETWEEN {MIN_PPSM} AND {MAX_PPSM}) TO '{S}/epc_match.parquet' (FORMAT parquet)""")
    tot = con.execute("SELECT count(*) FROM ppd").fetchone()[0]
    got = con.execute(f"SELECT count(*) FROM '{S}/epc_match.parquet'").fetchone()[0]
    by = con.execute(f"""SELECT p.property_type, count(*) n, count(m.txn_id) / count(*) AS rate
      FROM ppd p LEFT JOIN '{S}/epc_match.parquet' m USING (txn_id) GROUP BY 1 ORDER BY 1""").fetchall()
    print(f"EPC rows {con.execute('SELECT count(*) FROM epc').fetchone()[0]}; matched {got}/{tot} sales = {got / tot:.1%}")
    print("by type:", [(t, n, round(r, 3)) for t, n, r in by])


if __name__ == "__main__":
    main()
