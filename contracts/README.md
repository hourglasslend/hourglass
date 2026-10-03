# Hourglass contracts

Fixed-term, fixed-rate USDG loans against tokenized stocks on Robinhood Chain. No price liquidations: a loan ends by repayment, rollover, or (after maturity + 24h grace) a Dutch auction whose surplus goes back to the borrower.

How it works, parameters and risks: [hourglasslend.xyz/docs](https://hourglasslend.xyz/docs) · [hourglasslend.xyz/risks](https://hourglasslend.xyz/risks)

| Contract | What it does | Owner can | Guardian can |
|---|---|---|---|
| `HourglassVault` (×2: 7D, 30D) | ERC-4626 USDG vault, lender of every loan in its term. Linear interest accrual that stops at each maturity slot. FIFO withdrawal queue. 5-min deposit lock | Deposit cap | – |
| `LoanManager` | Open / repay / add collateral / rollover; auction + backstop; Chainlink checks with US-session logic and the stock token's `paused`/`oraclePaused` flags | List assets, LTV, rate bands, caps, fees (hard caps: origination ≤ 1%, interest cut ≤ 20%) | Pause **new** loans and rollovers, set future holidays, push back the earliest auction start (≤ 7 days ahead, only forward) |
| `SafetyModule` | Stake GLASS, earn USDG streamed over 7 days (only the FeeSplitter/owner adds rewards). USDG reserve pays shortfalls; backstop buys unsold lots at 70% | Sweep backstop collateral (never GLASS/USDG), set recovery address | Slash within a 30%-of-stake budget per shortfall event, ≥ 1 day apart, to the recovery address only |
| `FeeSplitter` | 40% stakers · 30% buyback operator · 30% reserve (until target) then treasury | Addresses, reserve target | – |
| `libraries/MarketCalendar` | Maturity slots Tue/Wed/Thu 18:30 UTC, closed window Fri 21:00 → Mon 01:00 UTC + holidays | – | – |

Everything a loan depends on (rate, maturity, fee, interest floor, protocol cut) is snapshotted when it opens. Repay, add collateral and surplus claims cannot be paused. All owners end up as one TimelockController (48h): ADMIN proposes, GUARDIAN can only cancel, anyone executes. The deployer keeps no role.

## Use

Foundry 1.8+, from this folder:

```sh
forge build
forge test            # 61 tests: unit, fuzz (1,000 runs), audit regressions
forge fmt --check
```

## Testnet (46630)

Testnet has no USDG and no Chainlink feeds, so the testnet script deploys faucet tUSDG / tGLASS, test stock tokens (SPY, NVDA, TSLA, SGOV) with issuer flags, and keeper-owned feeds priced at mainnet levels. Timelock delay: `TESTNET_DELAY` seconds (default 300). Gas ≈ 0.00052 ETH (simulated 3 Oct 2026).

Shortcut: paste the three public addresses into `testnet-addresses.txt`, then run `bash script/deploy-testnet.sh` (imports the keystore on first run, checks balances, deploys, syncs the app and keeper). The manual steps:

Import the deployer once into an encrypted keystore. The key is typed into the terminal, never saved in a file:

```sh
cast wallet import hourglass-testnet --interactive
ADMIN_ADDRESS=0x… GUARDIAN_ADDRESS=0x… KEEPER_ADDRESS=0x… forge script script/DeployTestnet.s.sol \
  --rpc-url https://rpc.testnet.chain.robinhood.com --account hourglass-testnet --broadcast --slow
```

Use `--slow` as well so transactions are sent one by one. The script writes every address to `../app/src/deployments/46630.json`. Then, in `../app`, run `npm run sync:testnet` to add the deploy block (from the broadcast receipts) and copy the file to `../keeper/deployment.json`.

After `TESTNET_DELAY`, anyone sends the timelock's `executeBatch` for the acceptOwnership batch (`Deploy.acceptBatch`, salt `hourglass-accept`). The keeper (`../keeper`) does it automatically.

Rehearsal without spending testnet ETH: `anvil --fork-url https://rpc.testnet.chain.robinhood.com --chain-id 46630 --port 8546`, run the same script against `http://127.0.0.1:8546` with anvil's public test key, then build the app with `NEXT_PUBLIC_NETWORK=testnet NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`.

## Mainnet (4663)

`script/Deploy.s.sol` lists the 10 approved assets (token/feed pairs and decimals checked on-chain 3 Oct 2026; re-check before launch), vault cap 25,000 USDG each (launch cap, raised later through the timelock), reserve target 25,000 USDG. Needs `GLASS_ADDRESS` (Pons launch), `ADMIN_ADDRESS`, `GUARDIAN_ADDRESS`, `BUYBACK_ADDRESS`, `TREASURY_ADDRESS`.

## Internal review (3 Oct 2026)

Independent pre-testnet review: 0 Critical, 2 High, 6 Medium, no direct theft path. All fixed; one regression test per finding in `test/AuditRegression.t.sol`, the reviewer's accrual-drift fuzz in `test/AccrualFuzz.t.sol`.

**Keeper duties:** `pokeAuction` every few minutes during auctions (the clock only counts intervals with a usable price at both checkpoints), `startAuction` after grace, `markLoan` when collateral falls, `processQueue`, `FeeSplitter.distribute`, testnet feed prices.

## Known limits (v1)

- The stock token issuer can blocklist, pause or `adminBurn` any address, including `LoanManager`. Not fixable in code; disclosed.
- No Chainlink sequencer-uptime feed on Robinhood Chain. Mitigation: guardian `extendGrace`.
- USDG is valued at $1.
- Buyback (USDG → ETH → GLASS) and the sale of slashed GLASS are done by an operator, visible on-chain, not by the contracts.
- Auctions sell the whole lot in one purchase.
- A short token pause that no one checkpoints with `pokeAuction` is still counted on the auction clock.
- Day 0 after deploy has no daily snapshot yet, so `lendingBase` = current assets.
- Slashed GLASS is not sized against the USD shortfall (no GLASS oracle); bounded by the 30% budget per event.
