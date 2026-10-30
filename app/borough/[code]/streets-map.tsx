"use client";
import { useEffect, useRef, useState } from "react";

interface Street {
  code: string;
  name: string;
  med: number | null;
  n: number;
  lat: number | null;
  lon: number | null;
}

const COLORS = ["#e0f2fe", "#7dd3fc", "#0284c7", "#0c4a6e", "#020617"];

export default function StreetsMap({ lad }: { lad: string }) {
  const [streets, setStreets] = useState<Street[] | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const res = await fetch(`/api/streets?lad=${lad}`);
      if (!res.ok || dead) {
        if (!dead) setStreets([]);
        return;
      }
      const data = (await res.json()) as { streets: Street[] };
      if (dead) return;
      setStreets(data.streets);
      const L = (await import("leaflet")).default;
      if (!mapRef.current || mapObj.current || dead) return;
      const pts = data.streets.filter((s) => s.lat != null && s.lon != null);
      if (!pts.length) return;
      const map = L.map(mapRef.current).setView([pts[0].lat!, pts[0].lon!], 12);
      mapObj.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const meds = pts
        .map((s) => s.med)
        .filter((m): m is number => m != null)
        .sort((a, b) => a - b);
      const q = (p: number) => meds[Math.min(meds.length - 1, Math.floor(p * meds.length))];
      const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];
      const colorFor = (m: number | null) => {
        if (m == null) return "#d4d4d8";
        let i = 0;
        for (const b of breaks) if (m > b) i++;
        return COLORS[Math.min(i, COLORS.length - 1)];
      };
      const bounds: [number, number][] = [];
      for (const s of pts) {
        L.circleMarker([s.lat!, s.lon!], {
          radius: 6,
          color: colorFor(s.med),
          fillColor: colorFor(s.med),
          fillOpacity: 0.8,
          weight: 1,
        })
          .bindTooltip(
            `${s.name} — ${s.med == null ? "no data" : "£" + Math.round(s.med).toLocaleString("en-GB")} (n=${s.n})`,
          )
          .addTo(map);
        bounds.push([s.lat!, s.lon!]);
      }
      map.fitBounds(bounds, { padding: [20, 20] });
    })();
    return () => { dead = true; };
  }, [lad]);

  if (streets != null && !streets.length)
    return <p className="mt-2 text-sm text-slate-500">No street data for this borough.</p>;
  return <div ref={mapRef} className="mt-2 h-72 w-full rounded-xl border" />;
}
