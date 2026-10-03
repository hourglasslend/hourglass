// After a broadcast deploy: adds the first deploy block (L2, from the broadcast receipts; block.number on an
// Arbitrum chain is not the L2 block) to src/deployments/<chainId>.json and copies it for the keeper.
//   npm run sync:testnet   -> DeployTestnet.s.sol / 46630 -> ../keeper/deployment.json
//   npm run sync:mainnet   -> Deploy.s.sol / 4663         -> ../keeper/deployment.mainnet.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const NETS = {
  testnet: { chainId: 46630, script: "DeployTestnet.s.sol", keeper: "deployment.json" },
  mainnet: { chainId: 4663, script: "Deploy.s.sol", keeper: "deployment.mainnet.json" },
};
const net = NETS[process.argv[2]];
if (!net) throw new Error("usage: node scripts/sync-deploy.mjs testnet|mainnet");

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(app, "src", "deployments", `${net.chainId}.json`);
const run = JSON.parse(readFileSync(join(app, "..", "contracts", "broadcast", net.script, String(net.chainId), "run-latest.json"), "utf8"));
const dep = JSON.parse(readFileSync(out, "utf8"));

const blocks = run.receipts.map((r) => Number(BigInt(r.blockNumber)));
if (!blocks.length) throw new Error("no receipts in run-latest.json: was the script run with --broadcast?");
const created = new Set(run.transactions.filter((t) => t.contractAddress).map((t) => t.contractAddress.toLowerCase()));
if (!created.has(dep.loanManager.toLowerCase())) throw new Error(`${net.chainId}.json does not match the latest broadcast`);

dep.fromBlock = Math.min(...blocks);
writeFileSync(out, JSON.stringify(dep));
writeFileSync(join(app, "..", "keeper", net.keeper), `${JSON.stringify(dep, null, 2)}\n`);
console.log(`${net.chainId}.json: fromBlock ${dep.fromBlock}, LoanManager ${dep.loanManager} -> keeper/${net.keeper}`);
