import Link from "next/link";

export const STREET_UNAVAILABLE_MESSAGE =
  "Street-level data is not installed on this server (data/street.db is missing). Borough pages, the map, Ask London and memos still work.";

export default function StreetUnavailable() {
  return (
    <main className="mx-auto max-w-3xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Street-level data unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">{STREET_UNAVAILABLE_MESSAGE}</p>
      <p className="mt-2 text-sm text-slate-600">
        To install it, run <code className="rounded bg-slate-200 px-1">scripts/fetch-street-db.sh</code> (see the
        README, &ldquo;Run it yourself&rdquo;).
      </p>
    </main>
  );
}
