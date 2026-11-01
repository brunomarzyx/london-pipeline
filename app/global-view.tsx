"use client";
import { useEffect, useState } from "react";
import type { CityMetrics } from "@/lib/global";
import { GLOBAL_PHASE_LABEL } from "@/lib/global";

function fmtPct(v: number | null): string {
  return v == null ? "no data" : `${v.toFixed(1).replace("-", "−")}%`;
}

function Spark({ data, id }: { data: { p: string; v: number }[]; id: string }) {
  if (data.length < 2) return <span className="text-slate-400">no data</span>;
  const w = 140;
  const h = 36;
  const vs = data.map((d) => d.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const rng = hi - lo || 1;
  const pts = vs
    .map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / rng) * (h - 6)).toFixed(1)}`)
    .join(" ");
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <svg width={w} height={h} role="img" aria-label={`trend for ${id}`}>
      <polyline points={pts} fill="none" stroke={up ? "#0284c7" : "#dc2626"} strokeWidth="1.5" />
      <circle cx={w} cy={h - 3 - ((vs[vs.length - 1] - lo) / rng) * (h - 6)} r="2" fill={up ? "#0284c7" : "#dc2626"} />
    </svg>
  );
}

export default function GlobalView() {
  const [cities, setCities] = useState<CityMetrics[] | null>(null);
  useEffect(() => {
    (async () => {
      const r = await (await fetch("/api/global")).json();
      setCities(r.cities);
    })();
  }, []);

  if (!cities) return <div className="p-6 text-slate-400">Loading global cycle…</div>;
  const ranked = [...cities].sort((a, b) => (b.real1y ?? -Infinity) - (a.real1y ?? -Infinity));

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <h2 className="text-lg font-semibold">London in the global cycle</h2>
        <p className="mt-1 text-sm text-slate-600">
          Real house-price momentum (city BIS series deflated with national CPI) against central-bank
          policy rates. Supply data is not comparable across cities, so this view is prices and rates only.
        </p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">City</th>
              <th className="px-2 py-1.5 text-right">Real Δ 1y</th>
              <th className="px-2 py-1.5 text-right">Real Δ 5y</th>
              <th className="px-2 py-1.5 text-right">Off 10y peak</th>
              <th className="px-2 py-1.5 text-right">Policy rate</th>
              <th className="px-2 py-1.5 text-right">Δ 12m</th>
              <th className="px-2 py-1.5">Phase</th>
              <th className="px-2 py-1.5">Trend</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => (
              <tr
                key={c.key}
                className={`border-b border-slate-100 ${c.key === "london" ? "bg-sky-50 font-medium" : ""}`}
              >
                <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                <td className="px-2 py-1.5">
                  {c.city}
                  <span className="ml-1 text-xs text-slate-400">{c.latestPeriod}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(c.real1y)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(c.real5y)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(c.distFromPeak)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {c.policyRate == null ? "no data" : `${c.policyRate.toFixed(2)}%`}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {c.policyChange12m == null
                    ? "no data"
                    : `${c.policyChange12m >= 0 ? "+" : ""}${c.policyChange12m.toFixed(2)}pp`}
                </td>
                <td className="px-2 py-1.5">{GLOBAL_PHASE_LABEL[c.phase]}</td>
                <td className="px-2 py-1.5">
                  <Spark data={c.spark} id={c.city} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="mt-2 text-xs text-slate-500">
          Sources: BIS detailed residential property prices, long CPI series and policy rates
          (data.bis.org, pulled 30 Oct 2026; see data/SOURCES.md). City series are nominal;
          real = deflated with national CPI. ≥10y peak uses available history (Tel Aviv from 2017).
        </p>
      </div>
    </div>
  );
}
