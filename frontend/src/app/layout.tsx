import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMARTWATCH — Stock Watchlist Intelligence",
  description:
    "Don't watch everything. Know what changed. A smart watchlist with personal market memory and AI-verified analysis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
