"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { feeSplitterAbi, loanManagerAbi } from "./abi";
import { dep, FROM_BLOCK } from "./deployments";

// Public RPCs cap eth_getLogs ranges (Robinhood Chain mainnet: 10M blocks, ~11 days at 0.1 s blocks), so history
// is read in windows and kept in memory: the first load scans from the deploy block, later refreshes only scan
// the blocks since. A dedicated indexer can replace this once history gets long.
const SPAN = 5_000_000n;

type Client = NonNullable<ReturnType<typeof usePublicClient>>;
const scan = (c: Client, from: bigint, to: bigint) =>
  Promise.all([
    c.getContractEvents({ address: dep.loanManager, abi: loanManagerAbi, eventName: "AuctionSettled", fromBlock: from, toBlock: to }),
    c.getContractEvents({ address: dep.loanManager, abi: loanManagerAbi, eventName: "LoanRepaid", fromBlock: from, toBlock: to }),
    c.getContractEvents({ address: dep.loanManager, abi: loanManagerAbi, eventName: "LoanRolled", fromBlock: from, toBlock: to }),
    c.getContractEvents({ address: dep.loanManager, abi: loanManagerAbi, eventName: "LoanOpened", fromBlock: from, toBlock: to }),
    c.getContractEvents({ address: dep.feeSplitter, abi: feeSplitterAbi, eventName: "Distributed", fromBlock: from, toBlock: to }),
  ]);
type Batch = Awaited<ReturnType<typeof scan>>;

const cache = {
  next: FROM_BLOCK,
  settled: [] as Batch[0],
  repaid: [] as Batch[1],
  rolled: [] as Batch[2],
  opened: [] as Batch[3],
  distributed: [] as Batch[4],
  times: new Map<bigint, bigint>(),
};

/** Protocol event history straight from the chain. */
export function useEvents() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["events", dep.loanManager],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: async () => {
      const c = client!;
      const head = await c.getBlockNumber();
      if (head < cache.next) cache.next = FROM_BLOCK; // local chain restarted: start over
      while (cache.next <= head) {
        const to = cache.next + SPAN - 1n < head ? cache.next + SPAN - 1n : head;
        const [settled, repaid, rolled, opened, distributed] = await scan(c, cache.next, to);
        cache.settled.push(...settled);
        cache.repaid.push(...repaid);
        cache.rolled.push(...rolled);
        cache.opened.push(...opened);
        cache.distributed.push(...distributed);
        cache.next = to + 1n;
      }
      for (const e of cache.distributed) {
        if (!cache.times.has(e.blockNumber)) cache.times.set(e.blockNumber, (await c.getBlock({ blockNumber: e.blockNumber })).timestamp);
      }
      const times = cache.times;
      return {
        settled: [...cache.settled],
        repaid: [...cache.repaid],
        rolled: [...cache.rolled],
        opened: [...cache.opened],
        distributed: [...cache.distributed],
        blockTime: (b: bigint) => times.get(b),
      };
    },
  });
}
