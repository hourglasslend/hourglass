"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { loanManagerAbi } from "@/lib/abi";
import { dep, VAULTS } from "@/lib/deployments";
import { explain } from "@/lib/errors";
import { duration, etDate, parse, pct, shares, STOCK_DEC, usd, USDG_DEC } from "@/lib/format";
import { rateNow, useProtocol, WEEKEND_HAIRCUT_BPS } from "@/lib/protocol";
import { approveIfNeeded, useTx, write } from "@/lib/tx";
import { useNow } from "@/lib/now";

export default function BorrowPage() {
  return (
    <Suspense>
      <Borrow />
    </Suspense>
  );
}

function Borrow() {
  const params = useSearchParams();
  const { address } = useConnection();
  const p = useProtocol();
  const [symbol, setSymbol] = useState(params.get("asset") ?? "NVDA");
  const [termKey, setTermKey] = useState<"7d" | "30d">("7d");
  const [collIn, setCollIn] = useState("100");
  const [princIn, setPrincIn] = useState("");
  const tx = useTx();

  const asset = p.assets.find((a) => a.symbol === symbol) ?? p.assets[0];
  const vault = VAULTS.find((v) => v.key === termKey)!;
  const coll = parse(collIn, STOCK_DEC);
  const principal = parse(princIn, USDG_DEC);

  const now = BigInt(useNow(60_000));
  const { data: extra } = useReadContracts({
    contracts: [
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "maturityFor", args: [now, 7n * 86400n] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "maturityFor", args: [now, 30n * 86400n] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "nextLoanId" },
      { address: asset?.token as Address, abi: erc20Abi, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
    ],
    allowFailure: true,
    query: { enabled: !!asset, refetchInterval: 15_000 },
  });
  const due7 = extra?.[0]?.result as bigint | undefined;
  const due30 = extra?.[1]?.result as bigint | undefined;
  const nextId = extra?.[2]?.result as bigint | undefined;
  const balance = address ? (extra?.[3]?.result as bigint | undefined) : undefined;

  const quote = useReadContract({
    address: dep.loanManager,
    abi: loanManagerAbi,
    functionName: "quoteLoan",
    args: [vault.address, asset?.token as Address, coll ?? 0n, principal ?? 0n],
    query: { enabled: !!asset && !!coll && !!principal, refetchInterval: 10_000, retry: false },
  });
  const t = quote.data;

  if (!asset) return <div className="empty">Loading markets…</div>;

  const risk = asset.risk[vault.address];
  const ltvMax = risk ? (p.marketOpen === false ? risk.ltvBps - WEEKEND_HAIRCUT_BPS : risk.ltvBps) : undefined;
  const value = coll && asset.price ? (coll * asset.price) / 10n ** 20n : undefined;
  const maxPrincipal = value !== undefined && ltvMax !== undefined ? (value * ltvMax) / 10_000n : undefined;
  const ltvNow = value && principal ? (principal * 10_000n) / value : undefined;
  const rate7 = rateNow(asset.risk[VAULTS[0].address], p.vaults[0]);
  const rate30 = rateNow(asset.risk[VAULTS[1].address], p.vaults[1]);

  async function submit() {
    if (!address || !coll || !principal || !t) return;
    const ok = await tx.run(
      [
        { label: `Approving ${asset.symbol}`, send: () => approveIfNeeded(asset.token, address, dep.loanManager, coll) },
        {
          label: "Opening loan",
          send: () =>
            write({
              address: dep.loanManager,
              abi: loanManagerAbi,
              functionName: "openLoan",
              args: [vault.address, asset.token, coll, principal, t.rateBps + 10n, t.fee, address],
            }),
        },
      ],
      "Loan opened. Your certificate is in Certificates.",
    );
    if (ok) setPrincIn("");
  }

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">
            Borrow <b>·</b> fixed rate · fixed term
          </div>
          <h1>Borrow USDG against stocks</h1>
        </div>
        <div className="eyebrow">{p.marketOpen === false ? "US market closed · weekend LTV applies" : "US market open"}</div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="eyebrow">1 · Collateral</div>
          <div className="field">
            <div className="lbl">
              <span>You lock</span>
              <span>
                Balance {shares(balance)} {asset.symbol}
                {balance ? (
                  <button className="max" onClick={() => setCollIn(String(Number(balance) / 1e18))}>
                    MAX
                  </button>
                ) : null}
              </span>
            </div>
            <div className="val">
              <input inputMode="decimal" value={collIn} onChange={(e) => setCollIn(e.target.value)} placeholder="0.00" />
              <select value={asset.symbol} onChange={(e) => setSymbol(e.target.value)}>
                {p.assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="lbl" style={{ marginTop: 6 }}>
              <span className="mono">
                ≈ {usd(value)} USD · oracle {asset.price ? (Number(asset.price) / 1e8).toFixed(2) : "—"}
              </span>
              {asset.paused ? <span className="a">Price paused by issuer</span> : null}
            </div>
          </div>

          <div className="eyebrow" style={{ marginTop: 24 }}>
            2 · Term
          </div>
          <div className="terms">
            {VAULTS.map((v, k) => {
              const r = asset.risk[v.address];
              return (
                <button key={v.key} className={`term ${termKey === v.key ? "on" : ""}`} onClick={() => setTermKey(v.key)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b>{v.termDays} days</b>
                    <span className={`chip ${termKey === v.key ? "c-amber" : "c-mute"}`}>Max LTV {pct(r?.ltvBps, 0)}</span>
                  </div>
                  <div className="ash" style={{ fontSize: 13, marginTop: 6 }}>
                    Due <span className="mono" style={{ color: "var(--paper)" }}>{etDate(k === 0 ? due7 : due30)}</span>
                  </div>
                  <div className="ash" style={{ fontSize: 13 }}>
                    Fee {v.key === "7d" ? "0.06%" : "0.25%"} · rate {pct(k === 0 ? rate7 : rate30)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="eyebrow" style={{ marginTop: 24 }}>
            3 · Amount
          </div>
          <div className="field">
            <div className="lbl">
              <span>You borrow</span>
              <span>
                Max {usd(maxPrincipal)} USDG
                {maxPrincipal ? (
                  <button className="max" onClick={() => setPrincIn((Number(maxPrincipal) / 1e6).toFixed(2))}>
                    MAX
                  </button>
                ) : null}
              </span>
            </div>
            <div className="val">
              <input inputMode="decimal" value={princIn} onChange={(e) => setPrincIn(e.target.value)} placeholder="0.00" />
              <span className="mono">USDG</span>
            </div>
          </div>
          <div className="ltv" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }} className="eyebrow">
              <span>
                Loan-to-value <span style={{ color: "var(--paper)" }}>{pct(ltvNow, 1)}</span>
              </span>
              <span className="a">Max {pct(ltvMax, 0)}</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, Number(ltvNow ?? 0n) / 100)}%` }} />
              <div className="cap" style={{ left: `${Number(ltvMax ?? 0n) / 100}%` }} />
            </div>
            {ltvNow ? (
              <div className="ash" style={{ fontSize: 12, marginTop: 8 }}>
                The price can fall {(100 - Number(ltvNow) / 100).toFixed(0)}% before your collateral is worth less than this loan. Price
                alone never ends it.
              </div>
            ) : null}
          </div>

          <div className="btnrow">
            <button className="btn p full" disabled={!address || !t || tx.busy} onClick={submit}>
              {!address ? "Connect a wallet" : tx.busy ? `${tx.state.busy}…` : principal ? `Borrow ${usd(principal)} USDG` : "Enter an amount"}
            </button>
          </div>
          {quote.error && principal ? <div className="err">{explain(quote.error)}</div> : null}
          {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
          {tx.state.done ? (
            <div className="ok">
              {tx.state.done} <Link className="a" href="/app/certificates">Open Certificates →</Link>
            </div>
          ) : null}
          <div className="notice">
            <span className="a">ⓘ</span>
            <span>Rate and due date are fixed when you sign. Your max rate (quote + 0.10%) and max fee are enforced on-chain.</span>
          </div>
        </div>

        <div>
          <div className="cert">
            <div className="h">
              <div>
                <div className="eyebrow">Preview</div>
                <div className="no" style={{ marginTop: 4 }}>
                  Certificate Nº {nextId ? String(nextId).padStart(4, "0") : "—"}
                </div>
                <div className="ash" style={{ fontSize: 13, marginTop: 2 }}>
                  <span className="mono" style={{ color: "var(--paper)" }}>
                    {asset.symbol} → USDG
                  </span>{" "}
                  · {vault.label} vault
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/hourglass-mark.svg" style={{ width: 48 }} alt="" />
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="row"><span>Collateral</span><span>{shares(coll)} {asset.symbol}</span></div>
              <div className="row"><span>Fixed rate</span><span>{t ? pct(t.rateBps) + " APR" : "—"}</span></div>
              <div className="row"><span>Term</span><span>{t ? duration(Number(t.maturity - now)) : "—"}</span></div>
              <div className="row"><span>Redeem by</span><span className="a">{t ? etDate(t.maturity) : "—"}</span></div>
              <div className="row"><span>Origination fee</span><span>{t ? `${usd(t.fee)} USDG` : "—"}</span></div>
              <div className="row"><span>You receive now</span><span>{t && principal ? `${usd(principal - t.fee)} USDG` : "—"}</span></div>
              <div className="row"><span>Interest at maturity</span><span className="a">{t ? `${usd(t.interest)} USDG` : "—"}</span></div>
              <div className="row total"><span>To repay by the date</span><span>{t && principal ? `${usd(principal + t.interest)} USDG` : "—"}</span></div>
            </div>
          </div>
          <div className="notice">
            <span className="a">⏱</span>
            <span>
              <b>Why this date?</b> Due dates snap to the nearest Tue–Thu 14:30 ET slot, so anything that happens at maturity happens while
              the US market is open.
            </span>
          </div>
          <div className="notice">
            <span className="a">⚖</span>
            <span>
              <b>If you don&apos;t repay:</b> 24 h grace, then your {asset.symbol} is auctioned at the oracle price. What you owe plus a 1% late
              fee is paid first; everything above that is yours to claim.
            </span>
          </div>
          <div className="notice" style={{ borderColor: "#3a3020" }}>
            <span className="a">☾</span>
            <span>
              <b>Weekend note:</b> from Fri 17:00 ET to Sun 21:00 ET max LTV drops 10 points, because prices are frozen.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
