"use client";
import Link from "next/link";
import { useState } from "react";
import type { Extraction, ListingFields, ListingVerdict } from "@/lib/listing";
import { formatCacheLabel, type CacheLabel } from "@/lib/cache-label";
import PriceCheck from "../area/[postcode]/widgets";

const gbp = (v: number | null) =>
  v == null ? "no data" : `£${Math.round(v).toLocaleString("en-GB")}`;

const POSITION = {
  below: "below the range",
  within: "within the range",
  above: "above the range",
} as const;

async function post<T>(body: unknown): Promise<T> {
  const live = new URLSearchParams(window.location.search).get("live") === "1";
  const res = await fetch(`/api/check${live ? "?live=1" : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new Error(j?.code === "daily_cap" ? j.error : "Request failed");
  }
  return res.json() as Promise<T>;
}

export default function CheckForm() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [ex, setEx] = useState<(Extraction & { cached?: CacheLabel }) | null>(null);
  const [f, setF] = useState<ListingFields | null>(null);
  const [verdict, setVerdict] = useState<ListingVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function onFile(file: File | undefined) {
    setImage(null);
    setImageName("");
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 4_000_000) {
      setErr("Floorplan must be a PNG, JPEG or WebP under 4 MB.");
      return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function extract() {
    setBusy(true);
    setErr("");
    setVerdict(null);
    try {
      const e = await post<Extraction & { cached?: CacheLabel }>({ action: "extract", text, image });
      setEx(e);
      setF(e.fields);
      if (e.fields.postcode) setVerdict(await post<ListingVerdict>({ action: "verdict", fields: e.fields }));
    } catch (e) {
      setErr(e instanceof Error && e.message !== "Request failed" ? e.message : "Could not read the listing. Try again.");
    }
    setBusy(false);
  }

  async function recheck() {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      setVerdict(await post<ListingVerdict>({ action: "verdict", fields: f }));
    } catch {
      setErr("Could not run the check. Try again.");
    }
    setBusy(false);
  }

  const num = (v: string): number | null => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const input = "w-full rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <label htmlFor="listing-text" className="text-sm font-semibold">Listing text</label>
        <textarea
          id="listing-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={20000}
          placeholder="Paste the description, price and address from the listing"
          className={`${input} mt-2`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="text-slate-600">
            Floorplan image (optional){" "}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {imageName && <span className="text-xs text-slate-500">{imageName} attached</span>}
          <button
            onClick={extract}
            disabled={busy || text.trim().length < 10}
            className="ml-auto rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Check listing"}
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      </div>

      {ex && f && (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">
            Extracted by Muse Spark (edit if wrong)
            {ex.cached ? (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                {formatCacheLabel(ex.cached)}
              </span>
            ) : null}
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <label>
              <span className="text-xs text-slate-500">Price (£)</span>
              <input className={input} inputMode="numeric" value={f.price ?? ""} onChange={(e) => setF({ ...f, price: num(e.target.value) })} />
            </label>
            <label>
              <span className="text-xs text-slate-500">Floor area (sq m)</span>
              <input className={input} inputMode="decimal" value={f.sqm ?? ""} onChange={(e) => setF({ ...f, sqm: num(e.target.value) })} />
            </label>
            <label>
              <span className="text-xs text-slate-500">Postcode</span>
              <input className={input} value={f.postcode ?? ""} onChange={(e) => setF({ ...f, postcode: e.target.value.trim() || null })} />
            </label>
            <label>
              <span className="text-xs text-slate-500">Type</span>
              <select className={input} value={f.type ?? ""} onChange={(e) => setF({ ...f, type: e.target.value === "flat" || e.target.value === "house" ? e.target.value : null })}>
                <option value="">Unknown</option>
                <option value="flat">Flat</option>
                <option value="house">House</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-slate-500">Bedrooms</span>
              <input className={input} inputMode="numeric" value={f.bedrooms ?? ""} onChange={(e) => setF({ ...f, bedrooms: num(e.target.value) })} />
            </label>
          </div>
          {ex.areaAsPrinted?.unit === "sqft" && (
            <p className="mt-2 text-xs text-slate-500">
              Listing says {ex.areaAsPrinted.value} sq ft; converted in code at 0.0929 sq m per sq ft.
            </p>
          )}
          {ex.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {ex.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <button onClick={recheck} disabled={busy} className="mt-3 rounded border border-sky-700 px-3 py-1 text-sm text-sky-700 disabled:opacity-50">
            Re-run check with these values
          </button>
        </div>
      )}

      {verdict && <VerdictCard v={verdict} />}
    </div>
  );
}

function VerdictCard({ v }: { v: ListingVerdict }) {
  if (v.status !== "ok")
    return (
      <div className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">No verdict</h2>
        <p className="mt-1 text-slate-700">{v.reasons.join(" ")}</p>
      </div>
    );
  const range = v.fair
    ? { low: v.fair.low, high: v.fair.high }
    : v.area?.p25 != null && v.area?.p75 != null
      ? { low: v.area.p25, high: v.area.p75 }
      : null;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">Verdict for {v.postcode}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${v.mode === "size_adjusted" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {v.mode === "size_adjusted" ? "size-adjusted" : "not size-adjusted"}
        </span>
      </div>

      {v.price == null ? (
        <p className="mt-2 text-sm text-slate-600">No asking price, so there is nothing to place against the range.</p>
      ) : v.position && range ? (
        <p className="mt-2 text-lg">
          Asking {gbp(v.price)} is <strong>{POSITION[v.position]}</strong>
          {v.askingPpsm != null && <span className="text-sm text-slate-600"> ({gbp(v.askingPpsm)}/sq m)</span>}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Not enough sales at this level to place the price.</p>
      )}

      {v.fair ? (
        <p className="mt-1 text-sm">
          Fair range for {v.fair.sqm} sq m: {gbp(v.fair.low)}–{gbp(v.fair.high)}, mid {gbp(v.fair.mid)}.{" "}
          <span className="text-slate-600">
            {gbp(v.fair.ppsmMedian)}/sq m median on {v.fair.ppsmName} (n = {v.fair.ppsmN} size-matched sales).
          </span>
        </p>
      ) : (
        v.area && (
          <p className="mt-1 text-sm">
            Typical {v.type ?? "property"} price on {v.area.name}: {gbp(v.area.median)}
            {v.area.p25 != null && v.area.p75 != null && <> (middle half {gbp(v.area.p25)}–{gbp(v.area.p75)})</>}
            <span className="text-slate-600"> · n = {v.area.n} sales</span>
          </p>
        )
      )}

      {v.reasons.length > 0 && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">{v.reasons.join(" ")}</p>
      )}

      {v.percentile != null && v.price != null && (
        <p className="mt-2 text-sm font-medium">
          {gbp(v.price)} is above {v.percentile}% of the {v.compPrices.length} most recent comparable sales.
        </p>
      )}
      {v.compPrices.length > 0 && <PriceCheck prices={v.compPrices} />}

      <p className="mt-3 text-xs text-slate-500">
        Comparables to {v.asof ?? "—"}; floor areas from EPC records matched to Land Registry sales. A starting point, not a valuation.
      </p>
      {v.link && (
        <Link href={v.link} className="mt-2 inline-block text-sm text-sky-700 hover:underline">
          Open the {v.postcode} neighbourhood page →
        </Link>
      )}
    </div>
  );
}
