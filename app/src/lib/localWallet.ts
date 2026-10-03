import { injected } from "wagmi/connectors";
import { chain } from "./deployments";

// anvil's PUBLIC test account #0 (well-known Foundry dev key, never a real wallet). It holds the seeded data.
export const ANVIL_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const RPC = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

let nextId = 1;
async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    // keep anvil's own reason visible during development
    console.error("[local wallet] anvil rejected", method, json.error);
    throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data });
  }
  return json.result;
}

/** Minimal EIP-1193 provider for a local anvil (plain local chain or a fork of testnet): anvil signs for its unlocked test accounts, so
 *  transactions are forwarded with the app's gas limit and anvil fills nonce and fees itself. */
const provider = {
  async request({ method, params }: { method: string; params?: unknown[] }) {
    switch (method) {
      case "eth_chainId":
        return `0x${chain.id.toString(16)}`;
      case "eth_accounts":
      case "eth_requestAccounts":
        return [ANVIL_ACCOUNT_0];
      case "wallet_switchEthereumChain":
      case "wallet_requestPermissions":
        return null;
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "eth_sendTransaction": {
        const [tx] = (params ?? []) as Record<string, unknown>[];
        // keep the app's gas limit (estimate + buffer); let anvil fill nonce and fees
        const { nonce, maxFeePerGas, maxPriorityFeePerGas, gasPrice, ...rest } = tx;
        void nonce; void maxFeePerGas; void maxPriorityFeePerGas; void gasPrice;
        return rpc("eth_sendTransaction", [rest]);
      }
      default:
        return rpc(method, params ?? []);
    }
  },
  on() {},
  removeListener() {},
};

export const localWallet = () =>
  injected({
    target: { id: "localAnvil", name: "Local test account (anvil #0)", provider: provider as never },
    shimDisconnect: true,
  });
