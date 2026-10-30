import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoroughDetail } from "@/lib/db";
import Charts from "./charts";

export const dynamic = "force-dynamic";

function fmt(v: number | null, f: (n: number) => string) {
  return v == null ? "no data" : f(v);
}

export default function BoroughPage({ params }: { params: { code: string } }) {
  const d = getBoroughDetail(params.code);
  if (!d) notFound();
  const cards = [
    { label: "Latest price", value: fmt(d.latestPrice, (n) => `£${Math.round(n).toLocaleString()}`) },
    { label: "Price Δ 12m", value: fmt(d.priceChange, (n) => `${n.toFixed(1)}%`) },
    { label: "Net build-up (3 FY)", value: fmt(d.netBuildup, (n) => Math.round(n).toLocaleString()) },
    { label: "Supply pressure", value: fmt(d.pressure, (n) => `${n.toFixed(2)}×`) },
    { label: "Starts momentum", value: fmt(d.momentum, (n) => `${(n * 100).toFixed(1)}%`) },
  ];
  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">← All boroughs</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.name}</h1>
      <p className="text-sm text-slate-500">{d.code}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Charts detail={d} />
      </div>
    </main>
  );
}
