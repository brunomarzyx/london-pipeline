import Link from "next/link";
import { getStreetDb } from "@/lib/street";
import StreetUnavailable from "@/app/street-unavailable";
import { getValueScreen, MAX_DISCOUNT, SCREEN_MIN_N, SCREEN_MIN_PAIRS } from "@/lib/screen";

export const dynamic = "force-dynamic";

const gbp = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;
const pct = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;

export default function ScreenPage({ searchParams }: { searchParams: { transport?: string; deprived?: string; maxScore?: string; noflood?: string } }) {
  if (!getStreetDb()) return <StreetUnavailable />;
  const maxScore = Number(searchParams.maxScore);
  const opts = {
    goodTransport: searchParams.transport === "1",
    notDeprived: searchParams.deprived === "1",
    maxAreaScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : undefined,
    excludeFloodZone3: searchParams.noflood === "1",
  };
  const { rows, candidates, asof } = getValueScreen(30, opts);
  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Value vs momentum screen</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Neighbourhoods priced at least {Math.abs(MAX_DISCOUNT * 100)}% below their borough per sq m, where
        local prices (same homes resold) rose faster than the borough over the last year.{" "}
        {rows.length} of {candidates} qualifying areas shown (one row per MSOA), to {asof ?? "—"}.
      </p>

      <form method="get" className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="transport" value="1" defaultChecked={opts.goodTransport} /> Good transport (PTAL 3+)
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="deprived" value="1" defaultChecked={opts.notDeprived} /> Exclude most deprived 20%
        </label>
        <label className="flex items-center gap-1">
          Max area score (buyer)
          <input type="number" name="maxScore" min={0} max={100} defaultValue={opts.maxAreaScore ?? ""} className="w-20 rounded border px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="noflood" value="1" defaultChecked={opts.excludeFloodZone3} /> Exclude Flood Zone 3
        </label>
        <button className="rounded bg-sky-700 px-3 py-1 text-white">Apply</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Area</th>
              <th>Borough</th>
              <th className="text-right">£/sq m</th>
              <th className="text-right">vs borough</th>
              <th className="text-right">1y local</th>
              <th className="text-right">1y borough</th>
              <th className="text-right">5y local</th>
              <th className="text-right">PTAL</th>
              <th className="text-right">IMD</th>
              <th className="text-right">Risk</th>
              <th className="text-right">Crime</th>
              <th className="text-right">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.msoa} className="border-t border-slate-100">
                <td className="py-1">
                  {r.postcode ? (
                    <Link href={`/area/${encodeURIComponent(r.postcode)}`} className="font-medium text-sky-700 hover:underline">
                      {r.sector ?? r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.sector ?? r.name}</span>
                  )}{" "}
                  <span className="text-slate-500">{r.name}</span>
                  {(r.hits ?? 1) > 1 && (
                    <span className="ml-1 text-xs text-slate-400">+{(r.hits ?? 1) - 1} nearby</span>
                  )}
                </td>
                <td>{r.borough}</td>
                <td className="text-right tabular-nums">{gbp(r.ppsm)}</td>
                <td className="text-right tabular-nums text-emerald-700">{pct(r.discount)}</td>
                <td className="text-right tabular-nums">{pct(r.mom1y)}</td>
                <td className="text-right tabular-nums text-slate-500">{pct(r.boroughMom1y)}</td>
                <td className="text-right tabular-nums text-slate-500">{pct(r.mom5y)}</td>
                <td className="text-right">{r.ptal ?? "—"}</td>
                <td className="text-right tabular-nums">{r.imdDecile ?? "—"}</td>
                <td className="text-right tabular-nums" title={r.floodZone3 ? "Representative postcode in Flood Zone 3" : undefined}>
                  {r.areaScoreBuyer ?? "—"}{r.floodZone3 ? " ⚠" : ""}
                </td>
                <td className="text-right tabular-nums">{r.crimePctile != null ? `p${r.crimePctile}` : "—"}</td>
                <td className="text-right tabular-nums text-slate-500">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-xs text-slate-500">
        £/sq m: median of the last 36 months of Land Registry sales matched to EPC floor areas (n ≥ {SCREEN_MIN_N}).
        Momentum: repeat-sales index at MSOA level, only where it rests on ≥ {SCREEN_MIN_PAIRS} resale pairs.
        PTAL: TfL transport access 0–6b (2015). IMD: deprivation decile, 1 = most deprived 10% in England (2025).
        Crime: London percentile of recorded crime in the LSOA over the last 12 months (data.police.uk).
        Risk: buyer-lens Area Risk Score (0 best … 100 worst) at the row's busiest postcode; ⚠ marks Flood Zone 3. Scores are precomputed per LSOA (data/context/area-score-lsoa.json, scripts/build-area-score-lsoa.ts); rows with no score are dropped when a max score is set.
        A screen, not a recommendation: cheaper areas can be cheap for lasting reasons (stock quality, transport, flood risk).
      </p>
    </main>
  );
}
