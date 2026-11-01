/** Client-safe label helpers for cached demo runs (no Node imports). */
export interface CacheLabel {
  at: string;
  mock: boolean;
}

/** "cached run · 1 Nov 2026" (adds "mock" when recorded from fixtures). */
export function formatCacheLabel(l: CacheLabel): string {
  const d = new Date(l.at);
  const date = Number.isNaN(d.getTime())
    ? l.at.slice(0, 10)
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `cached run · ${date}${l.mock ? " · mock fixtures" : ""}`;
}
