import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "London Pipeline",
  description: "London housing supply vs price, explained by Meta Muse Spark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
