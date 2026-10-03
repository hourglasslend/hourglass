# Hourglass

Fixed-term, fixed-rate USDG loans against tokenized stocks on Robinhood Chain. No price liquidations: a loan ends when it is repaid, rolled over, or, if the date is missed, sold at an oracle-priced auction with every dollar above the debt returned to the borrower.

**https://hourglasslend.xyz** · [Docs](https://hourglasslend.xyz/docs) · [Risks](https://hourglasslend.xyz/risks) · X [@hourglasslend](https://x.com/hourglasslend) · Telegram [t.me/hourglass_chat](https://t.me/hourglass_chat)

*Time, not price.*

## What's built

| Layer | What it is | Where |
|---|---|---|
| Contracts | `LoanManager` (loans, rollover, auctions, Chainlink checks with US-session logic and the stock token's pause flags), two ERC-4626 `HourglassVault`s (7-day and 30-day, FIFO withdrawal queue), `SafetyModule` (staked GLASS + USDG reserve), `FeeSplitter` (40 / 30 / 30), `MarketCalendar` (due dates Tue–Thu, 18:30 UTC). Not upgradeable; one 48h `TimelockController` owns everything | `contracts/` |
| Keeper | Permissionless upkeep: starts auctions after grace, checkpoints running auctions, marks loans at risk, processes withdrawal queues, distributes fees. Every call is simulated before it is sent | `keeper/` |
| App | Next.js 16 + wagmi + viem: site, docs and the app (Borrow, Certificates, Lend, Auctions, Safety, Ledger). Reads everything from the contracts | `app/` |

## How it's checked

- **61 Foundry tests**: unit tests per contract, a 1,000-run fuzz on vault share accounting, an accrual-drift fuzz, a deployment test, and one regression test per internal-review finding.
- **Internal security review (3 Oct 2026)**: 0 Critical, 2 High, 6 Medium, no direct theft path. All fixed; each fix is pinned by a test in `contracts/test/AuditRegression.t.sol`.
- **Rehearsals**: the full deploy, keeper and app flow (deposit, borrow, repay, ledger) was run on anvil forks of Robinhood Chain testnet and mainnet with real USDG, stock tokens and Chainlink feeds, then on testnet itself.
- **External audit: pending.** Launch vaults are capped at 25,000 USDG each. Read [Risks](https://hourglasslend.xyz/risks) before using the protocol.

## Deployments

**Robinhood Chain mainnet (4663)**, live since 4 Oct 2026. Address book: `app/src/deployments/4663.json`.

| Contract | Address |
|---|---|
| GLASS (token, Pons GLASS/ETH) | [`0xDdb7AA1F71335337C986771f9adF1f9EC3646BEb`](https://robinhoodchain.blockscout.com/token/0xDdb7AA1F71335337C986771f9adF1f9EC3646BEb) |
| LoanManager | [`0xE503De0B59c26894178594602cB85E34D515182F`](https://robinhoodchain.blockscout.com/address/0xE503De0B59c26894178594602cB85E34D515182F) |
| HourglassVault 7D | [`0xA7964B631d70D766d96d31A27117650441381BB9`](https://robinhoodchain.blockscout.com/address/0xA7964B631d70D766d96d31A27117650441381BB9) |
| HourglassVault 30D | [`0xCFc1E51A677d6950c5B157fbdE6Db48fC3223202`](https://robinhoodchain.blockscout.com/address/0xCFc1E51A677d6950c5B157fbdE6Db48fC3223202) |
| SafetyModule | [`0x78267387571F054F945f87a5936C72e7Ad57387C`](https://robinhoodchain.blockscout.com/address/0x78267387571F054F945f87a5936C72e7Ad57387C) |
| FeeSplitter | [`0xD4C9EDB9bf0f0bF6D5014Bb754f7A4A063C7D267`](https://robinhoodchain.blockscout.com/address/0xD4C9EDB9bf0f0bF6D5014Bb754f7A4A063C7D267) |
| TimelockController (48h) | [`0x305053D7684b95DdB14088269498abE30EC9d867`](https://robinhoodchain.blockscout.com/address/0x305053D7684b95DdB14088269498abE30EC9d867) |

Vault deposit cap at launch: 25,000 USDG each. Ownership moves to the timelock once its 48h delay has passed (the acceptOwnership batch is executed by the keeper).

**Robinhood Chain testnet (46630):** test USDG, GLASS and stocks with public faucets, prices mirrored from mainnet Chainlink by the keeper. Address book: `app/src/deployments/46630.json`.

| Contract | Address |
|---|---|
| LoanManager | `0x40aC092233166a1Dc20196fd7142E6787145E7Cf` |
| HourglassVault 7D | `0x6D49A7769A672f353d9E3f21A8daDd296652c716` |
| HourglassVault 30D | `0x4897D59b274D45982C6571e22d688De9dAb8Fcc3` |
| SafetyModule | `0x8C9c43E7c0b5aF02BCe69240FA06Ab223eEcAB46` |
| FeeSplitter | `0x9ff9437871b415937C27638ab25b57400b924b74` |
| TimelockController | `0xEe3CDC6929dF4716A39A5347D6986Ee04400A534` |

## Run it

```bash
git clone --recursive https://github.com/hourglasslend/hourglass.git
cd hourglass

# contracts (Foundry 1.8+)
cd contracts && forge build && forge test && cd ..

# app on a local chain, no wallet extension needed
cd app && npm install
npm run chain          # terminal 1: anvil
npm run deploy:local   # terminal 2: deploy + seed
npm run dev            # terminal 3: http://localhost:3000
```

Details: [`contracts/README.md`](contracts/README.md), [`app/README.md`](app/README.md), [`keeper/README.md`](keeper/README.md).

## Repository

| Path | What it is |
|---|---|
| `contracts/src/` | The protocol contracts |
| `contracts/test/` | Foundry tests, fuzzing and review regressions |
| `contracts/script/` | Deploy scripts: local, testnet (with test tokens and feeds), mainnet |
| `app/` | Site, docs and app; address books in `app/src/deployments/` |
| `keeper/` | The upkeep bot (Railway worker) |

Development happened in a private repository; public history starts at this release ([CHANGELOG](CHANGELOG.md)).

## Security

Found a way to lose, freeze or misdirect funds? Please report it privately: see [SECURITY.md](SECURITY.md).

## License

See [LICENSE](LICENSE).
