"""Tests for the street pipeline maths and the built street.db. Run: python3 scripts/street/test_aggregate.py"""
import os, sys, math, sqlite3, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import importlib
agg = importlib.import_module("03_aggregate")

# period_of: latest 12 months -> 0, the 12 before -> 1
asof = "2026-09-30"
d = np.array(["2026-09-15", "2025-10-01", "2025-09-30", "2024-10-01", "2021-10-01"], dtype="datetime64[D]")
assert list(agg.period_of(d, asof)) == [0, 0, 1, 1, 4], agg.period_of(d, asof)

# BMN recovers a known index: +10% per year over 6 periods
rng = np.random.default_rng(0)
true = np.log(1.10) * np.arange(5, -1, -1)  # true[k] = log index k years ago: latest (k=0) highest, oldest = 0
p1 = rng.integers(1, 6, 400); p2 = np.array([rng.integers(0, a) for a in p1])
y = true[p2] - true[p1] + rng.normal(0, 0.01, len(p1))
idx = agg.bmn_index(p1, p2, y)
assert abs(math.exp(idx[0] - idx[1]) - 1.10) < 0.01, idx
assert abs(math.exp(idx[0] - idx[5]) - 1.10 ** 5) < 0.02, idx

# Built database invariants
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db = sqlite3.connect(os.path.join(ROOT, "data", "street.db"))
assert db.execute("SELECT count(*) FROM area_stats WHERE level='borough'").fetchone()[0] == 33
assert db.execute("SELECT count(*) FROM area_stats WHERE reliable=1 AND n_36m < ?", (agg.MIN_N,)).fetchone()[0] == 0
assert db.execute("SELECT count(*) FROM area_stats WHERE rs_chg_1y IS NOT NULL AND rs_pairs < ?", (agg.MIN_PAIRS,)).fetchone()[0] == 0
assert db.execute("SELECT min(price), max(price) FROM sales").fetchone()[0] >= agg.MIN_PRICE
assert db.execute("SELECT count(*) FROM postcodes WHERE lad NOT LIKE 'E09%'").fetchone()[0] == 0
med = db.execute("SELECT med_36m FROM area_stats WHERE level='london'").fetchone()[0]
assert 300_000 < med < 1_000_000, med
print("all street pipeline tests passed")
