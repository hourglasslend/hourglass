"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Abi, type Address, type Hash } from "viem";
import { estimateGas, getConnection, readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { chain } from "./deployments";
import { encodeFunctionData } from "viem";
import { wagmiConfig } from "./wagmi";
import { explain } from "./errors";

export type TxState = { busy?: string; error?: string; done?: string };

/** Runs one or more transactions in order, waits for each receipt, then refreshes every on-chain read. */
export function useTx() {
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({});

  async function run(steps: { label: string; send: () => Promise<Hash | undefined> }[], doneText: string) {
    setState({});
    try {
      for (const s of steps) {
        setState({ busy: s.label });
        const hash = await s.send();
        if (hash) {
          const rc = await waitForTransactionReceipt(wagmiConfig, { hash });
          if (rc.status !== "success") throw new Error(`${s.label} reverted`);
        }
      }
      setState({ done: doneText });
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      console.error("[hourglass tx]", e);
      setState({ error: explain(e) });
      return false;
    }
  }

  return { state, run, busy: !!state.busy, reset: () => setState({}) };
}

type WriteParams = { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };

/** Every write goes through here: estimate gas now, then send with a 25% buffer. Gas in these contracts
 *  depends on time (interest and rewards accrue per second, accrual walks days), so a transaction mined one
 *  block after its estimate can need more than the bare estimate and would revert out of gas. */
export async function write(p: WriteParams): Promise<Hash> {
  const conn = getConnection(wagmiConfig);
  // a browser wallet may sit on another network: ask it to switch (or add) Robinhood Chain first
  if (conn.chainId !== chain.id) await switchChain(wagmiConfig, { chainId: chain.id });
  const account = conn.address;
  const data = encodeFunctionData({ abi: p.abi as Abi, functionName: p.functionName, args: p.args ?? [] } as never);
  const est = await estimateGas(wagmiConfig, { account, to: p.address, data });
  return writeContract(wagmiConfig, { ...(p as object), chainId: chain.id, gas: (est * 125n) / 100n } as never);
}

/** Approve exactly `amount` for `spender`, only when the current allowance is too low (no unlimited approvals). */
export async function approveIfNeeded(token: Address, owner: Address, spender: Address, amount: bigint) {
  const allowance = await readContract(wagmiConfig, {
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return undefined;
  return write({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}
