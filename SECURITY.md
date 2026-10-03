# Security

Hourglass holds borrowers' stock tokens and lenders' USDG in contracts that cannot be upgraded. If you find a way to lose, freeze or misdirect anyone's funds, to block a repayment, or to mis-price a loan or an auction, we want to hear it first.

## Report a vulnerability

- **Preferred: GitHub private vulnerability reporting.** On this repository, open the **Security** tab and choose **Report a vulnerability**. Only the maintainers see it.
- **Or Telegram: [t.me/hourglass_chat](https://t.me/hourglass_chat).** Ask an admin for a private chat and send the details there, never in the public group.

Please include what is affected (contract and function), the impact and a proof of concept. A Foundry test on an anvil fork is ideal:

```bash
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663
```

Do not test against mainnet with other people's funds, and do not run load against the public endpoints.

## Scope

- In scope: everything in `contracts/src/`, the deploy scripts in `contracts/script/`, and the keeper in `keeper/`.
- Known limits are listed in [`contracts/README.md`](contracts/README.md#known-limits-v1) and on the [Risks](https://hourglasslend.xyz/risks) page, including the stock token issuer's ability to pause, block or burn tokens. These are not vulnerabilities in Hourglass.

## Status

Internal security review completed on 3 Oct 2026, all findings fixed. External audit: pending.
