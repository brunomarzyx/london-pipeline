import Link from "next/link";
import { notFound } from "next/navigation";
import { getAreaComps, normalisePostcode } from "@/lib/street";
import PriceCheck, { AreaMap } from "./widgets";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function windowLabel(asof: string): string {
  const [y, m] = asof.split("-").map(Number);
  const end = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1);
  start.setMonth(start.getMonth() - 35);
  return `${MONTHS[start.getMonth()]} ${start.getFullYear()}–${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

const gbp = (v: number | null) =>
  v == null ? "no data" : `£${Math.round(v).toLocaleString("en-GB")}`;

const pct1 = (v: number | null) =>
  v == null ? "no data" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;

export default function AreaPage({
  params,
  searchParams,
}: {
  params: { postcode: string };
  searchParams: { type?: string; price?: string; sqm?: string };
}) {
  const raw = decodeURIComponent(params.postcode);
  const pc = normalisePostcode(raw);
  if (!pc) notFound();
  const type =
    searchParams.type === "house"
      ? "house"
      : searchParams.type === "flat"
        ? "flat"
        : null;
  const sqmParam = Number(searchParams.sqm);
  const sqm = Number.isFinite(sqmParam) && sqmParam > 0 ? sqmParam : null;
  const r = getAreaComps(pc, type ?? undefined, sqm);
  if ("error" in r) notFound();
  const typeLabel = r.type ?? "property";
  const priceParam = Number(searchParams.price);
  const initialPct =
    Number.isFinite(priceParam) && priceParam > 0 && r.comps.length
      ? Math.round(
          (r.comps.filter((c) => c.price < priceParam).length / r.comps.length) * 100,
        )
      : null;

  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {r.postcode}
        {r.type ? ` — ${r.type}s` : ""}
      </h1>
      <p className="text-sm text-slate-500">
        Street-level comparables · {r.source} · to {r.asof}
      </p>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <p className="text-lg">
          Typical {typeLabel} price on {r.chosenName}: {gbp(r.chosenMedian)}{" "}
          <span className="text-sm text-slate-600">
            (n = {r.chosenN} sales, {windowLabel(r.asof)}; middle half{" "}
            {gbp(r.chosenP25)}–{gbp(r.chosenP75)})
          </span>
        </p>
        {initialPct != null && (
          <p className="mt-1 text-sm font-medium">
            £{Math.round(priceParam).toLocaleString("en-GB")} is above{" "}
            {initialPct}% of comparable sales.
          </p>
        )}
        <PriceCheck prices={r.comps.map((c) => c.price)} />
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Size-adjusted fair range</h2>
        <form method="get" className="mt-2 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col">
            <span className="text-xs text-slate-500">Type</span>
            <select name="type" defaultValue={r.type ?? ""} className="rounded border px-2 py-1">
              <option value="">Any</option>
              <option value="flat">Flat</option>
              <option value="house">House</option>
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-slate-500">Floor area (sq m)</span>
            <input name="sqm" type="number" min={15} max={1000} defaultValue={sqm ?? ""} className="w-28 rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-slate-500">Asking price (£)</span>
            <input name="price" type="number" min={0} defaultValue={Number.isFinite(priceParam) && priceParam > 0 ? priceParam : ""} className="w-32 rounded border px-2 py-1" />
          </label>
          <button className="rounded bg-sky-700 px-3 py-1 text-white">Check</button>
        </form>
        {r.ppsm == null ? (
          <p className="mt-2 text-sm text-slate-600">
            Not enough size-matched sales near {r.postcode} for a reliable £/sq m figure.
          </p>
        ) : (
          <>
            <p className="mt-2 text-lg">
              {gbp(r.ppsm.median)}/sq m{" "}
              <span className="text-sm text-slate-600">
                on {r.ppsm.name} (n = {r.ppsm.n} size-matched sales{r.ppsm.p25 != null && r.ppsm.p75 != null ? `; middle half ${gbp(r.ppsm.p25)}–${gbp(r.ppsm.p75)}/sq m` : ""})
              </span>
            </p>
            {r.ppsm.fairRange ? (
              <p className="mt-1 text-sm font-medium">
                Fair range for {r.ppsm.fairRange.sqm} sq m: {gbp(r.ppsm.fairRange.low)}–{gbp(r.ppsm.fairRange.high)}, mid {gbp(r.ppsm.fairRange.mid)}
                {Number.isFinite(priceParam) && priceParam > 0 && (
                  <> · asking {gbp(priceParam)} is{" "}
                    {priceParam > r.ppsm.fairRange.high ? "above the range" : priceParam < r.ppsm.fairRange.low ? "below the range" : "within the range"}
                    {" "}({gbp(priceParam / r.ppsm.fairRange.sqm)}/sq m)
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">Enter a floor area for a size-adjusted fair range.</p>
            )}
            {r.ppsm.p25 == null && (
              <p className="mt-1 text-xs text-slate-500">Choose flat or house for quartiles and a fair range.</p>
            )}
          </>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Floor areas from the MHCLG EPC register, matched to Land Registry sales by postcode and address. Last 36 months; levels need n ≥ 10.
        </p>
      </div>

      {r.context && (
        <div className="mt-4 rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Neighbourhood ({r.context.lsoa})</h2>
          <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500">Transport access (TfL PTAL)</div>
              <div className="text-lg font-medium">{r.context.ptal ?? "no data"}</div>
              <div className="text-xs text-slate-500">0 = worst, 6b = best · 2015{r.context.ptalImputed ? " · area average" : ""}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Deprivation (IMD 2025)</div>
              <div className="text-lg font-medium">{r.context.imdDecile != null ? `Decile ${r.context.imdDecile}` : "no data"}</div>
              <div className="text-xs text-slate-500">1 = most deprived 10% in England · rank {r.context.imdRank?.toLocaleString("en-GB") ?? "—"} of 33,755</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Recorded crime, 12 months</div>
              <div className="text-lg font-medium">{r.context.crime12m?.toLocaleString("en-GB") ?? "no data"}</div>
              <div className="text-xs text-slate-500">
                {r.context.crimePctile != null ? `${r.context.crimePctile}th percentile in London` : ""} · burglary {r.context.burglary12m ?? "—"} · violence {r.context.violence12m ?? "—"} · {r.context.crimeWindow ?? ""}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Crime counts are recorded offences located in this LSOA (data.police.uk); busy centres rank high from footfall, not resident risk.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Ladder</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Level</th>
              <th>Name</th>
              <th className="text-right">n</th>
              <th className="text-right">Median</th>
            </tr>
          </thead>
          <tbody>
            {r.ladder.map((l) => (
              <tr
                key={l.level}
                className={
                  l.level === r.chosenLevel
                    ? "bg-sky-50 font-medium"
                    : undefined
                }
              >
                <td className="py-1">{l.level}</td>
                <td>{l.name}</td>
                <td className="text-right tabular-nums">{l.n}</td>
                <td className="text-right tabular-nums">{gbp(l.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Momentum</h2>
        <p className="mt-1 text-sm">
          {r.momentum.from == null ? (
            "No repeat-sales index at this level yet."
          ) : (
            <>
              Repeat-sales index ({r.momentum.from}): {pct1(r.momentum.chg1y)}{" "}
              over 1y, {pct1(r.momentum.chg5y)} over 5y.{" "}
              <span className="text-slate-500">
                Repeat-sales index, same homes resold, excludes new builds.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Recent sales</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Address</th>
              <th>Date</th>
              <th className="text-right">Price</th>
              <th className="text-right">Size</th>
              <th className="text-right">£/sq m</th>
              <th className="text-right">EPC</th>
            </tr>
          </thead>
          <tbody>
            {r.comps.map((c, i) => (
              <tr key={`${c.postcode}-${c.date}-${c.price}-${i}`}>
                <td className="py-1">{c.address}</td>
                <td>{c.date}</td>
                <td className="text-right tabular-nums">
                  £{c.price.toLocaleString("en-GB")}
                </td>
                <td className="text-right tabular-nums">{c.floor_area ? `${Math.round(c.floor_area)} m²` : "—"}</td>
                <td className="text-right tabular-nums">{c.ppsm ? gbp(c.ppsm) : "—"}</td>
                <td className="text-right">{c.epc_rating ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Map</h2>
        <div className="mt-2">
          <AreaMap comps={r.comps} median={r.chosenMedian} />
        </div>
      </div>
    </main>
  );
}
