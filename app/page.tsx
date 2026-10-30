import { getAllMetrics } from "@/lib/db";
import { listCityMetrics } from "@/lib/global-data";
import { fmtPct } from "@/lib/cycle-phase";
import Dashboard from "./dashboard";
import { getStreetDb } from "@/lib/street";

export const dynamic = "force-dynamic";

export default function Home() {
  const metrics = getAllMetrics();
  const cities = listCityMetrics();
  const london = cities.find((c) => c.key === "london");
  const tokyo = cities.find((c) => c.key === "tokyo");
  const headline =
    london == null
      ? "London housing pipeline versus prices, borough by borough."
      : `London real house prices ${fmtPct(london.real5y)} over 5 years, ` +
        `${fmtPct(london.distFromPeak)} vs the 10-year peak` +
        (tokyo == null ? "." : ` — Tokyo ${fmtPct(tokyo.distFromPeak)} off peak.`) +
        " See the Global tab.";
  return (
    <Dashboard
      metrics={metrics}
      headline={headline}
      streetOn={getStreetDb() != null}
    />
  );
}
