# Hourglass keeper

Railway worker for Robinhood Chain testnet. Every 2 minutes it:

- copies the mainnet Chainlink prices (SPY, NVDA, TSLA, SGOV) onto the testnet feeds, with their original timestamps, so staleness and weekends behave like mainnet;
- executes the timelock's acceptOwnership batch once its delay has passed;
- starts auctions after grace, checkpoints running auctions (`pokeAuction`), calls `backstopBuy` once allowed, and `markLoan` (hourly) for loans at risk;
- processes both vaults' withdrawal queues and calls `FeeSplitter.distribute` once a day.

Every call is simulated first and only sent if it would succeed. Only the feed updates need the keeper key (the feeds' owner is the `KEEPER_ADDRESS` given at deploy); the keeper refuses to start with any other key.

`deployment.json` (testnet) and `deployment.mainnet.json` (mainnet) are written by `npm run sync:testnet` / `npm run sync:mainnet` in `../app`. Pick one with `DEPLOYMENT_FILE`; on mainnet the keeper reads Chainlink directly and pushes no prices.

## Variables

| Name | Value |
|---|---|
| `KEEPER_PRIVATE_KEY` | Key of `KEEPER_ADDRESS`. Set it in the Railway dashboard only; never in a file or chat |
| `DEPLOYMENT_FILE` | `deployment.json` (testnet, default) or `deployment.mainnet.json` |
| `RPC_URL` | Optional, defaults to the public RPC of the chosen network |
| `MAINNET_RPC_URL` | Optional, default `https://rpc.mainnet.chain.robinhood.com` |
| `TICK_SECONDS` | Optional, default `120` |

Run locally: `npm install && KEEPER_PRIVATE_KEY=… npm start`. Deploy: `railway up` from this folder.
