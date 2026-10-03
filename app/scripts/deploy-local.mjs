// Deploys + seeds the full protocol on a local anvil (npm run chain must be running) and writes
// src/deployments/31337.json. Uses anvil's PUBLIC test account #0, never a real key.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { foundryBin } from "./foundry.mjs";

const contracts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts");
const ANVIL_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
execFileSync(
  foundryBin("forge"),
  ["script", "script/DeployLocal.s.sol", "--rpc-url", "http://127.0.0.1:8545", "--broadcast", "--private-key", ANVIL_KEY_0],
  { cwd: contracts, stdio: "inherit" },
);
