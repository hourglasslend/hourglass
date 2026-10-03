"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { safetyModuleAbi } from "@/lib/abi";
import { assetByToken, dep, VAULTS } from "@/lib/deployments";
import { useEvents } from "@/lib/events";
import { etDate, pct, shares, usd } from "@/lib/format";
import { certNo, STATUS, useAllLoans } from "@/lib/loans";
import { rateNow, useProtocol } from "@/lib/protocol";

/** Stats strip: everything read on-chain; "—" until the chain answers. Never sample numbers. */
export function LiveStats() {
  const p = useProtocol();
  const { loans } = useAllLoans();
  const ev = useEvents();
  const tvl = p.vaults.reduce((s, v) => s + v.totalAssets, 0n);
  const out = p.vaults.reduce((s, v) => s + v.outstanding, 0n);
  const act = loans.filter((l) => l.status === STATUS.ACTIVE);
  const avg = act.length ? act.reduce((s, l) => s + l.rateBps * l.principal, 0n) / act.reduce((s, l) => s + l.principal, 0n) : undefined;
  const ready = !p.loading && !p.error;
  const bad = ev.data?.settled.reduce((s, e) => s + (e.args.shortfall ?? 0n), 0n);
  return (
    <div className="stats">
      <div className="wrap">
        <div className="s"><div className="eyebrow">USDG in vaults</div><div className="v">{ready ? usd(tvl, 0) : "—"}</div></div>
        <div className="s"><div className="eyebrow">Lent out now</div><div className="v">{ready ? usd(out, 0) : "—"}</div></div>
        <div className="s"><div className="eyebrow">Avg fixed rate</div><div className="v">{avg !== undefined ? (Number(avg) / 100).toFixed(1) : "—"}<small>%</small></div></div>
        <div className="s"><div className="eyebrow">Repaid on time</div><div className="v">{ev.data ? ev.data.repaid.length : "—"}</div></div>
        <div className="s"><div className="eyebrow">Bad debt</div><div className="v">{bad !== undefined ? usd(bad) : "—"}</div></div>
      </div>
    </div>
  );
}

/** Hero certificate: the most recent live loan on-chain, ticking down to its date. */
export function HeroCertificate() {
  const { loans } = useAllLoans();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  const l = [...loans].filter((x) => x.status === STATUS.ACTIVE && Number(x.maturity) > now).sort((a, b) => Number(b.start - a.start))[0];
  const a = l ? assetByToken(l.asset) : undefined;
  const v = l ? VAULTS.find((x) => x.address.toLowerCase() === l.vault.toLowerCase()) : undefined;
  const left = l ? Math.max(0, Number(l.maturity) - now) : 0;
  const f = l ? Math.min(1, (now - Number(l.start)) / Number(l.maturity - l.start)) : 0;
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return (
    <div className="cert" aria-label="Live loan certificate">
      <div className="h">
        <div>
          <div className="eyebrow">{l ? "Live certificate · on-chain" : "Loan certificate"}</div>
          <div className="no" style={{ marginTop: 6 }}>{l ? certNo(l.id) : "Certificate Nº —"}</div>
          <div className="ash" style={{ fontSize: 14, marginTop: 6 }}>
            <span className="mono" style={{ color: "var(--paper)" }}>{a?.symbol ?? "—"} → USDG</span> · {v?.label ?? "—"} vault
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/hourglass-mark.svg" alt="" style={{ width: 56 }} />
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="row"><span>Collateral</span><span>{l ? `${shares(l.collateral)} ${a?.symbol}` : "—"}</span></div>
        <div className="row"><span>Borrowed</span><span>{l ? `${usd(l.principal)} USDG` : "—"}</span></div>
        <div className="row"><span>Fixed rate</span><span>{l ? `${pct(l.rateBps)} APR` : "—"}</span></div>
        <div className="row"><span>Interest at maturity</span><span className="a">{l ? `${usd(l.interest)} USDG` : "—"}</span></div>
        <div className="row"><span>Redeem by</span><span className="a">{l ? etDate(l.maturity) : "—"}</span></div>
      </div>
      <div className="bar" style={{ height: 6, margin: "22px 0 8px" }}><i style={{ width: `${f * 100}%` }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="eyebrow">
        <span>{l ? `${Math.round(f * 100)}% of term` : ""}</span>
        {l ? <span className="chip c-up">● On time</span> : null}
      </div>
      <div className="count">
        <div><b>{pad(left / 86400)}</b><span>DAYS</span></div>
        <div><b>{pad((left % 86400) / 3600)}</b><span>HRS</span></div>
        <div><b>{pad((left % 3600) / 60)}</b><span>MIN</span></div>
        <div><b>{pad(left % 60)}</b><span>SEC</span></div>
      </div>
    </div>
  );
}

const GROUPS: [string, string[]][] = [
  ["Index & ETF", ["SPY", "QQQ"]],
  ["Mega-cap", ["NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN"]],
  ["High volatility", ["TSLA"]],
  ["T-bills", ["SGOV"]],
];

export function LiveMarkets() {
  const p = useProtocol();
  if (!p.assets.length) return null;
  return (
    <div className="scroll-x" style={{ marginTop: 34 }}>
      <table>
        <thead>
          <tr><th>Asset</th><th>Price</th><th>Max LTV 7D</th><th>Max LTV 30D</th><th>Rate band</th><th>Rate now · 7D</th><th>Oracle</th><th></th></tr>
        </thead>
        <tbody>
          {GROUPS.map(([g, syms]) => {
            const rows = p.assets.filter((a) => syms.includes(a.symbol));
            if (!rows.length) return null;
            return [
              <tr className="grp" key={g}><td colSpan={8}>{g}</td></tr>,
              ...rows.map((a) => {
                const r7 = a.risk[VAULTS[0].address];
                const r30 = a.risk[VAULTS[1].address];
                return (
                  <tr key={a.symbol}>
                    <td><div className="tk"><span className="logo">{a.symbol}</span><div><b>{a.symbol}</b><small>{a.name}</small></div></div></td>
                    <td>{a.price ? (Number(a.price) / 1e8).toFixed(2) : "—"}</td>
                    <td>{pct(r7?.ltvBps, 0)}</td>
                    <td>{pct(r30?.ltvBps, 0)}</td>
                    <td>{r7 ? `${Number(r7.rateMinBps) / 100}–${Number(r7.rateMaxBps) / 100}%` : "—"}</td>
                    <td className="a">{pct(rateNow(r7, p.vaults[0]))}</td>
                    <td>{a.paused ? <span className="chip c-dash">Paused</span> : p.marketOpen ? <span className="chip c-up">Open</span> : <span className="chip c-mute">Weekend</span>}</td>
                    <td><Link className="btn s sm" href={`/app/borrow?asset=${a.symbol}`}>Borrow</Link></td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LiveVaults() {
  const p = useProtocol();
  return (
    <div className="vaults">
      {p.vaults.map((v, k) => (
        <div className="card" key={v.address}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div className="eyebrow">Vault</div><h3 className="serif" style={{ fontSize: 32, fontWeight: 500, marginTop: 4 }}>{v.label}</h3></div>
            <span className="chip c-mute">hgUSDG-{VAULTS[k].key.toUpperCase()}</span>
          </div>
          <div className="apy">{(Number(v.apyBps) / 100).toFixed(1)}<small>% APY now</small></div>
          <div className="util"><i style={{ width: `${Number(v.utilBps) / 100}%` }} /><em /></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="eyebrow"><span>Utilisation {pct(v.utilBps, 0)}</span><span className="a">Cap 80%</span></div>
          <div className="kv">
            <div><span className="eyebrow">TVL</span><b>{usd(v.totalAssets, 0)}</b></div>
            <div><span className="eyebrow">Withdraw now</span><b>{usd(v.withdrawRoom < v.availableToLend ? v.withdrawRoom : v.availableToLend, 0)}</b></div>
            <div><span className="eyebrow">Max wait</span><b>≤ {v.termDays + 2} days</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useReserveData() {
  const q = useReadContracts({
    contracts: [
      { address: dep.safetyModule, abi: safetyModuleAbi, functionName: "reserve" },
      { address: dep.safetyModule, abi: safetyModuleAbi, functionName: "totalGlass" },
    ],
    allowFailure: true,
  });
  const reserve = q.data?.[0]?.result as bigint | undefined;
  const staked = q.data?.[1]?.result as bigint | undefined;
  return { reserve, staked };
}

export function ReserveText() {
  const { reserve } = useReserveData();
  return <>Reserve {usd(reserve, 0)} USDG</>;
}
export function StakedText() {
  const { staked } = useReserveData();
  return <>{staked !== undefined ? (Number(staked) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"} GLASS staked</>;
}

export function LiveLedger() {
  const ev = useEvents();
  const rows = [...(ev.data?.distributed ?? [])].reverse().slice(0, 4);
  if (!rows.length) return <p style={{ marginTop: 18 }}>No fee distributions yet.</p>;
  return (
    <div className="scroll-x">
      <table style={{ marginTop: 24 }}>
        <thead><tr><th>Date (ET)</th><th>Stakers</th><th>Buyback</th><th>Reserve</th><th>Treasury</th><th>Tx</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.transactionHash}>
              <td>{etDate(ev.data!.blockTime(e.blockNumber))}</td>
              <td>{usd(e.args.stakers)}</td>
              <td>{usd(e.args.buyback)}</td>
              <td>{usd(e.args.reserve)}</td>
              <td>{usd(e.args.treasury)}</td>
              <td className="ash">{e.transactionHash.slice(0, 8)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
