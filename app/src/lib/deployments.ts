import local from "@/deployments/31337.json";
import testnet from "@/deployments/46630.json";
import mainnet from "@/deployments/4663.json";
import { defineChain, type Address } from "viem";
import { foundry, robinhood } from "viem/chains";

export type Asset = { symbol: string; name: string; token: Address; feed: Address };
export type Deployment = {
  chainId: number;
  fromBlock?: number; // first block to scan for events
  usdg: Address;
  glass: Address;
  loanManager: Address;
  vault7: Address;
  vault30: Address;
  safetyModule: Address;
  feeSplitter: Address;
  timelock: Address;
  assets: Asset[];
};

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  // NEXT_PUBLIC_RPC_URL points the app at a local fork of testnet for rehearsals
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  ...robinhood,
  // NEXT_PUBLIC_RPC_URL points the app at a local fork of mainnet for rehearsals
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
});

/** Which network the app runs against. "prelaunch" serves the site and docs only: no wallet code, no chain
 *  reads, /app shows a holding page. Production builds refuse "local" (see next.config.ts). */
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? "local") as "local" | "testnet" | "mainnet" | "prelaunch";
export const isPrelaunch = NETWORK === "prelaunch";

export const isMainnet = NETWORK === "mainnet";
export const chain = NETWORK === "local" ? foundry : isMainnet ? robinhoodMainnet : robinhoodTestnet;
export const dep = (NETWORK === "local" ? local : isMainnet ? mainnet : testnet) as Deployment;
export const FROM_BLOCK = BigInt(dep.fromBlock ?? 0);
export const isLocal = NETWORK === "local";
/** Rehearsal against a local anvil (plain, or a fork of testnet/mainnet): enables the anvil test-account connector. */
export const isLocalRpc = isLocal || (process.env.NEXT_PUBLIC_RPC_URL ?? "").startsWith("http://127.0.0.1");
export const isTestnet = !isMainnet; // local + testnet use faucet tokens

export const VAULTS = [
  { key: "7d", label: "7-Day", address: dep.vault7, termDays: 7 },
  { key: "30d", label: "30-Day", address: dep.vault30, termDays: 30 },
] as const;

export const assetBySymbol = (s: string) => dep.assets.find((a) => a.symbol === s);
export const assetByToken = (t: string) => dep.assets.find((a) => a.token.toLowerCase() === t.toLowerCase());
