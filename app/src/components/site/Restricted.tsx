import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteNav } from "./SiteNav";

/* eslint-disable @next/next/no-img-element */
export function Restricted({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="m">
      <SiteNav />
      <section className="final" style={{ borderTop: 0, minHeight: "62vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img className="ghost" src="/brand/hourglass-engraving-white.svg" alt="" />
        <div className="wrap" style={{ position: "relative", maxWidth: 760 }}>
          <div className="eyebrow">Not available in your region</div>
          <h2 style={{ fontSize: "clamp(40px,5vw,64px)", marginTop: 18 }}>{title}</h2>
          <div className="lead" style={{ margin: "0 auto", color: "var(--ash)" }}>{children}</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 30 }}>
            {actions}
            <Link className="btn s" href="/terms#eligibility">Read the Terms</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
