import { BaseError, ContractFunctionRevertedError } from "viem";

/** Plain-English text for every custom error the contracts can revert with. */
const MESSAGES: Record<string, string> = {
  Paused: "New loans are paused right now. Repayments still work.",
  VaultDisabled: "This vault is not taking new loans.",
  AssetDisabled: "This asset is not accepting new loans.",
  NotListed: "This asset is not listed for this term.",
  TokenPaused: "The issuer has paused this stock token's price. Try again when it resumes.",
  BadPrice: "The oracle returned an invalid price.",
  StalePrice: "The price is not fresh enough, or the market is closed for this action.",
  LoanTooSmall: "The minimum loan is 100 USDG.",
  LtvTooHigh: "That's more than the maximum loan-to-value for this collateral.",
  AssetCapReached: "This vault has reached its limit for this asset.",
  UtilizationTooHigh: "The vault doesn't have enough free USDG for this loan right now.",
  RateTooHigh: "The rate moved above your limit. Refresh the quote and try again.",
  FeeTooHigh: "The fee is above your limit. Refresh the quote and try again.",
  FeeOnTransfer: "This token takes a fee on transfer and can't be used as collateral.",
  BadStatus: "This loan is not in the right state for that action.",
  NotBorrower: "Only the borrower can do that.",
  NotInRollWindow: "Roll over opens 3 days before the due date and closes at the end of grace.",
  GraceNotOver: "The grace period hasn't ended yet.",
  PriceAboveMax: "The price is above your limit.",
  BackstopNotOpen: "The safety module can only buy after 8 active hours.",
  NothingToClaim: "Nothing to claim.",
  NotInWindow: "You can unstake only in the 2-day window after a 10-day cooldown.",
  ZeroAmount: "Enter an amount.",
  InsufficientIdle: "The vault doesn't have enough idle USDG right now.",
  Locked: "New deposits are locked for 5 minutes.",
  ERC4626ExceededMaxDeposit: "Deposits are paused or above the vault cap (deposits pause while an auction is open).",
  ERC4626ExceededMaxWithdraw: "That's more than you can withdraw right now. Join the queue for the rest.",
  ERC4626ExceededMaxRedeem: "That's more than you can withdraw right now. Join the queue for the rest.",
  ERC20InsufficientBalance: "Your balance is too low.",
  ERC20InsufficientAllowance: "Approval needed first.",
};

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (name) return name;
    }
    if (/User rejected|denied/i.test(e.message)) return "You rejected the transaction.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}
