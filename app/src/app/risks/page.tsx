import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, Sec } from "@/components/site/DocPage";

export const metadata: Metadata = {
  title: "Risks · Hourglass",
  description: "What can go wrong when borrowing or lending on Hourglass, and what the protocol can and cannot do about it.",
};

const TOC = [
  { id: "summary", label: "Summary" },
  { id: "contracts", label: "Smart contracts" },
  { id: "issuer", label: "Stock token issuer" },
  { id: "borrowers", label: "For borrowers" },
  { id: "lenders", label: "For lenders" },
  { id: "stakers", label: "For $GLASS stakers" },
  { id: "oracle", label: "Oracle & chain" },
  { id: "operations", label: "Keepers & operators" },
  { id: "governance", label: "Governance" },
  { id: "usdg", label: "USDG" },
  { id: "legal", label: "Legal & regional" },
];

export default function RisksPage() {
  return (
    <DocPage
      eyebrow="Risk disclosure"
      title={<>What can <i className="a">go wrong.</i></>}
      intro="Hourglass removes one risk, being liquidated because of a price move, and keeps every other risk of on-chain lending. This page lists them plainly. Read it before you deposit or borrow."
      updated="October 2026"
      toc={TOC}
    >
      <Sec id="summary" title="Summary">
        <ul>
          <li>You can lose some or all of the funds you put into the protocol.</li>
          <li>The contracts have had an internal review only. <b>An external audit is pending.</b></li>
          <li>The company that issues the stock tokens can pause, block or burn tokens at any address, including the Hourglass contracts. No code can prevent that.</li>
          <li>Borrowers who miss their date lose their collateral at auction and get back only the surplus.</li>
          <li>Lenders may wait up to about one term to withdraw, and can take a loss if an auction falls short and the safety module can&apos;t cover it.</li>
        </ul>
      </Sec>

      <Sec id="contracts" title="Smart contracts">
        <p>Hourglass is software. A bug could lock or lose funds. The contracts are tested (unit tests, fuzzing, regression tests for every review finding) and were reviewed internally on 3 October 2026, but they have <b>not yet been audited by an external firm</b>. Testing and review reduce risk; they do not remove it.</p>
        <p>The contracts are not upgradeable in place. A fix would mean deploying new contracts and moving to them.</p>
      </Sec>

      <Sec id="issuer" title="Stock token issuer">
        <p>The stock tokens accepted as collateral are issued by a third party, not by Hourglass. The issuer&apos;s contracts let it:</p>
        <ul>
          <li><b>Block</b> any address from sending or receiving the token. If <code>LoanManager</code> were blocked, all collateral of that token would be frozen and loans against it could neither be repaid in kind nor auctioned.</li>
          <li><b>Pause</b> the token or its price. While paused, no new loan, rollover or auction can happen on that asset. Repaying still works, but the collateral can only move once the token is unpaused.</li>
          <li><b>Burn</b> tokens from any address (<code>adminBurn</code>).</li>
        </ul>
        <p>If your own wallet is blocked, you can still repay and have the collateral sent to another address you choose. If the protocol&apos;s contract is blocked, there is nothing the protocol can do on-chain. Debt caps per asset limit how much any single token can affect a vault.</p>
        <p>A stock token gives you the economic exposure the issuer describes in its own terms. It is not the share itself and may not carry voting or other shareholder rights.</p>
      </Sec>

      <Sec id="borrowers" title="For borrowers">
        <ul>
          <li><b>Missing the date.</b> If you don&apos;t repay or roll over by the due date plus 24 hours of grace, your whole collateral lot is sold at auction. You pay a 1% late fee and receive the surplus, which may be well below what the shares were worth before the sale (the auction can go down to 70% of oracle value).</li>
          <li><b>No price liquidation does not mean no loss.</b> If the stock falls a lot, repaying may cost more than the shares are worth. You are free to walk away, and the collateral will be auctioned.</li>
          <li><b>Rollover is not guaranteed.</b> A rollover needs a usable price, a vault with room, and LTV within limits at today&apos;s price. If the price has dropped, rates have risen, or new loans are paused, you may need to add collateral, borrow less, or repay.</li>
          <li><b>Issuer pause near your date.</b> If the token is paused around your due date you can still repay, but you cannot roll over until it resumes. Auctions can&apos;t start while it is paused.</li>
          <li><b>Transactions.</b> You need USDG and ETH for gas on the right network before your date. Wallet, RPC or network problems on the day are your risk; repay early if in doubt.</li>
        </ul>
      </Sec>

      <Sec id="lenders" title="For lenders">
        <ul>
          <li><b>Withdrawal waits.</b> When most USDG is lent out you join a queue and are paid as loans repay. The usual wait is at most about one term, but loans that go to auction, issuer pauses or a blocked asset can make it longer.</li>
          <li><b>Bad debt.</b> If a stock gaps down past its LTV and the borrower walks away, the auction may not cover the loan. The USDG reserve pays first, then slashed GLASS. Anything left is a loss to the vault, shared by all depositors.</li>
          <li><b>Variable yield.</b> Each loan&apos;s rate is fixed, but the vault&apos;s yield changes with how much is lent out and at what rates. Past yield says nothing about future yield.</li>
          <li><b>Concentration.</b> Up to 20% of a vault can be lent against a single asset, and every asset depends on the same issuer.</li>
          <li><b>Share price drops.</b> When a loan&apos;s collateral falls below its debt ÷ 85%, an expected loss is taken out of the share price before anything is final. It is put back if the price recovers.</li>
        </ul>
      </Sec>

      <Sec id="stakers" title="For $GLASS stakers">
        <ul>
          <li>Up to <b>30% of all staked GLASS</b> can be slashed for each shortfall event the reserve can&apos;t cover. Several events can each open a new budget.</li>
          <li>Unstaking takes a 10-day cooldown and must happen in the 2-day window after it. Staked GLASS can&apos;t be sold during that time.</li>
          <li>Rewards are a share of real fees in USDG. If there are few loans, there are few rewards.</li>
          <li>GLASS trades on open markets and its price can fall to zero. Hourglass makes no statement about its value.</li>
        </ul>
      </Sec>

      <Sec id="oracle" title="Oracle & chain">
        <ul>
          <li><b>Oracle.</b> Prices come from Chainlink. A wrong price could let a loan open at too high a value or an auction sell too cheaply. Price age, market hours and issuer flags are checked, but the price itself is trusted.</li>
          <li><b>Weekend gaps.</b> Stock tokens can trade while the US market is closed, but Hourglass uses the last official price until it reopens. Loans opened on a weekend get less LTV for this reason.</li>
          <li><b>Sequencer.</b> Robinhood Chain is a rollup with a single sequencer and no Chainlink uptime feed yet. If the chain stops, borrowers may be unable to repay during grace. The guardian can delay auctions by up to 7 days at a time in that case, but only if it acts.</li>
          <li><b>Bridges and wallets.</b> Moving assets to and from Robinhood Chain uses services Hourglass does not control.</li>
        </ul>
      </Sec>

      <Sec id="operations" title="Keepers & operators">
        <ul>
          <li>Auctions, withdrawal queues and fee distributions need someone to send a transaction. The protocol runs a keeper, and anyone else can call the same functions. If no one does, things are delayed, not lost.</li>
          <li>If no one checkpoints an auction during a short token pause, that time still counts on the auction clock, which can lower the sale price.</li>
          <li>The GLASS buyback and the sale of slashed GLASS are carried out by an operator address, not by the contracts. These transactions are public but depend on the operator acting honestly and on time.</li>
        </ul>
      </Sec>

      <Sec id="governance" title="Governance">
        <p>The admin can, after a 48-hour public delay, change listings, LTVs, rate bands, caps, fees (within hard limits) and addresses. These changes never alter open loans, but they do affect new loans and the future of the vaults. The guardian can pause new loans immediately. Both are multisig wallets controlled by the team. You should watch the timelock if you hold large positions.</p>
      </Sec>

      <Sec id="usdg" title="USDG">
        <p>Loans, deposits and rewards are in USDG, a stablecoin issued by a third party. Hourglass values USDG at exactly $1. If USDG lost its peg or was frozen, every position in the protocol would be affected.</p>
      </Sec>

      <Sec id="legal" title="Legal & regional">
        <p>Stock tokens may not be offered to persons in the United States, Canada, the United Kingdom or Switzerland, so borrowing is not available there. Sanctioned jurisdictions are blocked from the app entirely. Laws on crypto-assets change, and a change could restrict access to the app or to the assets it uses. See the <Link href="/terms">Terms</Link>.</p>
        <p>Nothing on this site is financial, investment, tax or legal advice.</p>
      </Sec>
    </DocPage>
  );
}
