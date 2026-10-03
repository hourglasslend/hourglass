import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, Sec } from "@/components/site/DocPage";

export const metadata: Metadata = {
  title: "Terms of Use · Hourglass",
  description: "Terms for using the Hourglass website and interface.",
};

const TOC = [
  { id: "acceptance", label: "Acceptance" },
  { id: "what", label: "What Hourglass is" },
  { id: "eligibility", label: "Eligibility" },
  { id: "your-wallet", label: "Your wallet" },
  { id: "risks", label: "Risks" },
  { id: "third-party", label: "Third-party assets" },
  { id: "fees", label: "Fees & taxes" },
  { id: "conduct", label: "Prohibited use" },
  { id: "testnet", label: "Testnet" },
  { id: "no-advice", label: "No advice" },
  { id: "warranty", label: "No warranty" },
  { id: "liability", label: "Limitation of liability" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title={<>Terms of <i className="a">use.</i></>}
      intro="These terms apply to the website at hourglasslend.xyz and the app interface it serves. Please read them together with the Risks page."
      updated="October 2026"
      toc={TOC}
    >
      <Sec id="acceptance" title="Acceptance">
        <p>By using this website or connecting a wallet to the app, you agree to these terms. If you do not agree, do not use the site. &quot;We&quot; and &quot;us&quot; means the people who maintain this website and interface.</p>
      </Sec>

      <Sec id="what" title="What Hourglass is">
        <p>Hourglass is a set of smart contracts deployed on Robinhood Chain, and this website is one interface to them. The interface helps you prepare transactions; your wallet signs them and the blockchain executes them.</p>
        <ul>
          <li>We are not a bank, broker, exchange or custodian, and we never hold your funds or keys.</li>
          <li>Loans are between you and the vault contracts, on the terms written into the contracts when each loan opens.</li>
          <li>The contracts work without this website. Anyone can interact with them directly.</li>
        </ul>
      </Sec>

      <Sec id="eligibility" title="Eligibility">
        <p>You may use the site only if all of the following are true:</p>
        <ul>
          <li>You are at least 18 years old and able to enter into a binding agreement.</li>
          <li>You are not located in, resident in, or a citizen of a jurisdiction subject to comprehensive sanctions, and you are not on any sanctions list, nor acting for anyone who is.</li>
          <li>To <b>borrow</b> against stock tokens, you are not located in or a resident of the <b>United States, Canada, the United Kingdom or Switzerland</b>, and you are permitted to hold stock tokens under the issuer&apos;s terms and the laws that apply to you.</li>
          <li>Your use of the site is lawful where you are.</li>
        </ul>
        <p>We may restrict access from some regions. Do not use a VPN or other means to get around a restriction.</p>
      </Sec>

      <Sec id="your-wallet" title="Your wallet">
        <p>You are solely responsible for your wallet, keys, devices and every transaction you sign. Blockchain transactions cannot be reversed. We cannot recover lost keys, cancel a transaction or undo an auction.</p>
        <p>Before signing, check the details your wallet shows you. Due dates, rates and amounts shown in the app are taken from the contracts, but your wallet and the chain are the final record.</p>
      </Sec>

      <Sec id="risks" title="Risks">
        <p>Using Hourglass can lose you money. The main risks are described on the <Link href="/risks">Risks</Link> page, including smart contract bugs, the powers of the stock token issuer, auctions of overdue collateral, withdrawal delays and losses for lenders, slashing for stakers, oracle failures and changes in law. By using the site you confirm that you have read that page and accept these risks.</p>
      </Sec>

      <Sec id="third-party" title="Third-party assets and services">
        <p>Stock tokens, USDG, wallets, price oracles, RPC providers and Robinhood Chain itself are provided by others. Their terms apply to your use of them, and we are not responsible for them. In particular, a stock token issuer can pause, block or burn tokens, and this can affect loans on Hourglass.</p>
      </Sec>

      <Sec id="fees" title="Fees & taxes">
        <p>The contracts charge the fees listed in the <Link href="/docs#fees">Docs</Link>, and every fee is shown in the app before you sign. You also pay network gas. You are responsible for any taxes on your activity.</p>
      </Sec>

      <Sec id="conduct" title="Prohibited use">
        <p>You agree not to:</p>
        <ul>
          <li>use the site for money laundering, sanctions evasion, fraud or any other unlawful purpose;</li>
          <li>use funds or assets that you do not lawfully own;</li>
          <li>attack, overload or interfere with the site or the contracts, or exploit a bug instead of reporting it;</li>
          <li>misrepresent your location or identity to get around a restriction.</li>
        </ul>
        <p>If you find a vulnerability, please report it privately to <a href="https://x.com/hourglasslend" target="_blank" rel="noopener noreferrer">@hourglasslend</a> rather than exploiting it.</p>
      </Sec>

      <Sec id="testnet" title="Testnet">
        <p>While Hourglass runs on testnet, all tokens in the app (test USDG, test GLASS and test stocks) are free, have no value, and cannot be exchanged for anything. Testnet data may be reset at any time.</p>
      </Sec>

      <Sec id="no-advice" title="No advice">
        <p>Nothing on the site is financial, investment, legal or tax advice, or an offer or recommendation to buy or sell any asset. Rates and figures are information only. Make your own decisions and get your own advice.</p>
      </Sec>

      <Sec id="warranty" title="No warranty">
        <p>The site and the contracts are provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or implied, including that they will be secure, uninterrupted, error-free or fit for a particular purpose. The site may be changed, suspended or taken down at any time.</p>
      </Sec>

      <Sec id="liability" title="Limitation of liability">
        <p>To the fullest extent the law allows, we are not liable for any loss or damage arising from your use of the site or the contracts, including lost funds, lost profits, auction outcomes, slashing, delays, bugs, oracle errors, actions of the stock token issuer, or failures of third-party services. Where liability cannot be excluded, it is limited to the extent the law requires.</p>
        <p>You agree to indemnify us against claims arising from your breach of these terms or your misuse of the site.</p>
      </Sec>

      <Sec id="changes" title="Changes">
        <p>We may update these terms. The date at the top shows the latest version. Continuing to use the site after a change means you accept the new terms.</p>
      </Sec>

      <Sec id="contact" title="Contact">
        <p>Questions about these terms: <a href="https://x.com/hourglasslend" target="_blank" rel="noopener noreferrer">@hourglasslend</a> on X.</p>
      </Sec>
    </DocPage>
  );
}
