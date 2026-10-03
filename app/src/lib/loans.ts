"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { loanManagerAbi } from "./abi";
import { dep } from "./deployments";

export type LoanView = {
  id: bigint;
  borrower: Address;
  vault: Address;
  asset: Address;
  status: number; // 1 active · 2 repaid · 3 auction · 4 settled
  start: bigint;
  maturity: bigint;
  rateBps: bigint;
  collateral: bigint;
  principal: bigint;
  interest: bigint;
  lenderInterest: bigint;
  dueNow?: bigint; // interest due if repaid now
  graceEnd?: bigint;
};

export const STATUS = { ACTIVE: 1, REPAID: 2, AUCTION: 3, SETTLED: 4 } as const;

/** Every loan in the protocol (ids 1..nextLoanId-1). Fine for test networks; mainnet will read from an indexer. */
export function useAllLoans() {
  const next = useReadContract({
    address: dep.loanManager,
    abi: loanManagerAbi,
    functionName: "nextLoanId",
    query: { refetchInterval: 10_000 },
  });
  const n = Number(next.data ?? 1n) - 1;
  const ids = Array.from({ length: Math.max(0, n) }, (_, i) => BigInt(i + 1));
  const q = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "getLoan", args: [id] } as const,
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "amountDue", args: [id] } as const,
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "graceEnd", args: [id] } as const,
    ]),
    allowFailure: true,
    query: { enabled: n > 0, refetchInterval: 10_000 },
  });
  const loans: LoanView[] = [];
  ids.forEach((id, k) => {
    const l = q.data?.[k * 3]?.result as
      | {
          borrower: Address;
          vault: Address;
          asset: Address;
          status: number;
          start: bigint;
          maturity: bigint;
          rateBps: number;
          collateral: bigint;
          principal: bigint;
          interest: bigint;
          lenderInterest: bigint;
        }
      | undefined;
    if (!l) return;
    const due = q.data?.[k * 3 + 1]?.result as readonly [bigint, bigint] | undefined;
    loans.push({
      id,
      borrower: l.borrower,
      vault: l.vault,
      asset: l.asset,
      status: Number(l.status),
      start: BigInt(l.start),
      maturity: BigInt(l.maturity),
      rateBps: BigInt(l.rateBps),
      collateral: l.collateral,
      principal: l.principal,
      interest: l.interest,
      lenderInterest: l.lenderInterest,
      dueNow: due?.[1],
      graceEnd: q.data?.[k * 3 + 2]?.result as bigint | undefined,
    });
  });
  return { loans, loading: next.isLoading || q.isLoading };
}

export const certNo = (id: bigint) => `Certificate Nº ${String(id).padStart(4, "0")}`;
