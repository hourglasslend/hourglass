"use client";

import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { vaultAbi } from "@/lib/abi";
import { dep, VAULTS } from "@/lib/deployments";
import { fmt, parse, pct, usd, USDG_DEC } from "@/lib/format";
import { useProtocol } from "@/lib/protocol";
import { approveIfNeeded, useTx, write } from "@/lib/tx";
import { useNow } from "@/lib/now";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export default function LendPage() {
  const { address } = useConnection();
  const p = useProtocol();
  const [vk, setVk] = useState<"7d" | "30d">("7d");
  const [mode, setMode] = useState<"deposit" | "withdraw" | "queue">("deposit");
  const [amountIn, setAmountIn] = useState("");
  const tx = useTx();
  const vault = VAULTS.find((v) => v.key === vk)!;
  const vs = p.vaults.find((v) => v.address === vault.address);
  const me = address ?? ZERO;
  const amount = parse(amountIn, USDG_DEC);
  const nowS = useNow();

  const q = useReadContracts({
    contracts: [
      { address: dep.usdg, abi: erc20Abi, functionName: "balanceOf", args: [me] },
      { address: vault.address, abi: vaultAbi, functionName: "balanceOf", args: [me] },
      { address: vault.address, abi: vaultAbi, functionName: "maxWithdraw", args: [me] },
      { address: vault.address, abi: vaultAbi, functionName: "maxDeposit", args: [me] },
      { address: vault.address, abi: vaultAbi, functionName: "lockedUntil", args: [me] },
      { address: vault.address, abi: vaultAbi, functionName: "requestCount" },
      { address: vault.address, abi: vaultAbi, functionName: "queueHead" },
      { address: vault.address, abi: vaultAbi, functionName: "convertToAssets", args: [10n ** 12n] },
      { address: vault.address, abi: vaultAbi, functionName: "previewDeposit", args: [amount ?? 0n] },
    ],
    allowFailure: true,
    query: { refetchInterval: 10_000 },
  });
  const r = <T,>(i: number) => q.data?.[i]?.result as T | undefined;
  const usdgBal = r<bigint>(0);
  const shareBal = r<bigint>(1) ?? 0n;
  const maxW = r<bigint>(2) ?? 0n;
  const maxD = r<bigint>(3);
  const locked = r<bigint>(4) ?? 0n;
  const reqCount = Number(r<bigint>(5) ?? 0n);
  const head = Number(r<bigint>(6) ?? 0n);
  const pps = r<bigint>(7); // assets per 1e12 shares (= 1 share unit with the 1e6 offset)
  const previewShares = r<bigint>(8);
  const position = pps ? (shareBal * pps) / 10n ** 12n : undefined;

  const reqQ = useReadContracts({
    contracts: Array.from({ length: reqCount }, (_, i) => ({
      address: vault.address,
      abi: vaultAbi,
      functionName: "requests",
      args: [BigInt(i)],
    }) as const),
    allowFailure: true,
    query: { enabled: reqCount > 0, refetchInterval: 10_000 },
  });
  const myReqs = (reqQ.data ?? [])
    .map((x, i) => ({ id: i, r: x.result as readonly [Address, Address, bigint] | undefined }))
    .filter((x) => x.r && x.r[0].toLowerCase() === me.toLowerCase() && x.r[2] > 0n);
  const openAhead = (id: number) =>
    (reqQ.data ?? []).filter((x, i) => i >= head && i < id && (x.result as readonly [Address, Address, bigint] | undefined)?.[2]).length;

  const send = (label: string, fn: () => Promise<`0x${string}` | undefined>, done: string, pre?: { token: Address; amt: bigint }) =>
    tx
      .run(
        [
          ...(pre ? [{ label: "Approving USDG", send: () => approveIfNeeded(pre.token, address!, vault.address, pre.amt) }] : []),
          { label, send: fn },
        ],
        done,
      )
      .then((ok) => ok && setAmountIn(""));

  const deposit = () =>
    amount &&
    send(
      "Depositing",
      () => write({ address: vault.address, abi: vaultAbi, functionName: "deposit", args: [amount, address!] }),
      "Deposited",
      { token: dep.usdg, amt: amount },
    );
  const withdraw = () =>
    amount &&
    send(
      "Withdrawing",
      () =>
        write({ address: vault.address, abi: vaultAbi, functionName: "withdraw", args: [amount, address!, address!] }),
      "Withdrawn",
    );
  const queue = () => {
    if (!amount || !pps) return;
    const sh = (amount * 10n ** 12n) / pps;
    send(
      "Requesting",
      () => write({ address: vault.address, abi: vaultAbi, functionName: "requestRedeem", args: [sh, address!] }),
      "Added to the queue",
    );
  };
  const nowSec = BigInt(nowS);

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">
            Lend <b>·</b> USDG vaults
          </div>
          <h1>Lend USDG</h1>
        </div>
      </div>
      <div className="vsel">
        {p.vaults.map((v, k) => (
          <button key={v.address} className={`vcard ${VAULTS[k].key === vk ? "on" : ""}`} onClick={() => setVk(VAULTS[k].key)}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="serif" style={{ fontSize: 26 }}>
                {v.label} vault
              </span>
              <span className={`chip ${VAULTS[k].key === vk ? "c-amber" : "c-mute"}`}>
                {VAULTS[k].key === vk ? "Selected" : `hgUSDG-${VAULTS[k].key.toUpperCase()}`}
              </span>
            </div>
            <div className="big" style={{ marginTop: 14 }}>
              {(Number(v.apyBps) / 100).toFixed(1)}
              <small>% APY now</small>
            </div>
            <div className="util">
              <i style={{ width: `${Number(v.utilBps) / 100}%` }} />
              <em />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }} className="eyebrow">
              <span>Util {pct(v.utilBps, 0)}</span>
              <span>TVL {usd(v.totalAssets, 0)}</span>
              <span>Max wait ≤ {v.termDays + 2} d</span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="seg">
            {(["deposit", "withdraw", "queue"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => (setMode(m), tx.reset())}>
                {m === "deposit" ? "Deposit" : m === "withdraw" ? "Withdraw" : "Queue"}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <div className="lbl">
              <span>{mode === "deposit" ? "You deposit" : mode === "withdraw" ? "You withdraw now" : "You request"}</span>
              <span>
                {mode === "deposit" ? `Balance ${usd(usdgBal)} USDG` : mode === "withdraw" ? `Available ${usd(maxW)}` : `Position ${usd(position)}`}
                <button
                  className="max"
                  onClick={() => {
                    const v = mode === "deposit" ? usdgBal : mode === "withdraw" ? maxW : position;
                    if (v !== undefined) setAmountIn(fmt(v, USDG_DEC, 2).replace(/,/g, ""));
                  }}
                >
                  MAX
                </button>
              </span>
            </div>
            <div className="val">
              <input inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0.00" />
              <span className="mono">USDG</span>
            </div>
          </div>
          {mode === "deposit" && (
            <div style={{ marginTop: 14 }}>
              <div className="row"><span>You receive</span><span>{fmt(previewShares, 12, 2)} hgUSDG-{vk.toUpperCase()}</span></div>
              <div className="row"><span>Share price</span><span>{pps ? fmt(pps, USDG_DEC, 6) : "—"} USDG</span></div>
              <div className="row"><span>Withdrawable after</span><span>5 minutes</span></div>
              {maxD === 0n ? <div className="err">Deposits are paused while an auction is open in this vault.</div> : null}
            </div>
          )}
          {mode === "queue" && (
            <div className="notice">
              <span className="a">ⓘ</span>
              <span>Queued USDG keeps earning until it is paid out. Repayments fill the queue oldest-first; you can cancel any time.</span>
            </div>
          )}
          <div className="btnrow">
            <button
              className="btn p full"
              disabled={!address || !amount || tx.busy}
              onClick={mode === "deposit" ? deposit : mode === "withdraw" ? withdraw : queue}
            >
              {!address
                ? "Connect a wallet"
                : tx.busy
                  ? `${tx.state.busy}…`
                  : mode === "deposit"
                    ? `Deposit ${amount ? usd(amount) : ""} USDG`
                    : mode === "withdraw"
                      ? "Withdraw"
                      : "Join the queue"}
            </button>
          </div>
          {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
          {tx.state.done ? <div className="ok">{tx.state.done}</div> : null}
          <div className="notice">
            <span className="a">ⓘ</span>
            <span>
              Withdrawals can&apos;t push the vault above 80% utilisation. Beyond that you join the queue, which every repayment fills first.
            </span>
          </div>
        </div>
        <div>
          <div className="panel">
            <div className="eyebrow">Your position · {vault.label}</div>
            <div className="big" style={{ marginTop: 12 }}>
              {usd(position)}
              <small>USDG</small>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="row"><span>Shares</span><span>{fmt(shareBal, 12, 2)}</span></div>
              <div className="row"><span>Withdraw now (≤ 80% util)</span><span>{usd(maxW)}</span></div>
              <div className="row"><span>Lock</span><span>{locked > nowSec ? `until ${new Date(Number(locked) * 1000).toLocaleTimeString()}` : "none"}</span></div>
              <div className="row"><span>Vault withdraw room</span><span>{usd(vs?.withdrawRoom)}</span></div>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="eyebrow">Withdrawal queue · {vault.label}</div>
              <button
                className="btn s sm"
                disabled={tx.busy}
                onClick={() =>
                  tx.run(
                    [{ label: "Processing", send: () => write({ address: vault.address, abi: vaultAbi, functionName: "processQueue", args: [20n] }) }],
                    "Queue processed",
                  )
                }
              >
                Process queue
              </button>
            </div>
            {myReqs.length === 0 ? (
              <p style={{ marginTop: 12, fontSize: 14 }}>No requests in this vault.</p>
            ) : (
              myReqs.map(({ id, r: req }) => (
                <div key={id} className="row">
                  <span>
                    Request #{id} · {openAhead(id)} ahead
                  </span>
                  <span>
                    {pps && req ? usd((req[2] * pps) / 10n ** 12n) : "—"} USDG{" "}
                    <button
                      className="max"
                      onClick={() =>
                        tx.run(
                          [{ label: "Cancelling", send: () => write({ address: vault.address, abi: vaultAbi, functionName: "cancelRequest", args: [BigInt(id)] }) }],
                          "Request cancelled",
                        )
                      }
                    >
                      CANCEL
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
