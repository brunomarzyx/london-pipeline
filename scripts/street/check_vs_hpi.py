"""Cross-check repeat-sales 1y/5y changes against the ONS/HMLR UK HPI already in data/london.db."""
import os, sqlite3
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s = sqlite3.connect(os.path.join(ROOT, "data", "street.db"))
h = sqlite3.connect(os.path.join(ROOT, "data", "london.db"))
last = h.execute("SELECT max(month) FROM prices").fetchone()[0]
print("HPI latest month", last)

def hpi_chg(code, years):
    rows = h.execute("SELECT month, avg_price FROM prices WHERE borough_code=? ORDER BY month", (code,)).fetchall()
    d = dict(rows)
    m = max(d)
    y, mo = int(m[:4]), m[5:7]
    prev = f"{y - years}-{mo}" + m[7:]
    return d[m] / d[prev] - 1 if prev in d else None

rows = s.execute("SELECT code, name, rs_chg_1y, rs_chg_5y, rs_pairs, med_36m, n_36m FROM area_stats WHERE level='borough' ORDER BY rs_chg_1y").fetchall()
diffs1, diffs5 = [], []
print(f"{'borough':24}{'RS 1y':>8}{'HPI 1y':>8}{'RS 5y':>8}{'HPI 5y':>8}{'pairs':>7}")
for code, name, r1, r5, n, med, n36 in rows:
    a1, a5 = hpi_chg(code, 1), hpi_chg(code, 5)
    if a1 is not None: diffs1.append(r1 - a1)
    if a5 is not None and r5 is not None: diffs5.append(r5 - a5)
    f = lambda x: f"{x*100:7.1f}%" if x is not None else "     n/a"
    print(f"{name[:24]:24}{f(r1)}{f(a1)}{f(r5)}{f(a5)}{n:7}")
import statistics as st
print("mean abs diff 1y pp:", round(st.mean(abs(x) for x in diffs1) * 100, 2), " 5y pp:", round(st.mean(abs(x) for x in diffs5) * 100, 2))
c1 = st.correlation([r[2] for r in rows if hpi_chg(r[0], 1) is not None], [hpi_chg(r[0], 1) for r in rows if hpi_chg(r[0], 1) is not None])
print("corr 1y:", round(c1, 2))
print(s.execute("SELECT rs_chg_1y, rs_chg_5y, rs_pairs FROM area_stats WHERE level='london'").fetchone(), "HPI London n/a here")
