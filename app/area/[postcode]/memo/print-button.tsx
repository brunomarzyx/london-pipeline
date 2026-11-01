"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
