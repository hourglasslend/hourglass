# Hourglass app

Next.js 16 + wagmi 3 + viem. Homepage at `/`, app at `/app/*` (Borrow, Certificates, Lend, Auctions, Safety, Ledger). Contracts: `../contracts`.

## Run locally (no wallet extension needed)

Needs Node 20+ and Foundry (`~/.foundry/bin` is found automatically even when not on PATH).

```sh
npm install

# terminal 1: local chain (chain id 31337)
npm run chain

# terminal 2: deploy the full protocol + test tokens, seed vault deposits, a GLASS stake and 4 loans,
# and write the addresses to src/deployments/31337.json
npm run deploy:local

# terminal 2 (optional, keep running): re-publishes test prices every minute so loans can open,
# starts auctions after grace and checkpoints running auctions
npm run keeper:local

# terminal 3
npm run dev            # http://localhost:3000
```

Then **Launch App → Connect wallet → "Local test account (anvil #0)"**. That is anvil's public test account; it already holds the seeded loans, deposits and stake. **Faucet** in the top bar mints test USDG, GLASS and 100 of each test stock.

Restarting `npm run chain` wipes the chain: run `npm run deploy:local` again.

**Try overdue loans and auctions:** move the local chain past a due date + 24 h grace during US market hours, then let the keeper start the auctions:

```sh
cast rpc evm_setNextBlockTimestamp <unix-time> --rpc-url http://127.0.0.1:8545 && cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

## Networks

`NEXT_PUBLIC_NETWORK` picks the network and the address file in `src/deployments/`:

| Value | Chain | Addresses |
|---|---|---|
| `local` (default in dev) | anvil 31337 | `31337.json`, written by `npm run deploy:local` |
| `testnet` | Robinhood Chain testnet 46630 | `46630.json`, written by the testnet deploy + `npm run sync:testnet` |
| `mainnet` | Robinhood Chain 4663 | `4663.json`, written by the mainnet deploy + `npm run sync:mainnet` |
| `prelaunch` | none | site and docs only, `/app` shows a holding page |

A production build on Vercel refuses `local` and any localhost RPC. `NEXT_PUBLIC_RPC_URL` points the app at a local fork (`anvil --fork-url …`) for rehearsals; with a `127.0.0.1` RPC the anvil test-account connector is enabled.

Regional rules live in `src/proxy.ts` (Vercel geolocation): sanctioned regions can't open the app; the US, Canada, the UK and Switzerland can't open new loans but can repay, lend and stake.

## Notes

- `npm run sync:abi` copies ABIs from `../contracts/out` after `forge build`.
- Every write goes through `write()` in `src/lib/tx.ts`: it switches the wallet to the right chain, estimates gas and sends it with a 25% buffer, because gas in these contracts depends on time (interest and rewards accrue per second). Approvals are for the exact amount only.
- Loans are read with a `nextLoanId` loop; event history (`src/lib/events.ts`) is scanned from the deploy block in 5M-block windows (public RPCs cap `eth_getLogs` ranges) and cached in memory.
