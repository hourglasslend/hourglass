import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, Sec } from "@/components/site/DocPage";
import { chain, dep, isMainnet, isPrelaunch, NETWORK } from "@/lib/deployments";
import { LISTING_GROUPS } from "@/lib/listings";

export const metadata: Metadata = {
  title: "Docs · Hourglass",
  description: "How Hourglass works: fixed-rate, fixed-term USDG loans against tokenized stocks, vaults, auctions, the safety module and governance.",
};

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "borrowing", label: "Borrowing" },
  { id: "overdue", label: "Overdue loans & auctions" },
  { id: "lending", label: "Lending" },
  { id: "oracle", label: "Prices & market hours" },
  { id: "safety", label: "Safety module & $GLASS" },
  { id: "fees", label: "Fees & revenue" },
  { id: "governance", label: "Governance" },
  { id: "keepers", label: "Keepers" },
  { id: "parameters", label: "Parameters" },
  { id: "contracts", label: "Contracts" },
];

const LISTINGS = LISTING_GROUPS.map((g) => ({
  group: g.group,
  symbols: g.rows.map((r) => r.symbol).join(", "),
  ltv7: `${g.rows[0].ltv7}%`,
  ltv30: `${g.rows[0].ltv30}%`,
  band: `${g.rows[0].rateMin}–${g.rows[0].rateMax}%`,
}));

export default function DocsPage() {
  const explorer = chain.blockExplorers?.default.url;
  const contracts = [
    { name: "LoanManager", note: "Loans, auctions, oracle checks", address: dep.loanManager },
    { name: "HourglassVault · 7D", note: "hgUSDG-7D", address: dep.vault7 },
    { name: "HourglassVault · 30D", note: "hgUSDG-30D", address: dep.vault30 },
    { name: "SafetyModule", note: "stkGLASS, USDG reserve", address: dep.safetyModule },
    { name: "FeeSplitter", note: "40 / 30 / 30", address: dep.feeSplitter },
    { name: "TimelockController", note: isMainnet ? "Owner of every contract, 48h delay" : "Owner of every contract", address: dep.timelock },
    ...(isMainnet ? [{ name: "GLASS", note: "Token, launched on Pons (GLASS/ETH)", address: dep.glass }, { name: "USDG", note: "Stablecoin used for every loan", address: dep.usdg }] : []),
  ];

  return (
    <DocPage
      eyebrow="Documentation"
      title={<>How Hourglass <i className="a">works.</i></>}
      intro="Fixed-rate, fixed-term USDG loans against tokenized stocks on Robinhood Chain. A loan ends when it is repaid, rolled over, or, if the date is missed, sold at auction with the surplus returned to the borrower. Price alone never ends a loan."
      updated="October 2026"
      toc={TOC}
    >
      <Sec id="overview" title="Overview">
        <p>Hourglass has three sides:</p>
        <ul>
          <li><b>Borrowers</b> lock a listed stock token and receive USDG. The rate and the due date are fixed when the loan opens.</li>
          <li><b>Lenders</b> deposit USDG into a 7-day or a 30-day vault. Each vault is the lender of every loan in its term.</li>
          <li><b>$GLASS stakers</b> back lenders against bad debt and receive 40% of protocol fees in USDG.</li>
        </ul>
        <p>Every term a loan depends on (rate, due date, fee, minimum interest, protocol cut) is recorded on the loan when it opens. Governance changes never apply to loans that are already open.</p>
        <div className="callout"><p><b>Status.</b> The contracts passed an internal security review on 3 October 2026. An external audit is pending. Read the <Link href="/risks">Risks</Link> page before using the protocol.</p></div>
      </Sec>

      <Sec id="borrowing" title="Borrowing">
        <h3>Opening a loan</h3>
        <p>Choose a stock token, the amount of collateral, a term (7 or 30 days) and the USDG you want. A loan opens only if all of these hold:</p>
        <ul>
          <li>The asset is listed and its price is usable (see <a href="#oracle">Prices &amp; market hours</a>).</li>
          <li>Loan-to-value is within the asset&apos;s limit for that term. While the US market is closed the limit is <b>10 points lower</b>.</li>
          <li>The loan is at least <b>100 USDG</b>.</li>
          <li>Total debt against that asset stays within <b>20% of the vault</b>, and vault utilization after the loan stays at or below <b>80%</b>.</li>
          <li>The rate and fee are no higher than the maximums you signed, so a parameter change can&apos;t be slipped in front of your transaction.</li>
        </ul>
        <p>You receive the loan amount minus the origination fee. Your collateral is held by <code>LoanManager</code>.</p>

        <h3>The rate</h3>
        <p>The rate is set by the vault&apos;s utilization <i>after</i> your loan, inside the asset&apos;s band, and then fixed until the due date:</p>
        <div className="formula">rate = bandMin + (bandMax − bandMin) × utilizationAfter / 80%</div>
        <p>Utilization is measured against the lower of the vault&apos;s current assets and its once-a-day snapshot, so a deposit made a minute before your loan can&apos;t make your rate cheaper (or anyone else&apos;s).</p>

        <h3>The due date</h3>
        <p>The due date is the open date plus the term, moved to the nearest <b>Tuesday, Wednesday or Thursday at 18:30 UTC</b> (14:30 ET in summer, 13:30 ET in winter). US market holidays are skipped. A 7-day loan therefore runs 5 to 9 days, and interest is charged for the actual time.</p>

        <h3>Repaying</h3>
        <ul>
          <li>Repay any time. You pay principal plus interest for the time used, with a minimum of <b>3 days</b> on 7-day loans and <b>10 days</b> on 30-day loans.</li>
          <li>Anyone may repay a loan, but the collateral always goes to the address the borrower chose. You can set that address in advance, which matters if your own wallet is ever restricted by the token issuer.</li>
          <li>Repaying, adding collateral and claiming a surplus can never be paused.</li>
        </ul>

        <h3>Adding collateral</h3>
        <p>You can add collateral to an open loan at any time, including weekends. It lowers the risk of a shortfall if your loan ever goes to auction, and it is needed if you roll over at a lower price.</p>

        <h3>Rolling over</h3>
        <p>From <b>3 days before the due date until the end of grace</b>, the borrower can roll a loan into a new one in a single transaction. Interest owed so far is settled, the collateral is valued again at today&apos;s price, and a new rate, fee and due date are set as for a new loan. If the new amount is smaller than what is owed you pay the difference; if larger, you receive it.</p>

        <h3>Example</h3>
        <p>94.20 NVDA at $236 is worth $22,231. You borrow 10,000 USDG for 7 days (45% LTV) at 12.00%.</p>
        <div className="scroll-x"><table><tbody>
          <tr><td>Origination fee (0.06%)</td><td className="n">6.00 USDG</td></tr>
          <tr><td>You receive</td><td className="n">9,994.00 USDG</td></tr>
          <tr><td>Interest for 7 days</td><td className="n">23.01 USDG</td></tr>
          <tr><td>Repay by the due date</td><td className="n">10,023.01 USDG</td></tr>
        </tbody></table></div>
      </Sec>

      <Sec id="overdue" title="Overdue loans & auctions">
        <h3>Grace</h3>
        <p>After the due date there is a <b>24-hour grace period</b> with no penalty. Repaying or rolling over still works as normal.</p>

        <h3>Auction</h3>
        <p>When grace ends, anyone can start the auction (the protocol&apos;s keeper does it automatically). The whole collateral lot is offered in a Dutch auction priced from the oracle, not from the debt, so the price tracks what the shares are worth:</p>
        <div className="formula">{"lot price = oracle value of the lot × multiplier\nmultiplier: 102% → 85% over the first 4 active hours\n            85% → 70% over the next 4 active hours"}</div>
        <p>The clock only runs while the US market is open and the price is usable. Weekends, holidays, a stale feed or an issuer pause stop it. Auctions can only start, and lots can only be bought, while the market is open. After 8 active hours with no buyer, the safety module may buy the lot at 70% with its reserve.</p>

        <h3>Where the money goes</h3>
        <ol>
          <li>The vault receives principal, its share of the interest, and a <b>1% late fee</b> on principal.</li>
          <li>The protocol receives its 10% share of the interest.</li>
          <li><b>Everything above that is the borrower&apos;s</b>, claimable in the app under Certificates.</li>
          <li>If the sale doesn&apos;t cover the vault, the safety module pays the gap (see <a href="#safety">Safety module</a>).</li>
        </ol>
        <p>Continuing the example: NVDA falls to $200 and the loan is missed. The lot is worth $18,840 and sells at a 95% multiplier for 17,898 USDG. The vault receives 10,120.71, the protocol 2.30, and <b>7,774.99 USDG goes back to the borrower</b>.</p>
      </Sec>

      <Sec id="lending" title="Lending">
        <h3>Vaults</h3>
        <p>There are two ERC-4626 vaults in USDG: <code>hgUSDG-7D</code> and <code>hgUSDG-30D</code>. Deposits receive vault shares. The share price rises as interest accrues on open loans, second by second, so it does not jump when a loan is repaid.</p>
        <div className="formula">{"vault assets = idle USDG\n             + principal lent out\n             + interest accrued on open loans\n             − provisions for loans at risk"}</div>

        <h3>Withdrawing</h3>
        <ul>
          <li>If the vault has enough idle USDG, you withdraw immediately.</li>
          <li>Otherwise you join a <b>first-in, first-out queue</b>. Repayments fill the queue before anything else. Because every loan has a due date, the wait is at most about one term (7 or 30 days).</li>
          <li>Withdrawals never push utilization above 80%. The part that would is kept in the queue until more loans repay.</li>
          <li>Requests can be cancelled while they wait.</li>
        </ul>

        <h3>Protections built into the vault</h3>
        <ul>
          <li>Shares received from a deposit or transfer are locked for <b>5 minutes</b>, so nobody can deposit, borrow cheaply and withdraw in one go. Amounts under 1 USDG don&apos;t lock the receiver.</li>
          <li>Deposits are paused while the vault has a loan in auction, so nobody can buy shares just before a settlement and sell just after.</li>
          <li>Anyone can mark a loan whose collateral is worth less than its debt ÷ 85%, even before its due date. The expected loss is then taken out of the share price straight away and put back if the price recovers or the loan is repaid.</li>
          <li>Each vault has a deposit cap: 250,000 USDG at mainnet launch, raised over time by governance.</li>
        </ul>
      </Sec>

      <Sec id="oracle" title="Prices & market hours">
        <p>Prices come from Chainlink feeds, one per stock token. Spot prices from on-chain pools are never used anywhere.</p>
        <div className="scroll-x"><table>
          <thead><tr><th>Check</th><th>Rule</th></tr></thead>
          <tbody>
            <tr><td>Market open</td><td>Price must be no older than <b>25 hours</b>.</td></tr>
            <tr><td>Market closed</td><td>Friday 21:00 UTC to Monday 01:00 UTC, plus US market holidays. Price may be up to <b>72 hours</b> old; new loans get 10 points less LTV; auctions don&apos;t run.</td></tr>
            <tr><td>Issuer flags</td><td>If the stock token reports <code>paused</code> or <code>oraclePaused</code> (for example during a corporate action), no loan can open, roll over or go to auction on that asset. Repaying and adding collateral still work.</td></tr>
            <tr><td>Sanity</td><td>Answer above zero, complete round, 8 decimals.</td></tr>
          </tbody>
        </table></div>
        <p>Feed prices already include the issuer&apos;s corporate-action multiplier. USDG is valued at $1.</p>
      </Sec>

      <Sec id="safety" title="Safety module & $GLASS">
        <h3>Staking</h3>
        <ul>
          <li>Stake GLASS to receive stkGLASS. Stakers earn <b>40% of protocol fees in USDG</b>, streamed over 7 days after each distribution.</li>
          <li>To unstake, start a <b>10-day cooldown</b>, then withdraw within the following <b>2-day window</b>. The cooldown means nobody can leave just ahead of a loss.</li>
        </ul>
        <h3>If an auction falls short</h3>
        <ol>
          <li>The <b>USDG reserve</b> in the safety module pays the vault automatically, in the same transaction.</li>
          <li>Anything the reserve can&apos;t cover opens a <b>slash budget of 30%</b> of the GLASS staked at that moment. The guardian can slash within that budget, at most once a day. Slashed GLASS goes only to the recovery address, is sold, and the USDG is paid to the vault.</li>
          <li>Anything left is a loss shared by the vault&apos;s depositors in proportion to their shares.</li>
        </ol>
      </Sec>

      <Sec id="fees" title="Fees & revenue">
        <div className="scroll-x"><table>
          <thead><tr><th>Fee</th><th className="n">Rate</th><th>Paid to</th></tr></thead>
          <tbody>
            <tr><td>Origination, 7-day loan</td><td className="n">0.06%</td><td>Protocol</td></tr>
            <tr><td>Origination, 30-day loan</td><td className="n">0.25%</td><td>Protocol</td></tr>
            <tr><td>Share of interest</td><td className="n">10%</td><td>Protocol (90% to lenders)</td></tr>
            <tr><td>Late fee, only if a loan goes to auction</td><td className="n">1% of principal</td><td>Lenders</td></tr>
          </tbody>
        </table></div>
        <p>Rollovers pay the origination fee of the new term. Hard limits in the contracts: origination ≤ 1%, interest share ≤ 20%.</p>
        <p>Protocol fees collect in <code>FeeSplitter</code>. Anyone can trigger a distribution:</p>
        <ul>
          <li><b>40%</b> to stakers, in USDG.</li>
          <li><b>30%</b> to the buyback operator, who buys GLASS on the open market (USDG → ETH → GLASS). Half is burned, half is added to the safety module.</li>
          <li><b>30%</b> to the USDG reserve until it reaches its target (25,000 USDG at launch), then to the treasury.</li>
        </ul>
        <p>Every distribution is listed on the <Link href="/app/ledger">public ledger</Link>.</p>
      </Sec>

      <Sec id="governance" title="Governance">
        <div className="scroll-x"><table>
          <thead><tr><th>Role</th><th>Can</th><th>Cannot</th></tr></thead>
          <tbody>
            <tr><td><b>Timelock</b> (48 h delay). Admin proposes, anyone executes</td><td>List or delist assets; change LTV, rate bands, caps and fees within hard limits; set addresses</td><td>Change the terms of an open loan</td></tr>
            <tr><td><b>Guardian</b> (no delay)</td><td>Pause new loans and rollovers; cancel queued timelock proposals; add future holidays; push back the earliest auction start (up to 7 days, forward only); slash within an open budget</td><td>Pause repayment, adding collateral, withdrawals or surplus claims</td></tr>
          </tbody>
        </table></div>
        <p>The deployer keeps no role. Every change goes through the timelock and is visible on-chain for 48 hours before it can take effect.</p>
      </Sec>

      <Sec id="keepers" title="Keepers">
        <p>Some actions have to be triggered by a transaction. The protocol runs a keeper bot for them, but none needs a special role: <b>anyone can call every one of them</b>.</p>
        <ul>
          <li><code>startAuction</code> once a loan&apos;s grace has ended.</li>
          <li><code>pokeAuction</code> every few minutes during an auction, so pauses are kept off the auction clock.</li>
          <li><code>markLoan</code> when collateral value falls, so vault share prices reflect expected losses.</li>
          <li><code>processQueue</code> to pay waiting withdrawals.</li>
          <li><code>distribute</code> on <code>FeeSplitter</code>.</li>
        </ul>
      </Sec>

      <Sec id="parameters" title="Parameters">
        <p>First listings planned for mainnet. The contracts are always the source of truth; today&apos;s rates are on the <Link href="/#markets">Markets</Link> table.</p>
        <div className="scroll-x"><table>
          <thead><tr><th>Group</th><th>Assets</th><th className="n">LTV 7D</th><th className="n">LTV 30D</th><th className="n">Rate band</th></tr></thead>
          <tbody>
            {LISTINGS.map((l) => (
              <tr key={l.group}><td><b>{l.group}</b></td><td>{l.symbols}</td><td className="n">{l.ltv7}</td><td className="n">{l.ltv30}</td><td className="n">{l.band}</td></tr>
            ))}
          </tbody>
        </table></div>
        <div className="scroll-x"><table><tbody>
          <tr><td>Minimum loan</td><td className="n">100 USDG</td></tr>
          <tr><td>Max debt per asset</td><td className="n">20% of vault</td></tr>
          <tr><td>Max utilization</td><td className="n">80%</td></tr>
          <tr><td>Weekend LTV reduction</td><td className="n">10 points</td></tr>
          <tr><td>Grace</td><td className="n">24 hours</td></tr>
          <tr><td>Rollover window</td><td className="n">3 days before due</td></tr>
          <tr><td>Minimum interest (7D / 30D)</td><td className="n">3 / 10 days</td></tr>
          <tr><td>Auction</td><td className="n">102% → 85% → 70%, 8 active hours</td></tr>
          <tr><td>Unstake cooldown / window</td><td className="n">10 days / 2 days</td></tr>
          <tr><td>Slash budget per shortfall</td><td className="n">30% of stake</td></tr>
        </tbody></table></div>
      </Sec>

      <Sec id="contracts" title="Contracts">
        {isPrelaunch ? (
          <p>Contract addresses will be listed here when testnet opens. Until then, no Hourglass contract is live on any network: treat any address claiming to be Hourglass as fake.</p>
        ) : (
          <>
        <p>
          Network: <b>{NETWORK === "local" ? "local development chain" : chain.name}</b> (chain ID {chain.id}).
          {NETWORK === "local" ? " Testnet addresses will be listed here once the testnet deployment is live." : null}
        </p>
        <div className="scroll-x"><table>
          <thead><tr><th>Contract</th><th>Address</th></tr></thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.name}>
                <td><b>{c.name}</b><br /><span className="ash">{c.note}</span></td>
                <td className="addr">
                  {explorer && NETWORK !== "local" ? <a href={`${explorer}/address/${c.address}`} target="_blank" rel="noopener noreferrer">{c.address}</a> : c.address}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
          </>
        )}
        {isMainnet ? (
          <p>The only official $GLASS token is the GLASS address above. Check it on the explorer before buying or staking, and ignore any other address.</p>
        ) : (
          <p>$GLASS has not launched yet. Its address will be published here and on <a href="https://x.com/hourglasslend" target="_blank" rel="noopener noreferrer">@hourglasslend</a> at launch, and nowhere else.</p>
        )}
      </Sec>
    </DocPage>
  );
}
