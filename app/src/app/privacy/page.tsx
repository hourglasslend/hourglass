import type { Metadata } from "next";
import { DocPage, Sec } from "@/components/site/DocPage";

export const metadata: Metadata = {
  title: "Privacy · Hourglass",
  description: "What the Hourglass website collects (very little) and why.",
};

const TOC = [
  { id: "short", label: "In short" },
  { id: "onchain", label: "On-chain data" },
  { id: "site", label: "What the site handles" },
  { id: "browser", label: "Your browser" },
  { id: "third-parties", label: "Third parties" },
  { id: "rights", label: "Your choices" },
  { id: "changes", label: "Changes & contact" },
];

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title={<>Privacy.</>}
      intro="The Hourglass website has no accounts, no sign-up and no analytics. This page explains the little data that is involved and where it goes."
      updated="October 2026"
      toc={TOC}
    >
      <Sec id="short" title="In short">
        <ul>
          <li>We don&apos;t ask for your name, email or any identity document.</li>
          <li>We don&apos;t run analytics, advertising or tracking cookies.</li>
          <li>Your wallet address and transactions are public on Robinhood Chain. That is how blockchains work, not something we control.</li>
        </ul>
      </Sec>

      <Sec id="onchain" title="On-chain data">
        <p>When you connect a wallet, the app reads your address to show your balances, loans and deposits. Everything you do with the contracts (deposits, loans, repayments, auctions, staking) is recorded permanently on a public blockchain, linked to your address. Anyone can read it, and it cannot be deleted. The public ledger page in the app only displays data that is already on-chain.</p>
      </Sec>

      <Sec id="site" title="What the site handles">
        <ul>
          <li><b>Hosting logs.</b> The site is hosted on Vercel. Like any web host, it processes your IP address and basic request data to serve pages and protect against abuse.</li>
          <li><b>Region.</b> Your approximate country, derived from your IP address by the host, is used to apply regional restrictions. We don&apos;t store it.</li>
          <li><b>Nothing else.</b> We have no database of users and no server that stores wallet addresses.</li>
        </ul>
      </Sec>

      <Sec id="browser" title="Your browser">
        <p>The app saves a few settings in your browser&apos;s local storage, such as which wallet you last connected, so it can reconnect. They stay on your device and are not sent to us. Clearing your browser data removes them.</p>
      </Sec>

      <Sec id="third-parties" title="Third parties">
        <p>To work, the app talks to services run by others, under their own privacy policies:</p>
        <ul>
          <li><b>Your wallet</b> (for example a browser extension or mobile wallet), which sees the transactions you sign.</li>
          <li><b>Robinhood Chain RPC endpoints</b>, which receive the read requests and transactions the app sends, along with your IP address.</li>
          <li><b>WalletConnect</b>, if you connect a mobile wallet that way. Its relay passes messages between the app and your wallet.</li>
          <li><b>Google Fonts</b>, served at build time and hosted with the site, so no request goes to Google when you visit.</li>
        </ul>
      </Sec>

      <Sec id="rights" title="Your choices">
        <p>You can use the site without connecting a wallet, and disconnect at any time. Because we don&apos;t hold personal data about you, there is nothing for us to export or delete. On-chain data cannot be changed by anyone.</p>
      </Sec>

      <Sec id="changes" title="Changes & contact">
        <p>If this changes (for example if we add analytics), we will update this page first. Questions: <a href="https://x.com/hourglasslend" target="_blank" rel="noopener noreferrer">@hourglasslend</a> on X.</p>
      </Sec>
    </DocPage>
  );
}
