// Local keeper for development: every minute it re-publishes each test feed's price (so loans can open and
// auctions can run), checkpoints live auctions, and starts auctions for loans past grace.
// Uses anvil's PUBLIC test account #0 (owner of the local test feeds). Local chain only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dep = JSON.parse(readFileSync(join(root, "src", "deployments", "31337.json"), "utf8"));
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const pub = createPublicClient({ chain: foundry, transport: http() });
const wallet = createWalletClient({ chain: foundry, transport: http(), account });

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function set(int256 a, uint256 t)",
]);
const lmAbi = parseAbi([
  "function nextLoanId() view returns (uint256)",
  "function graceEnd(uint256) view returns (uint256)",
  "function getLoan(uint256) view returns ((address borrower,address vault,address asset,uint8 status,uint64 start,uint64 maturity,uint32 rateBps,uint32 minInterestSecs,uint16 protocolInterestBps,uint128 collateral,uint128 principal,uint128 interest,uint128 lenderInterest,uint256 accrualRate))",
  "function startAuction(uint256)",
  "function pokeAuction(uint256)",
]);

async function tick() {
  const block = await pub.getBlock();
  const now = block.timestamp;
  for (const a of dep.assets) {
    const [, answer] = await pub.readContract({ address: a.feed, abi: feedAbi, functionName: "latestRoundData" });
    await wallet.writeContract({ address: a.feed, abi: feedAbi, functionName: "set", args: [answer, now] });
  }
  const n = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "nextLoanId" });
  for (let id = 1n; id < n; id++) {
    const l = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "getLoan", args: [id] });
    try {
      if (l.status === 1) {
        const g = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "graceEnd", args: [id] });
        if (now > g) await wallet.writeContract({ address: dep.loanManager, abi: lmAbi, functionName: "startAuction", args: [id] });
      } else if (l.status === 3) {
        await wallet.writeContract({ address: dep.loanManager, abi: lmAbi, functionName: "pokeAuction", args: [id] });
      }
    } catch (e) {
      console.log(`loan ${id}:`, e.shortMessage ?? e.message);
    }
  }
  console.log(new Date().toISOString(), "feeds refreshed, loans checked:", Number(n) - 1);
}

await tick();
setInterval(() => tick().catch((e) => console.error(e.shortMessage ?? e.message)), 60_000);
