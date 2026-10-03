import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import { TG_URL, X_URL } from "@/components/site/SiteFooter";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = { title: "Hourglass App" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <TopBar />
      <main className="amain">{children}</main>
      <footer className="afoot">
        <span>Hourglass · fixed-term credit on Robinhood Chain</span>
        <span style={{ display: "flex", gap: 16 }}>
          <Link href="/docs">Docs</Link>
          <Link href="/risks">Risks</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={X_URL} target="_blank" rel="noopener noreferrer">X</a>
          <a href={TG_URL} target="_blank" rel="noopener noreferrer">Telegram</a>
        </span>
      </footer>
    </Providers>
  );
}
