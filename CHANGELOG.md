# Changelog

## 0.1.1 — 4 Oct 2026

- Robinhood Chain mainnet (4663) deployment: address book `app/src/deployments/4663.json`, mainnet keeper address book `keeper/deployment.mainnet.json`.
- GLASS: `0xDdb7AA1F71335337C986771f9adF1f9EC3646BEb`.

## 0.1.0 — 3 Oct 2026

Initial public release.

- Contracts: LoanManager, HourglassVault (7D / 30D), SafetyModule, FeeSplitter, MarketCalendar. 61 tests. Internal security review completed, all findings fixed.
- Robinhood Chain testnet (46630) deployment with test tokens and mirrored prices.
- App: site, docs, risks, terms, privacy and the app (Borrow, Certificates, Lend, Auctions, Safety, Ledger), with regional rules.
- Keeper for testnet and mainnet.
- Mainnet (4663) launch cap: 25,000 USDG per vault, 48h timelock.
