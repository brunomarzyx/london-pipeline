import Link from "next/link";
import CheckForm from "./check-form";

export default function CheckPage() {
  return (
    <main className="mx-auto max-w-3xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Check a listing</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Paste the text of a London sale listing. Muse Spark pulls out the price, floor area, postcode,
        type and bedrooms; the verdict then comes from the size-adjusted comparables, not from the
        model. Paste text only: nothing is fetched from listing sites.
      </p>
      <CheckForm />
    </main>
  );
}
