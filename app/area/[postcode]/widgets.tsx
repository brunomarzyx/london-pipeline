"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CompSale } from "@/lib/street";

export function LensToggle({ lens }: { lens: "buyer" | "investor" }) {
  const router = useRouter();
  const params = useSearchParams();
  const set = (l: "buyer" | "investor") => {
    const q = new URLSearchParams(params.toString());
    q.set("lens", l);
    router.replace(`?${q.toString()}`, { scroll: false });
  };
  const btn = (l: "buyer" | "investor", label: string) => (
    <button
      onClick={() => set(l)}
      aria-pressed={lens === l}
      className={
        lens === l
          ? "rounded bg-sky-700 px-3 py-1 text-white"
          : "rounded border px-3 py-1 text-sky-700"
      }
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Lens:</span>
      {btn("buyer", "Buyer")}
      {btn("investor", "Investor")}
    </div>
  );
}

export default function PriceCheck({ prices }: { prices: number[] }) {
  const [raw, setRaw] = useState("");
  const ask = Number(raw.replace(/[^0-9.]/g, ""));
  const pct =
    prices.length && Number.isFinite(ask) && ask > 0
      ? Math.round((prices.filter((c) => c < ask).length / prices.length) * 100)
      : null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label htmlFor="ask-price" className="text-sm text-slate-600">
        Asking price (£):
      </label>
      <input
        id="ask-price"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="650000"
        inputMode="numeric"
        className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
      />
      {pct != null && (
        <p className="text-sm font-medium text-slate-900">
          £{ask.toLocaleString("en-GB")} is above {pct}% of comparable sales.
        </p>
      )}
    </div>
  );
}

export function AreaMap({ comps, median }: { comps: CompSale[]; median: number | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current || mapObj.current || dead) return;
      const pts = comps.filter((c) => c.lat != null && c.lon != null);
      const map = L.map(mapRef.current).setView([51.5074, -0.1278], 14);
      mapObj.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const bounds: [number, number][] = [];
      for (const c of pts) {
        const above = median != null && c.price >= median;
        L.circleMarker([c.lat!, c.lon!], {
          radius: 5,
          color: above ? "#0369a1" : "#7dd3fc",
          fillColor: above ? "#0369a1" : "#7dd3fc",
          fillOpacity: 0.8,
          weight: 1,
        })
          .bindTooltip(`${c.address} — £${c.price.toLocaleString("en-GB")}`)
          .addTo(map);
        bounds.push([c.lat!, c.lon!]);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    })();
    return () => { dead = true; };
  }, [comps, median]);
  return <div ref={mapRef} className="h-64 w-full rounded-xl border" />;
}
