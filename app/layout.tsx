import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "London Pipeline",
  description: "London housing supply vs price, explained by Meta Muse Spark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-500">
          <p>For information only. Not financial, investment or property advice. Figures are estimates from public data and may be wrong.</p>
          <p className="mt-1">
            <a className="underline" href="https://github.com/brunomarzyx/london-pipeline#data-sources-and-licences">
              Data sources &amp; licences
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
