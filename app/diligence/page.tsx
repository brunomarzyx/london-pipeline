import Link from "next/link";
import DiligenceForm from "./diligence-form";

export const dynamic = "force-dynamic";

export default function DiligencePage() {
  return (
    <main className="mx-auto max-w-6xl bg-slate-50 p-4 text-slate-900 md:p-6">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Due-diligence agent</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Paste a London sale listing. Muse Spark decides which checks to run — extraction,
        comparables, area risk, borough context — then gives a structured verdict where every
        number comes from the data. Nothing is fetched from listing sites.
      </p>
      <DiligenceForm />
    </main>
  );
}
