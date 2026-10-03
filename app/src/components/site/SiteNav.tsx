import Link from "next/link";

/* eslint-disable @next/next/no-img-element */
export function SiteNav() {
  return (
    <nav className="mnav">
      <div className="wrap">
        <Link href="/"><img src="/brand/hourglass-lockup-on-dark.svg" alt="Hourglass" style={{ height: 30, display: "block" }} /></Link>
        <div className="links">
          <Link href="/#how">How it works</Link>
          <Link href="/#markets">Markets</Link>
          <Link href="/#lend">Lend</Link>
          <Link href="/#safety">Safety</Link>
          <Link href="/#glass">$GLASS</Link>
          <Link href="/docs">Docs</Link>
        </div>
        <Link className="btn p sm" href="/app/borrow">Launch App</Link>
      </div>
    </nav>
  );
}
