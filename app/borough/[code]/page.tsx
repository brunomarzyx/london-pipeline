import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoroughDetail } from "@/lib/db";
import {
  PHASE_COLOR,
  PHASE_LABEL,
  classifyCycle,
  fmtHomes,
  fmtPct,
  fmtPressure,
  fmtPrice,
} from "@/lib/cycle-phase";
import Charts from "./charts";
import StreetsMap from "./streets-map";
import BriefCard from "./brief-card";
import CycleCard from "./cycle-card";
import MemoCard from "./memo-card";

export const dynamic = "force-dynamic";

export default function BoroughPage({ params }: { params: { code: string } }) {
  const d = getBoroughDetail(params.code);
  if (!d) notFound();
  const phase = classifyCycle(d.priceChange, d.pressure, d.momentum);
  const cards = [
    { key: "latestPrice", label: "Latest price", value: fmtPrice(d.latestPrice) },
    { key: "priceChange", label: "Price Δ 12m", value: fmtPct(d.priceChange) },
    { key: "netBuildup", label: "Net build-up (3 FY)", value: d.netBuildup == null ? "no data" : fmtHomes(d.netBuildup).replace(" homes", "") },
    { key: "pressure", label: "Supply pressure", value: fmtPressure(d.pressure) },
    { key: "momentum", label: "Starts momentum", value: fmtPct(d.momentum == null ? null : d.momentum * 100) },
    { key: "avgRent", label: "Avg monthly rent", value: fmtPrice(d.avgRent) },
    { key: "rentChange", label: "Rent Δ 12m", value: fmtPct(d.rentChange) },
    { key: "grossYield", label: "Gross yield", value: fmtPct(d.grossYield) },
    { key: "priceToRent", label: "Price-to-rent", value: d.priceToRent == null ? "no data" : `${d.priceToRent.toFixed(1)}×` },
    { key: "latestSales", label: "Sales (latest 12m)", value: d.latestSales == null ? "no data" : d.latestSales.toLocaleString("en-GB") },
    { key: "salesChange", label: "Sales Δ 2025 vs 2024", value: fmtPct(d.salesChange == null ? null : d.salesChange * 100) },
    { key: "newBuildShare", label: "New-build share", value: fmtPct(d.newBuildShare == null ? null : d.newBuildShare * 100) },
  ];
  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">← All boroughs</Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ background: PHASE_COLOR[phase] }}
        >
          {PHASE_LABEL[phase]}
        </span>
      </div>
      <p className="text-sm text-slate-500">{d.code}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} id={`metric-${c.key}`} className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>
      <BriefCard code={d.code} />
      <CycleCard code={d.code} />
      <MemoCard code={d.code} />
      <div className="mt-6">
        <Charts detail={d} />
      </div>
      <div className="mt-6 rounded-xl border bg-white p-4" id="streets">
        <Link href="#streets" className="text-sm font-semibold text-sky-700 hover:underline">
          Streets in this borough
        </Link>
        <p className="text-xs text-slate-500">
          Reliable streets (n ≥ 10 sales in 36 months), circles coloured by median price.
        </p>
        <StreetsMap lad={d.code} />
      </div>
    </main>
  );
}
