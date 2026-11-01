import Link from "next/link";
import { notFound } from "next/navigation";
import { getAreaComps, normalisePostcode } from "@/lib/street";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

/** Comparable sales shown on the one-page memo (keeps it to a single A4 sheet). */
const MEMO_COMPS = 8;

const gbp = (v: number | null | undefined) =>
  v == null ? "no data" : `£${Math.round(v).toLocaleString("en-GB")}`;
const pct1 = (v: number | null) =>
  v == null ? "no data" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;

export default function MemoPage({
  params,
  searchParams,
}: {
  params: { postcode: string };
  searchParams: { type?: string; price?: string; sqm?: string };
}) {
  const pc = normalisePostcode(decodeURIComponent(params.postcode));
  if (!pc) notFound();
  const type =
    searchParams.type === "house" ? "house" : searchParams.type === "flat" ? "flat" : null;
  const sqmParam = Number(searchParams.sqm);
  const sqm = Number.isFinite(sqmParam) && sqmParam > 0 ? sqmParam : null;
  const priceParam = Number(searchParams.price);
  const ask = Number.isFinite(priceParam) && priceParam > 0 ? priceParam : null;
  const r = getAreaComps(pc, type ?? undefined, sqm);
  if ("error" in r) notFound();

  const back = new URLSearchParams();
  if (type) back.set("type", type);
  if (sqm) back.set("sqm", String(sqm));
  if (ask) back.set("price", String(ask));
  const backHref = `/area/${encodeURIComponent(pc)}${back.size ? `?${back}` : ""}`;
  const fr = r.ppsm?.fairRange ?? null;
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const comps = r.comps.slice(0, MEMO_COMPS);

  return (
    <main className="memo mx-auto max-w-[210mm] bg-white p-6 text-[13px] leading-snug text-slate-900 print:p-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
          .memo { max-width: none; font-size: 11px; }
          .memo section, .memo table { break-inside: avoid; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-sm text-sky-700 hover:underline">
          ← Back to {r.postcode}
        </Link>
        <PrintButton />
      </div>

      <header className="border-b-2 border-slate-900 pb-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Postcode memo: {r.postcode}
          {r.type ? ` (${r.type}s)` : ""}
        </h1>
        <p className="text-xs text-slate-600">
          London Pipeline · prepared {generated} · sales data to {r.asof}
        </p>
      </header>

      <section className="mt-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Fair range</h2>
        {fr && r.ppsm ? (
          <p className="mt-1 text-base">
            <strong>
              {gbp(fr.low)}–{gbp(fr.high)}
            </strong>{" "}
            for {fr.sqm} sq m, mid {gbp(fr.mid)}
            <span className="text-slate-600">
              {" "}
              ({gbp(r.ppsm.median)}/sq m on {r.ppsm.name}, n = {r.ppsm.n} size-matched sales)
            </span>
            {ask != null && (
              <>
                . Asking {gbp(ask)} is{" "}
                {ask > fr.high ? "above the range" : ask < fr.low ? "below the range" : "within the range"} (
                {gbp(ask / fr.sqm)}/sq m).
              </>
            )}
          </p>
        ) : (
          <p className="mt-1 text-slate-700">
            No size-adjusted fair range: choose flat or house and enter a floor area, and the area
            needs enough size-matched sales.
          </p>
        )}
        <p className="mt-1">
          Typical {r.type ?? "property"} price: {gbp(r.chosenMedian)} (middle half {gbp(r.chosenP25)}–
          {gbp(r.chosenP75)}).
        </p>
      </section>

      <section className="mt-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Ladder level used</h2>
        <p className="mt-1">
          {r.chosenName} ({r.chosenLevel}), n = {r.chosenN} sales in the last 36 months.
        </p>
        <table className="mt-1 w-full">
          <tbody>
            {r.ladder.map((l) => (
              <tr key={l.level} className={l.level === r.chosenLevel ? "font-semibold" : "text-slate-600"}>
                <td className="py-0.5">{l.level}</td>
                <td>{l.name}</td>
                <td className="text-right tabular-nums">n {l.n}</td>
                <td className="text-right tabular-nums">{gbp(l.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Momentum</h2>
        <p className="mt-1">
          {r.momentum.from == null
            ? "No repeat-sales index at this level."
            : `Repeat-sales index (${r.momentum.from}): ${pct1(r.momentum.chg1y)} over 1y, ${pct1(r.momentum.chg5y)} over 5y. Same homes resold; excludes new builds.`}
        </p>
      </section>

      {r.context && (
        <section className="mt-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Neighbourhood ({r.context.lsoa})
          </h2>
          <ul className="mt-1 grid grid-cols-3 gap-3">
            <li>
              <div className="text-slate-500">Transport (TfL PTAL)</div>
              <div className="font-semibold">{r.context.ptal ?? "no data"}</div>
            </li>
            <li>
              <div className="text-slate-500">Deprivation (IMD 2025)</div>
              <div className="font-semibold">
                {r.context.imdDecile != null ? `Decile ${r.context.imdDecile}` : "no data"}
              </div>
            </li>
            <li>
              <div className="text-slate-500">Recorded crime, 12m</div>
              <div className="font-semibold">
                {r.context.crime12m?.toLocaleString("en-GB") ?? "no data"}
                {r.context.crimePctile != null ? ` (${r.context.crimePctile}th pct, London)` : ""}
              </div>
            </li>
          </ul>
          <p className="mt-1 text-[11px] text-slate-500">
            PTAL 0 = worst, 6b = best. IMD decile 1 = most deprived 10% in England. Crime counts
            are offences located in the LSOA; busy centres rank high from footfall.
          </p>
        </section>
      )}

      <section className="mt-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Recent comparable sales
        </h2>
        <table className="mt-1 w-full">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-0.5">Address</th>
              <th>Date</th>
              <th className="text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={`${c.postcode}-${c.date}-${c.price}-${i}`} className="border-b border-slate-100">
                <td className="py-0.5">{c.address}</td>
                <td>{c.date}</td>
                <td className="text-right tabular-nums">{gbp(c.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-3 border-t pt-2 text-[11px] text-slate-500">
        Sources: {r.source}; £/sq m from MHCLG EPC floor areas used in aggregate only;
        TfL PTAL (2015); English Indices of Deprivation 2025; data.police.uk. Data to {r.asof}; memo
        prepared {generated}. Guide only, not a valuation or financial advice.
      </footer>
    </main>
  );
}
