import { briefForBorough } from "@/lib/brief";

const RISK: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export default async function BriefCard({ code }: { code: string }) {
  const b = await briefForBorough(code);
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-500">Muse Spark brief</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK[b.risk_flag]}`}>
          risk: {b.risk_flag}
        </span>
        <span className="text-xs text-slate-400">confidence: {b.confidence}</span>
      </div>
      <p className="mt-2 font-medium">{b.headline}</p>
      <p className="mt-1 text-sm"><span className="font-medium">Supply:</span> {b.supply_view}</p>
      <p className="mt-1 text-sm"><span className="font-medium">Prices:</span> {b.price_view}</p>
    </section>
  );
}
