// Resolves Foundry binaries even when ~/.foundry/bin is not on PATH (common on Windows).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function foundryBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const local = join(homedir(), ".foundry", "bin", exe);
  return existsSync(local) ? local : name;
}
