import Link from "next/link";

export const X_URL = "https://x.com/hourglasslend";
export const TG_URL = "https://t.me/hourglass_chat";

/* eslint-disable @next/next/no-img-element */
export function SiteFooter() {
  return (
    <footer className="mfoot">
      <div className="wrap">
        <div className="cols">
          <div><img src="/brand/hourglass-lockup-full-on-dark.svg" alt="Hourglass" style={{ height: 46 }} /><p style={{ marginTop: 18, maxWidth: 320, fontSize: 14 }}>Fixed-term, fixed-rate loans against tokenized stocks on Robinhood Chain.</p></div>
          <div><h4>Product</h4><ul><li><Link href="/app/borrow">Borrow</Link></li><li><Link href="/app/lend">Lend</Link></li><li><Link href="/app/auctions">Auctions</Link></li><li><Link href="/app/safety">Safety</Link></li></ul></div>
          <div><h4>Learn</h4><ul><li><Link href="/docs">Docs</Link></li><li><Link href="/risks">Risks</Link></li><li><Link href="/app/ledger">Ledger</Link></li><li><Link href="/docs#contracts">Contracts</Link></li></ul></div>
          <div><h4>Company</h4><ul><li><a href={X_URL} target="_blank" rel="noopener noreferrer">X · @hourglasslend</a></li><li><a href={TG_URL} target="_blank" rel="noopener noreferrer">Telegram</a></li><li><Link href="/terms">Terms</Link></li><li><Link href="/privacy">Privacy</Link></li></ul></div>
        </div>
        <div className="legal">Hourglass is a set of smart contracts on Robinhood Chain. It is not a bank and does not hold your funds. Borrowing against stock tokens is not available to persons in the United States, Canada, the United Kingdom, Switzerland or sanctioned jurisdictions. Stock tokens are issued by a third party that can pause or restrict them. Lending and borrowing carry risk of loss. Nothing here is investment advice.</div>
      </div>
    </footer>
  );
}
