"use client";

import { useReadContracts } from "wagmi";
import type { Address, ContractFunctionParameters } from "viem";
import { loanManagerAbi, testFeedAbi, vaultAbi } from "./abi";
import { dep, VAULTS, type Asset } from "./deployments";

const stockFlagsAbi = [
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "oraclePaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

export const MAX_UTIL_BPS = 8000n;
export const WEEKEND_HAIRCUT_BPS = 1000n;
const YEAR = 31_536_000n;

export type VaultState = {
  address: Address;
  label: string;
  termDays: number;
  totalAssets: bigint;
  outstanding: bigint;
  lendingBase: bigint;
  accrualRate: bigint;
  availableToLend: bigint;
  withdrawRoom: bigint;
  openAuctions: bigint;
  utilBps: bigint;
  apyBps: bigint; // instantaneous lender yield on all assets
};

export type Risk = { ltvBps: bigint; rateMinBps: bigint; rateMaxBps: bigint; capBps: bigint };
export type AssetState = Asset & {
  price?: bigint; // 8 decimals
  updatedAt?: bigint;
  paused: boolean;
  risk: Record<string, Risk | undefined>; // by vault address
};

/** Rate a small new loan would get right now (the contract prices on utilisation after the loan). */
export function rateNow(r: Risk | undefined, v: VaultState | undefined): bigint | undefined {
  if (!r || !v || v.lendingBase === 0n || r.ltvBps === 0n) return undefined;
  let util = (v.outstanding * 10_000n) / v.lendingBase;
  if (util > MAX_UTIL_BPS) util = MAX_UTIL_BPS;
  return r.rateMinBps + ((r.rateMaxBps - r.rateMinBps) * util) / MAX_UTIL_BPS;
}

export function useProtocol() {
  const vaultCalls = VAULTS.flatMap((v) =>
    (["totalAssets", "outstanding", "lendingBase", "accrualRate", "availableToLend", "withdrawRoom", "openAuctions"] as const).map(
      (fn) => ({ address: v.address, abi: vaultAbi, functionName: fn }) as const,
    ),
  );
  const assetCalls = dep.assets.flatMap((a) => [
    { address: a.feed, abi: testFeedAbi, functionName: "latestRoundData" } as const,
    { address: a.token, abi: stockFlagsAbi, functionName: "paused" } as const,
    { address: a.token, abi: stockFlagsAbi, functionName: "oraclePaused" } as const,
    ...VAULTS.map(
      (v) => ({ address: dep.loanManager, abi: loanManagerAbi, functionName: "risk", args: [v.address, a.token] }) as const,
    ),
  ]);
  const calls: ContractFunctionParameters[] = [
    { address: dep.loanManager, abi: loanManagerAbi, functionName: "isMarketOpen" },
    ...vaultCalls,
    ...assetCalls,
  ];
  const q = useReadContracts({
    contracts: calls,
    allowFailure: true,
    query: { refetchInterval: 10_000 },
  });

  const r = q.data;
  const get = <T,>(i: number) => (r?.[i]?.status === "success" ? (r[i].result as T) : undefined);

  const marketOpen = get<boolean>(0);
  let i = 1;
  const vaults: VaultState[] = VAULTS.map((v) => {
    const ta = get<bigint>(i++) ?? 0n;
    const out = get<bigint>(i++) ?? 0n;
    const base = get<bigint>(i++) ?? 0n;
    const acc = get<bigint>(i++) ?? 0n;
    const avail = get<bigint>(i++) ?? 0n;
    const room = get<bigint>(i++) ?? 0n;
    const oa = get<bigint>(i++) ?? 0n;
    return {
      address: v.address,
      label: v.label,
      termDays: v.termDays,
      totalAssets: ta,
      outstanding: out,
      lendingBase: base,
      accrualRate: acc,
      availableToLend: avail,
      withdrawRoom: room,
      openAuctions: oa,
      utilBps: ta === 0n ? 0n : (out * 10_000n) / ta,
      apyBps: ta === 0n ? 0n : (acc * YEAR * 10_000n) / 10n ** 18n / ta,
    };
  });
  const assets: AssetState[] = dep.assets.map((a) => {
    const round = get<readonly [bigint, bigint, bigint, bigint, bigint]>(i++);
    const paused = get<boolean>(i++) ?? false;
    const oraclePaused = get<boolean>(i++) ?? false;
    const risk: Record<string, Risk | undefined> = {};
    for (const v of VAULTS) {
      const t = get<readonly [number, number, number, number]>(i++);
      risk[v.address] = t
        ? { ltvBps: BigInt(t[0]), rateMinBps: BigInt(t[1]), rateMaxBps: BigInt(t[2]), capBps: BigInt(t[3]) }
        : undefined;
    }
    return { ...a, price: round?.[1], updatedAt: round?.[3], paused: paused || oraclePaused, risk };
  });

  return { loading: q.isLoading, error: q.isError, marketOpen, vaults, assets, refetch: q.refetch };
}
