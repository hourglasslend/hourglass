import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";
import { StaticCertificate, StaticLedger, StaticMarkets, StaticStats, StaticVaults } from "@/components/home/Static";

// Served at "/" while NEXT_PUBLIC_NETWORK=prelaunch (rewrite in next.config.ts). No wallet code, no chain reads.
// A page-level openGraph replaces the inherited one, so the image is listed again here.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Hourglass",
    url: "/",
    title: "Hourglass — Time, not price.",
    description: "Borrow USDG against your tokenized stocks on Robinhood Chain. Fixed rate, fixed term, no price liquidations.",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "Hourglass — Time, not price." }],
  },
};

export default function PrelaunchHome() {
  return (
    <HomePage
      certificate={<StaticCertificate />}
      stats={<StaticStats />}
      markets={<StaticMarkets />}
      vaults={<StaticVaults />}
      reserve="Reserve — USDG"
      staked="— GLASS staked"
      ledger={<StaticLedger />}
    />
  );
}
