// Starts a local anvil chain (chain id 31337) for development: npm run chain
import { spawn } from "node:child_process";
import { foundryBin } from "./foundry.mjs";

spawn(foundryBin("anvil"), ["--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337"], { stdio: "inherit" });
