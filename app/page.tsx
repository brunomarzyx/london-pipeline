import { getAllMetrics } from "@/lib/db";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  const metrics = getAllMetrics();
  return <Dashboard metrics={metrics} />;
}
