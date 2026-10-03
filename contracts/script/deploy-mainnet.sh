#!/usr/bin/env bash
# Deploys Hourglass to Robinhood Chain MAINNET (4663).
#   bash script/deploy-mainnet.sh              -> checks + full simulation only, sends nothing
#   bash script/deploy-mainnet.sh --broadcast  -> sends the transactions, then syncs the app and keeper
# Reads PUBLIC addresses from mainnet-addresses.txt and the deployer key from MAINNET_DEPLOYER_PRIVATE_KEY in
# .env.local (never printed).
set -euo pipefail
cd "$(dirname "$0")/.."

FOUNDRY="$HOME/.foundry/bin"
RPC="${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
BROADCAST=""
[[ "${1:-}" == "--broadcast" ]] && BROADCAST="--broadcast"

# shellcheck disable=SC1091
source ./mainnet-addresses.txt
for v in GLASS_ADDRESS ADMIN_ADDRESS GUARDIAN_ADDRESS BUYBACK_ADDRESS TREASURY_ADDRESS; do
  if [[ ! "${!v:-}" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "✗ $v is missing or not an address in mainnet-addresses.txt"
    exit 1
  fi
done
[[ "${ADMIN_ADDRESS,,}" != "${GUARDIAN_ADDRESS,,}" ]] || { echo "✗ ADMIN and GUARDIAN must be different wallets"; exit 1; }
export GLASS_ADDRESS ADMIN_ADDRESS GUARDIAN_ADDRESS BUYBACK_ADDRESS TREASURY_ADDRESS

[[ "$("$FOUNDRY/cast" chain-id --rpc-url "$RPC")" == "4663" ]] || { echo "✗ RPC is not Robinhood Chain mainnet (4663)"; exit 1; }
[[ "$("$FOUNDRY/cast" code "$GLASS_ADDRESS" --rpc-url "$RPC")" != "0x" ]] || { echo "✗ GLASS_ADDRESS has no contract code on mainnet"; exit 1; }
echo "→ GLASS: $("$FOUNDRY/cast" call "$GLASS_ADDRESS" 'symbol()(string)' --rpc-url "$RPC") / $("$FOUNDRY/cast" call "$GLASS_ADDRESS" 'name()(string)' --rpc-url "$RPC")"

KEY=""
[[ -f .env.local ]] && KEY=$(grep -E '^MAINNET_DEPLOYER_PRIVATE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '[:space:]"' || true)
[[ "$KEY" =~ ^(0x)?[0-9a-fA-F]{64}$ ]] || { echo "✗ MAINNET_DEPLOYER_PRIVATE_KEY in .env.local is missing or not a 32-byte hex key"; exit 1; }
DEPLOYER=$("$FOUNDRY/cast" wallet address --private-key "$KEY")
BAL=$("$FOUNDRY/cast" balance "$DEPLOYER" --rpc-url "$RPC" --ether)
echo "→ Deployer $DEPLOYER · $BAL ETH (needs ~0.002)"
echo "→ ADMIN $ADMIN_ADDRESS · GUARDIAN $GUARDIAN_ADDRESS · BUYBACK $BUYBACK_ADDRESS · TREASURY $TREASURY_ADDRESS"

"$FOUNDRY/forge" script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$KEY" --sender "$DEPLOYER" $BROADCAST --slow

if [[ -n "$BROADCAST" ]]; then
  (cd ../app && npm run sync:mainnet)
  echo "✓ Mainnet deployed. The timelock takes ownership 48h from now (the keeper executes it)."
else
  echo "✓ Simulation only, nothing sent. Run again with --broadcast to deploy."
fi
