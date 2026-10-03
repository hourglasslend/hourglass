#!/usr/bin/env bash
# Deploys Hourglass to Robinhood Chain testnet (46630) and syncs the addresses into the app and keeper.
# Run from Git Bash:  bash script/deploy-testnet.sh      (inside tenor/contracts)
# Reads PUBLIC addresses from testnet-addresses.txt. Signs with DEPLOYER_PRIVATE_KEY in .env.local if set (never
# printed), otherwise with your Foundry keystore: the key is typed once
# into `cast wallet import` and the password at the prompt; nothing secret is written to disk in plain text.
set -euo pipefail
cd "$(dirname "$0")/.."

FOUNDRY="$HOME/.foundry/bin"
ACCOUNT="${ACCOUNT:-hourglass-testnet}"
RPC="https://rpc.testnet.chain.robinhood.com"

# shellcheck disable=SC1091
source ./testnet-addresses.txt
for v in ADMIN_ADDRESS GUARDIAN_ADDRESS KEEPER_ADDRESS; do
  if [[ ! "${!v:-}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "✗ $v is missing or not an address in testnet-addresses.txt"
    exit 1
  fi
done
if [[ "${ADMIN_ADDRESS,,}" == "${GUARDIAN_ADDRESS,,}" ]]; then
  echo "✗ ADMIN_ADDRESS and GUARDIAN_ADDRESS must be different wallets"
  exit 1
fi
export ADMIN_ADDRESS GUARDIAN_ADDRESS KEEPER_ADDRESS

# Signer: DEPLOYER_PRIVATE_KEY from .env.local if set (never echoed), otherwise the Foundry keystore.
DEPLOYER_PRIVATE_KEY=""
if [[ -f .env.local ]]; then
  DEPLOYER_PRIVATE_KEY=$(grep -E '^DEPLOYER_PRIVATE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '[:space:]"' || true)
fi
if [[ -n "$DEPLOYER_PRIVATE_KEY" ]]; then
  [[ "$DEPLOYER_PRIVATE_KEY" =~ ^(0x)?[0-9a-fA-F]{64}$ ]] || { echo "✗ DEPLOYER_PRIVATE_KEY in .env.local is not a 32-byte hex key"; exit 1; }
  DEPLOYER=$("$FOUNDRY/cast" wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
  SIGNER=(--private-key "$DEPLOYER_PRIVATE_KEY")
  echo "→ Signing with the key in .env.local"
else
  if ! "$FOUNDRY/cast" wallet list 2>/dev/null | grep -q "^$ACCOUNT "; then
    echo "→ First run: import the DEPLOYER wallet into an encrypted keystore named '$ACCOUNT'."
    echo "  Paste its private key and choose a password when asked (input is hidden)."
    "$FOUNDRY/cast" wallet import "$ACCOUNT" --interactive
  fi
  DEPLOYER=$("$FOUNDRY/cast" wallet address --account "$ACCOUNT")
  SIGNER=(--account "$ACCOUNT")
fi
echo "→ Deployer $DEPLOYER"
echo "  balance: $("$FOUNDRY/cast" balance "$DEPLOYER" --rpc-url "$RPC" --ether) ETH (needs ~0.001)"
echo "  keeper:  $("$FOUNDRY/cast" balance "$KEEPER_ADDRESS" --rpc-url "$RPC" --ether) ETH (needs ~0.01 for price updates)"

"$FOUNDRY/forge" script script/DeployTestnet.s.sol --rpc-url "$RPC" "${SIGNER[@]}" --sender "$DEPLOYER" --broadcast --slow

(cd ../app && npm run sync:testnet)
echo "✓ Deployed. Next: start the keeper (../keeper) and build the app with NEXT_PUBLIC_NETWORK=testnet."
