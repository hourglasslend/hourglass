import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const bodoni = Bodoni_Moda({ subsets: ["latin"], variable: "--font-bodoni", axes: ["opsz"], style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

import { SITE_URL } from "@/lib/site";
const DESCRIPTION = "Borrow USDG against your tokenized stocks on Robinhood Chain. Fixed rate, fixed term, no price liquidations.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Hourglass — Time, not price.",
  description: DESCRIPTION,
  alternates: { canonical: "./" },
  openGraph: { type: "website", siteName: "Hourglass", url: "./", title: "Hourglass — Time, not price.", description: DESCRIPTION },
  twitter: { card: "summary_large_image", site: "@hourglasslend", creator: "@hourglasslend", title: "Hourglass — Time, not price.", description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
