"use client";

import { useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useConnection, useReadContracts } from "wagmi";
import { safetyModuleAbi } from "@/lib/abi";
import { dep } from "@/lib/deployments";
import { duration, fmt, parse, usd } from "@/lib/format";
import { approveIfNeeded, useTx, write } from "@/lib/tx";
import { useNow } from "@/lib/now";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const g = (v: bigint | undefined, dp = 0) => fmt(v, 18, dp);
const COOLDOWN = 10 * 86400;
const WINDOW = 2 * 86400;

export default function SafetyPage() {
  const { address } = useConnection();
  const me = address ?? ZERO;
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amountIn, setAmountIn] = useState("");
  const tx = useTx();
  const sm = dep.safetyModule;
  const q = useReadContracts({
    contracts: [
      { address: sm, abi: safetyModuleAbi, functionName: "totalGlass" },
      { address: sm, abi: safetyModuleAbi, functionName: "reserve" },
      { address: sm, abi: safetyModuleAbi, functionName: "rewardRate" },
      { address: sm, abi: safetyModuleAbi, functionName: "periodFinish" },
      { address: sm, abi: safetyModuleAbi, functionName: "pendingShortfall", args: [dep.vault7] },
      { address: sm, abi: safetyModuleAbi, functionName: "pendingShortfall", args: [dep.vault30] },
      { address: sm, abi: safetyModuleAbi, functionName: "slashBudget" },
      { address: sm, abi: safetyModuleAbi, functionName: "glassOf", args: [me] },
      { address: sm, abi: safetyModuleAbi, functionName: "sharesOf", args: [me] },
      { address: sm, abi: safetyModuleAbi, functionName: "earned", args: [me] },
      { address: sm, abi: safetyModuleAbi, functionName: "cooldownStart", args: [me] },
      { address: dep.glass, abi: erc20Abi, functionName: "balanceOf", args: [me] },
      { address: sm, abi: safetyModuleAbi, functionName: "totalShares" },
    ],
    allowFailure: true,
    query: { refetchInterval: 10_000 },
  });
  const r = <T,>(i: number) => q.data?.[i]?.result as T | undefined;
  const totalGlass = r<bigint>(0);
  const reserve = r<bigint>(1);
  const rate = r<bigint>(2) ?? 0n; // USDG/s, 1e18-scaled
  const finish = Number(r<bigint>(3) ?? 0n);
  const shortfall = (r<bigint>(4) ?? 0n) + (r<bigint>(5) ?? 0n);
  const budget = r<bigint>(6);
  const myGlass = r<bigint>(7) ?? 0n;
  const myShares = r<bigint>(8) ?? 0n;
  const earned = r<bigint>(9) ?? 0n;
  const cd = Number(r<bigint>(10) ?? 0n);
  const bal = r<bigint>(11);
  const totalShares = r<bigint>(12) ?? 0n;
  const now = useNow();
  const streaming = now < finish;
  const perDay = streaming ? (rate * 86400n) / 10n ** 18n : 0n;
  const myPerDay = totalShares > 0n ? (perDay * myShares) / totalShares : 0n;
  const share = totalGlass && totalGlass > 0n ? Number((myGlass * 10_000n) / totalGlass) / 100 : 0;

  const cdState =
    cd === 0
      ? { text: "Not started", canUnstake: false }
      : now < cd + COOLDOWN
        ? { text: `Cooling down · ${duration(cd + COOLDOWN - now)} left`, canUnstake: false }
        : now <= cd + COOLDOWN + WINDOW
          ? { text: `Window open · ${duration(cd + COOLDOWN + WINDOW - now)} left`, canUnstake: true }
          : { text: "Window missed · start again", canUnstake: false };
  const amount = parse(amountIn, 18);

  const stake = () =>
    amount &&
    tx
      .run(
        [
          { label: "Approving GLASS", send: () => approveIfNeeded(dep.glass, address!, sm, amount) },
          { label: "Staking", send: () => write({ address: sm, abi: safetyModuleAbi, functionName: "stake", args: [amount] }) },
        ],
        "Staked",
      )
      .then((ok) => ok && setAmountIn(""));
  const unstake = () => {
    if (!amount || myGlass === 0n) return;
    const sh = amount >= myGlass ? myShares : (myShares * amount) / myGlass;
    tx.run([{ label: "Unstaking", send: () => write({ address: sm, abi: safetyModuleAbi, functionName: "unstake", args: [sh, address!] }) }], "Unstaked").then(
      (ok) => ok && setAmountIn(""),
    );
  };
  const one = (label: string, fn: "cooldown" | "claim", done: string) =>
    tx.run(
      [
        {
          label,
          send: () =>
            fn === "claim"
              ? write({ address: sm, abi: safetyModuleAbi, functionName: "claim", args: [address!] })
              : write({ address: sm, abi: safetyModuleAbi, functionName: "cooldown" }),
        },
      ],
      done,
    );

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">
            Safety module <b>·</b> $GLASS
          </div>
          <h1>Stake GLASS, earn USDG</h1>
        </div>
      </div>
      <div className="kpis">
        <div><span className="eyebrow">Total staked</span><b>{g(totalGlass)}</b><small>GLASS</small></div>
        <div><span className="eyebrow">Streaming to stakers</span><b className="up">{usd(perDay)}</b><small>USDG / day{streaming ? "" : " · idle"}</small></div>
        <div><span className="eyebrow">USDG reserve</span><b>{usd(reserve, 0)}</b><small>pays shortfalls first</small></div>
        <div><span className="eyebrow">Pending shortfall</span><b className={shortfall > 0n ? "down" : ""}>{usd(shortfall)}</b><small>USDG · slash budget {g(budget)}</small></div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="seg">
            <button className={mode === "stake" ? "on" : ""} onClick={() => setMode("stake")}>Stake</button>
            <button className={mode === "unstake" ? "on" : ""} onClick={() => setMode("unstake")}>Unstake</button>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <div className="lbl">
              <span>{mode === "stake" ? "You stake" : "You unstake"}</span>
              <span>
                {mode === "stake" ? `Balance ${g(bal)} GLASS` : `Staked ${g(myGlass)} GLASS`}
                <button className="max" onClick={() => setAmountIn(fmt(mode === "stake" ? bal : myGlass, 18, 4).replace(/,/g, ""))}>MAX</button>
              </span>
            </div>
            <div className="val">
              <input inputMode="decimal" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0" />
              <span className="mono">GLASS</span>
            </div>
          </div>
          <div className="btnrow">
            <button
              className="btn p full"
              disabled={!address || !amount || tx.busy || (mode === "unstake" && !cdState.canUnstake)}
              onClick={mode === "stake" ? stake : unstake}
            >
              {!address ? "Connect a wallet" : tx.busy ? `${tx.state.busy}…` : mode === "stake" ? "Stake GLASS" : cdState.canUnstake ? "Unstake GLASS" : "Unstake (needs cooldown)"}
            </button>
          </div>
          {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
          {tx.state.done ? <div className="ok">{tx.state.done}</div> : null}
          <div className="notice">
            <span className="a">⚠</span>
            <span>
              <b>Your stake backs lenders.</b> If an auction can&apos;t cover a vault and the USDG reserve runs out, up to 30% of staked GLASS
              can be used per shortfall event. Unstaking needs a 10-day cooldown, then you have 2 days to withdraw. Staking more restarts the
              cooldown.
            </span>
          </div>
        </div>
        <div>
          <div className="panel">
            <div className="eyebrow">Your stake</div>
            <div className="big" style={{ marginTop: 12 }}>
              {g(myGlass)}
              <small>GLASS · {share.toFixed(2)}%</small>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="row"><span>Rewards to claim</span><span className="up">{usd(earned)} USDG</span></div>
              <div className="row"><span>Streaming to you</span><span>≈ {usd(myPerDay)} USDG / day</span></div>
              <div className="row"><span>Cooldown</span><span>{cdState.text}</span></div>
            </div>
            <div className="acts">
              <button className="btn o" disabled={!address || earned === 0n || tx.busy} onClick={() => one("Claiming", "claim", "Rewards claimed")}>
                Claim {usd(earned)} USDG
              </button>
              <button className="btn s" disabled={!address || myShares === 0n || tx.busy} onClick={() => one("Starting cooldown", "cooldown", "Cooldown started")}>
                {cd ? "Restart cooldown" : "Start cooldown"}
              </button>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="eyebrow">Where fees go</div>
            <div style={{ display: "flex", height: 40, marginTop: 12, font: "500 12px var(--f-mono)" }}>
              <div style={{ width: "40%", background: "var(--amber)", color: "var(--ink)", display: "flex", alignItems: "center", paddingLeft: 10 }}>40% STAKERS</div>
              <div style={{ width: "30%", background: "#2a2a2a", display: "flex", alignItems: "center", paddingLeft: 10 }}>30% BUYBACK</div>
              <div style={{ width: "30%", background: "#1c1c1c", color: "var(--ash)", display: "flex", alignItems: "center", paddingLeft: 10 }}>30% RESERVE</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
