import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { chain, dep, isMainnet } from "@/lib/deployments";

/** The marketing home. Parts that read the chain come in as slots: live components on testnet/local,
 *  static ones before launch (src/app/prelaunch), so the pre-launch build never loads wallet code. */
export type HomeSlots = Record<"certificate" | "stats" | "markets" | "vaults" | "reserve" | "staked" | "ledger", ReactNode>;

/* eslint-disable @next/next/no-img-element */
export function HomePage({ certificate, stats, markets, vaults, reserve, staked, ledger }: HomeSlots) {
  return (
    <div className="m">
      <SiteNav />

      <header className="hero ruled">
        <img className="ghost" src="/brand/hourglass-engraving-white.svg" alt="" />
        <div className="wrap">
          <div>
            <div className="eyebrow">Fixed-term credit <b>·</b> Robinhood Chain</div>
            <h1>Time,<br /><i className="a">not price.</i></h1>
            <p className="sub">Borrow USDG against your tokenized stocks. Fixed rate, fixed term, and no price liquidations. Only the clock can end your loan.</p>
            <div className="ctas">
              <Link className="btn p" href="/app/borrow">Launch App</Link>
              <a className="btn s" href="#how">How it works</a>
            </div>
            <p className="note">Stocks and ETFs · 7 or 30 days · rate locked when you borrow</p>
          </div>
          {certificate}
        </div>
      </header>

      {stats}

      <main>
        <section id="problem">
          <div className="wrap">
            <div className="eyebrow">01 <b>·</b> Why Hourglass</div>
            <h2>A wick shouldn&apos;t cost<br />you your <i className="a">shares.</i></h2>
            <p className="lead">Stock tokens trade around the clock. The stock market doesn&apos;t. On a thin Saturday, one bad print can push a price-based loan over its line and sell your collateral, even if the price is back by Monday morning.</p>
            <div className="card" style={{ marginTop: 16, padding: "28px 28px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div className="eyebrow">Stock token · illustrative weekend</div>
                <div className="eyebrow">Fri close → Mon open</div>
              </div>
              <svg viewBox="0 0 1100 300" style={{ width: "100%", height: "auto", marginTop: 16, display: "block" }}>
                <rect x="330" y="0" width="420" height="270" fill="#141414" />
                <text x="540" y="22" fill="#8E8E88" fontFamily="var(--f-mono)" fontSize="11" textAnchor="middle" letterSpacing="2">US MARKET CLOSED</text>
                <g stroke="#1f1f1f"><line x1="0" y1="70" x2="1100" y2="70" /><line x1="0" y1="140" x2="1100" y2="140" /><line x1="0" y1="210" x2="1100" y2="210" /></g>
                <line x1="0" y1="186" x2="1100" y2="186" stroke="#F0524F" strokeDasharray="6 6" />
                <text x="1096" y="180" fill="#F0524F" fontFamily="var(--f-mono)" fontSize="11" textAnchor="end">PRICE-LIQUIDATION LINE</text>
                <polyline fill="none" stroke="#F2EEE6" strokeWidth="2.5" points="0,110 60,104 120,112 180,98 240,106 300,100 330,104 380,112 430,118 470,126 500,124 520,210 540,132 590,128 640,120 690,114 750,108 800,100 860,94 920,98 980,90 1040,86 1100,82" />
                <circle cx="520" cy="210" r="7" fill="#F0524F" />
                <line x1="520" y1="210" x2="520" y2="248" stroke="#F0524F" />
                <text x="520" y="262" fill="#F0524F" fontFamily="var(--f-mono)" fontSize="12" textAnchor="middle">Sat · one thin print</text>
                <circle cx="1040" cy="86" r="6" fill="#FFB800" />
                <text x="1030" y="64" fill="#FFB800" fontFamily="var(--f-mono)" fontSize="12" textAnchor="end">Mon: price back above Friday</text>
                <g fontFamily="var(--f-mono)" fontSize="11" fill="#8E8E88"><text x="10" y="292">FRI</text><text x="340" y="292">SAT</text><text x="560" y="292">SUN</text><text x="760" y="292">MON</text></g>
              </svg>
              <div className="legend">
                <span><i style={{ background: "#F2EEE6" }} />Token price</span>
                <span><i style={{ background: "#F0524F" }} />Where a price-based loan gets liquidated</span>
                <span><i style={{ background: "#141414", height: 10, border: "1px solid #2a2a2a" }} />US market closed</span>
              </div>
            </div>
            <div className="compare">
              <div className="card">
                <h3><span className="chip c-down">Price-based lending</span></h3>
                <ul>
                  <li><i>×</i>Liquidated the moment price touches a line, at any hour</li>
                  <li><i>×</i>Variable rate: your cost changes after you borrow</li>
                  <li><i>×</i>Collateral sold at a penalty; the rest is gone</li>
                  <li><i>×</i>Weekend gaps decide your fate while the market is shut</li>
                </ul>
              </div>
              <div className="card" style={{ borderColor: "#3a3020" }}>
                <h3><span className="chip c-amber">Hourglass</span></h3>
                <ul>
                  <li><i className="a">✓</i>No price liquidation. Only missing your date can end the loan</li>
                  <li><i className="a">✓</i>Rate fixed when you borrow, for the whole term</li>
                  <li><i className="a">✓</i>If it ever goes to auction, every dollar above your debt comes back to you</li>
                  <li><i className="a">✓</i>Due dates always land Tue–Thu, during US market hours</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="ruled">
          <div className="wrap">
            <div className="eyebrow">02 <b>·</b> How it works</div>
            <h2>Three steps. <i className="a">One date.</i></h2>
            <p className="lead">Every loan is a certificate with one number that matters: the date you repay by.</p>
            <div className="hsteps">
              <div className="card"><div className="n">I.</div><h3>Lock your stocks</h3><p>Deposit a listed stock token. Pick 7 or 30 days.</p></div>
              <div className="card"><div className="n">II.</div><h3>Get USDG at a fixed rate</h3><p>The rate and the due date are written on your certificate the moment you borrow. Nothing changes after.</p></div>
              <div className="card"><div className="n">III.</div><h3>Repay or roll over</h3><p>Repay any time before the date and take your stocks back. Need longer? Roll over in one click from 3 days before.</p></div>
            </div>
            <div className="ifbox">
              <div><div className="eyebrow">And if you miss the date?</div><h3 style={{ marginTop: 6 }}>You still keep the surplus.</h3></div>
              <div className="flow"><span>DUE DATE</span><b>→</b><span>24H GRACE</span><b>→</b><span>AUCTION AT ORACLE PRICE</span><b>→</b><span>VAULT IS REPAID</span><b>→</b><span className="a">SURPLUS RETURNED TO YOU</span></div>
            </div>
          </div>
        </section>

        <section id="markets">
          <div className="wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <div><div className="eyebrow">03 <b>·</b> Markets</div><h2>Listed stocks. <i className="a">Public terms.</i></h2><p className="lead">Loan-to-value and rate bands are set per asset and per term. Today&apos;s rate is read live from the contracts.</p></div>
              <div className="eyebrow">Oracle: Chainlink · US session aware</div>
            </div>
            {markets}
            <p style={{ marginTop: 18, fontSize: 13 }}>Opening a loan while the US market is closed lowers max LTV by 10 points. &quot;Paused&quot; means the stock token&apos;s issuer has paused its price (e.g. a corporate action): no new loans until it resumes; repayments always work.</p>
          </div>
        </section>

        <section id="lend" className="ruled">
          <div className="wrap">
            <div className="eyebrow">04 <b>·</b> For lenders</div>
            <h2>Lend USDG. <i className="a">Know when it comes back.</i></h2>
            <p className="lead">Every loan has a due date, so vault cash keeps coming home. If idle cash runs short you join a first-in, first-out queue, filled by the next repayments.</p>
            {vaults}
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn p" href="/app/lend">Lend USDG</Link>
              <a className="btn s" href="#safety">How lenders are protected</a>
            </div>
          </div>
        </section>

        <section id="safety">
          <div className="wrap">
            <div className="eyebrow">05 <b>·</b> Safety</div>
            <h2>Five layers <i className="a">between a gap and a lender.</i></h2>
            <p className="lead">No price liquidations means the protocol has to be careful before anything goes wrong. Each layer only matters if the one above it fails.</p>
            <div className="layers">
              <div className="layer"><div className="k">1</div><div><h3>Low loan-to-value</h3><p>40–60% on stocks. A loan only loses money if the stock falls more than half before the due date and the borrower walks away.</p></div><div className="mm">LTV 40–60% · weekends −10 pts</div></div>
              <div className="layer"><div className="k">2</div><div><h3>Session-aware oracle</h3><p>Chainlink prices, checked against US market hours and the issuer&apos;s pause flag. A paused or stale price can&apos;t open a loan or start an auction.</p></div><div className="mm">Chainlink · 24/5 · pause-aware</div></div>
              <div className="layer"><div className="k">3</div><div><h3>Auction anchored to the oracle</h3><p>102% → 70% of oracle value over 8 market hours. The clock stops when the market is closed or the price is unusable.</p></div><div className="mm">102% → 85% → 70%</div></div>
              <div className="layer"><div className="k">4</div><div><h3>USDG reserve</h3><p>Part of every fee builds a reserve that pays any shortfall to the vault automatically.</p></div><div className="mm">{reserve}</div></div>
              <div className="layer"><div className="k">5</div><div><h3>Staked $GLASS</h3><p>Stakers back lenders last. Up to 30% of the stake can be used per shortfall event.</p></div><div className="mm">{staked}</div></div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
              <span className="chip c-up">● Internal security review · 3 Oct 2026 · all findings fixed</span>
              <span className="chip c-dash">External audit · pending</span>
              <span className="chip c-mute">61 contract tests · fuzzing</span>
            </div>
          </div>
        </section>

        <section id="glass" className="ruled">
          <div className="wrap">
            <div className="eyebrow">06 <b>·</b> $GLASS</div>
            <h2>A token with <i className="a">a job.</i></h2>
            <p className="lead">Every fee Hourglass earns is split the same way, on-chain, every time. $GLASS sits behind lenders, and is paid for doing it.</p>
            <div className="split">
              <div style={{ width: "40%", background: "var(--amber)", color: "var(--ink)" }}>40% · STAKERS (USDG)</div>
              <div style={{ width: "30%", background: "#2a2a2a" }}>30% · BUYBACK</div>
              <div style={{ width: "30%", background: "#1c1c1c", color: "var(--ash)" }}>30% · RESERVE → TREASURY</div>
            </div>
            <div className="tok">
              <div className="card"><div className="eyebrow">Earn</div><h3 style={{ marginTop: 8 }}>Real yield in USDG</h3><p>Stake GLASS and receive 40% of every fee, streamed over 7 days. Paid in dollars, not in more tokens.</p></div>
              <div className="card"><div className="eyebrow">Buyback</div><h3 style={{ marginTop: 8 }}>Half burned, half to the stake</h3><p>30% of fees buy GLASS on the open market. 50% is burned, 50% is added to the safety module.</p></div>
              <div className="card"><div className="eyebrow">Protect</div><h3 style={{ marginTop: 8 }}>The last line for lenders</h3><p>Staked GLASS covers what the reserve can&apos;t. 10-day cooldown, so nobody runs ahead of a loss.</p></div>
            </div>
            {isMainnet ? (
                <p style={{ marginTop: 22, fontSize: 13 }}>Launched on Pons, GLASS/ETH. Official token: <a className="a mono" style={{ wordBreak: "break-all" }} href={`${chain.blockExplorers?.default.url}/token/${dep.glass}`} target="_blank" rel="noopener noreferrer">{dep.glass}</a>. No price targets, no promises of returns.</p>
              ) : (
                <p style={{ marginTop: 22, fontSize: 13 }}>Launch: Pons, GLASS/ETH. The contract address is published here and on X at launch only. No price targets, no promises of returns.</p>
              )}
          </div>
        </section>

        <section id="ledger">
          <div className="wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
              <div><div className="eyebrow">07 <b>·</b> Public ledger</div><h2>Every dollar, <i className="a">on the record.</i></h2></div>
              <Link className="btn s sm" href="/app/ledger">Open full ledger</Link>
            </div>
            {ledger}
          </div>
        </section>

        <section id="faq" className="ruled">
          <div className="wrap" style={{ maxWidth: 900 }}>
            <div className="eyebrow">08 <b>·</b> FAQ</div>
            <h2>Questions.</h2>
            <div className="faq">
              <details open><summary>Can my loan be liquidated if the price drops?</summary><p>No. Price never ends an Hourglass loan. The only thing that can is not repaying by the date on your certificate plus a 24-hour grace period.</p></details>
              <details><summary>What happens if I miss the date?</summary><p>After 24 hours of grace your collateral goes to a Dutch auction priced from the oracle. The vault is repaid principal, interest and a 1% late fee. Everything above that is yours to claim.</p></details>
              <details><summary>Why are due dates always Tuesday to Thursday?</summary><p>So that anything that has to happen on the due date happens while the US market is open and prices are live, never on a weekend gap.</p></details>
              <details><summary>Can I repay early?</summary><p>Yes, any time. You pay interest for the days used, with a minimum of 3 days on 7-day loans and 10 days on 30-day loans.</p></details>
              <details><summary>Can I borrow on a weekend?</summary><p>Yes, at 10 points lower LTV, because the oracle price is frozen until Monday.</p></details>
              <details><summary>What does it cost?</summary><p>Your fixed rate, plus an origination fee of 0.06% on 7-day loans or 0.25% on 30-day loans. Everything is shown before you sign.</p></details>
              <details><summary>Who can borrow?</summary><p>Stock tokens can&apos;t be offered to persons in the US, Canada, the UK or Switzerland, so borrowing isn&apos;t available there. Lending USDG is. Sanctioned regions are blocked entirely.</p></details>
              <details><summary>What can&apos;t the protocol protect against?</summary><p>The stock token issuer can pause or block any address, including Hourglass contracts. This is disclosed in full on the <Link href="/risks" className="a">Risks page</Link>.</p></details>
            </div>
          </div>
        </section>

        <section className="final">
          <img className="ghost" src="/brand/hourglass-engraving-white.svg" alt="" />
          <div className="wrap" style={{ position: "relative" }}>
            <div className="eyebrow">Fixed rate <b>·</b> Fixed term <b>·</b> No price liquidations</div>
            <h2 style={{ fontSize: "clamp(48px,6vw,84px)", marginTop: 18 }}>Borrow on <i className="a">time.</i></h2>
            <Link className="btn p" href="/app/borrow" style={{ marginTop: 20 }}>Launch App</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
