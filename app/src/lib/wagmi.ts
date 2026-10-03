import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { foundry } from "viem/chains";
import { chain, isLocalRpc, robinhoodMainnet, robinhoodTestnet } from "./deployments";
import { localWallet } from "./localWallet";

// Injected wallets are discovered through EIP-6963 (MetaMask, Rabby, OKX…). On the local chain a
// "Local test account" connector signs through anvil (see localWallet.ts), so no extension is needed for development.
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: isLocalRpc
    ? [localWallet(), injected()]
    : [injected()],
  transports: { [foundry.id]: http(undefined, { batch: true }), [robinhoodTestnet.id]: http(undefined, { batch: true }), [robinhoodMainnet.id]: http(undefined, { batch: true }) },
  batch: { multicall: false },
  // No cached block: right after one transaction mines, the next one must be prepared against the new
  // block, otherwise its pre-flight call runs on a stale block and fails (nonce/state mismatch).
  cacheTime: 0,
  pollingInterval: 1_000,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
