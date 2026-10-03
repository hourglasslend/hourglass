// Hourglass keeper (Railway worker), testnet or mainnet by DEPLOYMENT_FILE. Every call here is permissionless
// except the testnet feed updates, which only the keeper address (owner of the testnet mock feeds) can make.
//   - testnet only: mirrors Robinhood Chain mainnet Chainlink prices onto the testnet feeds (answer and
//     updatedAt as-is, so staleness and weekends behave like mainnet). Mainnet reads Chainlink directly.
//   - executes the timelock's acceptOwnership batch once its delay has passed
//   - startAuction after grace, pokeAuction during auctions, backstopBuy when allowed, markLoan when at risk
//   - processQueue on both vaults, FeeSplitter.distribute once a day
// Env: KEEPER_PRIVATE_KEY (set in Railway, never committed), DEPLOYMENT_FILE (default deployment.json = testnet;
// deployment.mainnet.json for mainnet), RPC_URL, MAINNET_RPC_URL, TICK_SECONDS.
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const dep = JSON.parse(readFileSync(new URL(`./${process.env.DEPLOYMENT_FILE || "deployment.json"}`, import.meta.url), "utf8"));
const IS_MAINNET = dep.chainId === 4663;
const RPC = process.env.RPC_URL || (IS_MAINNET ? "https://rpc.mainnet.chain.robinhood.com" : "https://rpc.testnet.chain.robinhood.com");
const MAINNET_RPC = process.env.MAINNET_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const TICK = Number(process.env.TICK_SECONDS || 120) * 1000;
if (!process.env.KEEPER_PRIVATE_KEY) throw new Error("KEEPER_PRIVATE_KEY is not set");

const chain = defineChain({
  id: dep.chainId,
  name: IS_MAINNET ? "Robinhood Chain" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ chain, transport: http(RPC), account });
const mainnet = createPublicClient({ transport: http(MAINNET_RPC) });

// Robinhood Chain mainnet Chainlink feeds (contracts/script/Deploy.s.sol)
const MAINNET_FEEDS = {
  SPY: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
  NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  TSLA: "0x4A1166a659A55625345e9515b32adECea5547C38",
  SGOV: "0xa0DF4ee0fFf975306345875E3548Fcc519577A11",
};

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function set(int256 a, uint256 t)",
]);
const lmAbi = parseAbi([
  "function nextLoanId() view returns (uint256)",
  "function graceEnd(uint256) view returns (uint256)",
  "function getLoan(uint256) view returns ((address borrower,address vault,address asset,uint8 status,uint64 start,uint64 maturity,uint32 rateBps,uint32 minInterestSecs,uint16 protocolInterestBps,uint128 collateral,uint128 principal,uint128 interest,uint128 lenderInterest,uint256 accrualRate))",
  "function quoteValue(address asset, uint256 amount) view returns (uint256 value, bool open)",
  "function provisionOf(uint256) view returns (uint256)",
  "function startAuction(uint256)",
  "function pokeAuction(uint256)",
  "function backstopBuy(uint256)",
  "function markLoan(uint256)",
]);
const vaultAbi = parseAbi([
  "function queueHead() view returns (uint256)",
  "function requestCount() view returns (uint256)",
  "function processQueue(uint256 maxSteps) returns (uint256)",
]);
const splitterAbi = parseAbi(["function distribute()"]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const timelockAbi = parseAbi([
  "function isOperationReady(bytes32) view returns (bool)",
  "function isOperationDone(bytes32) view returns (bool)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) payable",
]);

const ACTIVE = 1;
const AUCTION = 3;
const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Simulate first and only send when the call would succeed, so the keeper never pays for a revert.
 *  `quiet` is for routine probes (an auction not yet open for the backstop, nothing to poke); anything else
 *  that fails is logged with its reason. */
async function send(address, abi, functionName, args = [], quiet = false) {
  try {
    const { request } = await pub.simulateContract({ account, address, abi, functionName, args });
    const hash = await wallet.writeContract(request);
    const rc = await pub.waitForTransactionReceipt({ hash });
    log(`${functionName}(${args.length > 3 ? "…" : args.join(",")})`, rc.status, hash);
    return rc.status === "success";
  } catch (e) {
    if (!quiet) log(`${functionName}(${args.length > 3 ? "…" : args.join(",")}) not sent:`, e.shortMessage ?? e.message);
    return false;
  }
}

async function mirrorPrices() {
  if (IS_MAINNET) return;
  for (const a of dep.assets) {
    const src = MAINNET_FEEDS[a.symbol];
    if (!src) continue;
    try {
      const [, answer, , updatedAt] = await mainnet.readContract({ address: src, abi: feedAbi, functionName: "latestRoundData" });
      const [, cur, , curAt] = await pub.readContract({ address: a.feed, abi: feedAbi, functionName: "latestRoundData" });
      if (answer !== cur || updatedAt !== curAt) await send(a.feed, feedAbi, "set", [answer, updatedAt]);
    } catch (e) {
      log(`price ${a.symbol}: mainnet read failed, keeping last price`, e.shortMessage ?? e.message);
    }
  }
}

let ownershipDone = false;
async function acceptOwnership() {
  if (ownershipDone) return;
  const targets = [dep.loanManager, dep.vault7, dep.vault30, dep.safetyModule, dep.feeSplitter];
  const values = targets.map(() => 0n);
  const accept = encodeFunctionData({ abi: parseAbi(["function acceptOwnership()"]), functionName: "acceptOwnership" });
  const payloads = targets.map(() => accept);
  const salt = toHex("hourglass-accept", { size: 32 });
  const zero = toHex(0, { size: 32 });
  const id = keccak256(
    encodeAbiParameters(
      [{ type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" }],
      [targets, values, payloads, zero, salt],
    ),
  );
  if (await pub.readContract({ address: dep.timelock, abi: timelockAbi, functionName: "isOperationDone", args: [id] })) {
    ownershipDone = true;
    log("ownership: timelock owns every contract");
    return;
  }
  if (await pub.readContract({ address: dep.timelock, abi: timelockAbi, functionName: "isOperationReady", args: [id] })) {
    ownershipDone = await send(dep.timelock, timelockAbi, "executeBatch", [targets, values, payloads, zero, salt]);
  }
}

let lastMark = 0;
async function loans() {
  const now = (await pub.getBlock()).timestamp;
  const n = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "nextLoanId" });
  const markNow = Date.now() - lastMark > 3_600_000;
  for (let id = 1n; id < n; id++) {
    const l = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "getLoan", args: [id] });
    if (l.status === ACTIVE) {
      const g = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "graceEnd", args: [id] });
      if (now > g) await send(dep.loanManager, lmAbi, "startAuction", [id]);
      else if (markNow) await maybeMark(id, l);
    } else if (l.status === AUCTION) {
      if (!(await send(dep.loanManager, lmAbi, "backstopBuy", [id], true))) await send(dep.loanManager, lmAbi, "pokeAuction", [id]);
    }
  }
  if (markNow) lastMark = Date.now();
  return Number(n) - 1;
}

/** markLoan when the vault's claim exceeds 85% of collateral value, or to release an existing provision. */
async function maybeMark(id, l) {
  try {
    const [value] = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "quoteValue", args: [l.asset, l.collateral] });
    const prov = await pub.readContract({ address: dep.loanManager, abi: lmAbi, functionName: "provisionOf", args: [id] });
    const owed = l.principal + l.lenderInterest;
    if (owed * 100n > value * 85n || prov > 0n) await send(dep.loanManager, lmAbi, "markLoan", [id]);
  } catch {
    // price unusable (weekend or pause): try again next hour
  }
}

async function queues() {
  for (const v of [dep.vault7, dep.vault30]) {
    const head = await pub.readContract({ address: v, abi: vaultAbi, functionName: "queueHead" });
    const count = await pub.readContract({ address: v, abi: vaultAbi, functionName: "requestCount" });
    if (head < count) await send(v, vaultAbi, "processQueue", [50n]);
  }
}

let lastDistribute = 0;
async function fees() {
  if (Date.now() - lastDistribute < 86_400_000) return;
  const bal = await pub.readContract({ address: dep.usdg, abi: erc20Abi, functionName: "balanceOf", args: [dep.feeSplitter] });
  if (bal > 0n) await send(dep.feeSplitter, splitterAbi, "distribute");
  lastDistribute = Date.now();
}

async function tick() {
  const jobs = [["prices", mirrorPrices], ["ownership", acceptOwnership], ["loans", loans], ["queues", queues], ["fees", fees]];
  for (const [name, job] of jobs) {
    try {
      const r = await job();
      if (name === "loans") log(`tick ok · ${r} loans checked`);
    } catch (e) {
      log(`${name} failed:`, e.shortMessage ?? e.message);
    }
  }
}

log(`keeper ${account.address} on chain ${dep.chainId}, LoanManager ${dep.loanManager}`);
log(`gas balance ${Number(await pub.getBalance({ address: account.address })) / 1e18} ETH`);
// the testnet feeds are owned by the KEEPER_ADDRESS given at deploy: fail loudly if this key is not it
for (const a of IS_MAINNET ? [] : dep.assets) {
  const owner = await pub.readContract({ address: a.feed, abi: parseAbi(["function owner() view returns (address)"]), functionName: "owner" });
  if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`feed ${a.symbol} is owned by ${owner}, not this keeper (${account.address})`);
}
await tick();
setInterval(tick, TICK);
