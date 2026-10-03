import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, X_URL } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

// Served at /app/* while NEXT_PUBLIC_NETWORK=prelaunch (rewrite in next.config.ts).
export const metadata: Metadata = { title: "Hourglass App", robots: { index: false } };

/* eslint-disable @next/next/no-img-element */
export default function AppSoon() {
  return (
    <div className="m">
      <SiteNav />
      <section className="final" style={{ borderTop: 0, minHeight: "62vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img className="ghost" src="/brand/hourglass-engraving-white.svg" alt="" />
        <div className="wrap" style={{ position: "relative" }}>
          <div className="eyebrow">Hourglass app <b>·</b> Robinhood Chain</div>
          <h2 style={{ fontSize: "clamp(44px,6vw,80px)", marginTop: 18 }}>Testnet opens <i className="a">soon.</i></h2>
          <p className="lead" style={{ margin: "0 auto" }}>Borrowing, lending, auctions and staking open on Robinhood Chain testnet first, with free test tokens for everyone.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
            <a className="btn p" href={X_URL} target="_blank" rel="noopener noreferrer">Follow @hourglasslend</a>
            <Link className="btn s" href="/docs">Read the docs</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
