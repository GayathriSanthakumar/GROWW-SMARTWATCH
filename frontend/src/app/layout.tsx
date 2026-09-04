import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMARTWATCH — Stock Watchlist Intelligence",
  description:
    "Don't watch everything. Know what changed. Groww-style watchlists with Warifin-style AI intelligence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
