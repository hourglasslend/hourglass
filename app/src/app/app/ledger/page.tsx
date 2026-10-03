"use client";

import { useConnection } from "wagmi";
import { feeSplitterAbi } from "@/lib/abi";
import { dep } from "@/lib/deployments";
import { useEvents } from "@/lib/events";
import { etDate, short, usd } from "@/lib/format";
import { STATUS, useAllLoans } from "@/lib/loans";
import { useProtocol } from "@/lib/protocol";
import { useTx, write } from "@/lib/tx";

export default function LedgerPage() {
  const { address } = useConnection();
  const p = useProtocol();
  const { loans } = useAllLoans();
  const ev = useEvents();
  const tx = useTx();
  const tvl = p.vaults.reduce((s, v) => s + v.totalAssets, 0n);
  const out = p.vaults.reduce((s, v) => s + v.outstanding, 0n);
  const repaid = ev.data?.repaid ?? [];
  const settled = ev.data?.settled ?? [];
  const rolled = ev.data?.rolled ?? [];
  const opened = ev.data?.opened ?? [];
  const interestPaid = repaid.reduce((s, e) => s + (e.args.interest ?? 0n), 0n);
  const originationFees = opened.reduce((s, e) => s + (e.args.fee ?? 0n), 0n) + rolled.reduce((s, e) => s + (e.args.fee ?? 0n), 0n);
  const badDebt = settled.reduce((s, e) => s + (e.args.shortfall ?? 0n), 0n);
  const surplusBack = settled.reduce((s, e) => s + (e.args.surplus ?? 0n), 0n);
  const totalOutcomes = repaid.length + settled.length || 1;
  const active = loans.filter((l) => l.status === STATUS.ACTIVE).length;
  const inAuction = loans.filter((l) => l.status === STATUS.AUCTION).length;

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">Public ledger</div>
          <h1>Every dollar, on the record</h1>
        </div>
        <button
          className="btn s sm"
          disabled={!address || tx.busy}
          title="Anyone can trigger the fee split"
          onClick={() => tx.run([{ label: "Distributing", send: () => write({ address: dep.feeSplitter, abi: feeSplitterAbi, functionName: "distribute" }) }], "Fees distributed")}
        >
          {tx.busy ? "Distributing…" : "Distribute pending fees"}
        </button>
      </div>
      {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
      {tx.state.done ? <div className="ok" style={{ marginBottom: 16 }}>{tx.state.done}</div> : null}
      <div className="kpis">
        <div><span className="eyebrow">USDG in vaults</span><b>{usd(tvl, 0)}</b><small>
            {usd(out, 0)} lent out · {active} active{inAuction ? ` · ${inAuction} in auction` : ""}
          </small></div>
        <div><span className="eyebrow">Interest paid by borrowers</span><b className="up">{usd(interestPaid)}</b><small>USDG, on repayment</small></div>
        <div><span className="eyebrow">Origination fees</span><b>{usd(originationFees)}</b><small>USDG</small></div>
        <div><span className="eyebrow">Bad debt</span><b className={badDebt > 0n ? "down" : ""}>{usd(badDebt)}</b><small>USDG shortfall at auction</small></div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="eyebrow">Loan outcomes</div>
          <div style={{ display: "flex", height: 44, marginTop: 14, font: "500 12px var(--f-mono)" }}>
            <div style={{ width: `${(repaid.length / totalOutcomes) * 100}%`, background: "var(--paper)", color: "var(--ink)", display: "flex", alignItems: "center", paddingLeft: 10, minWidth: repaid.length ? 60 : 0 }}>
              {repaid.length ? `${repaid.length} REPAID` : ""}
            </div>
            <div style={{ width: `${(settled.length / totalOutcomes) * 100}%`, background: "var(--down)" }} />
            <div style={{ flex: 1, background: "var(--raised)" }} />
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, flexWrap: "wrap" }} className="ash">
            <span>■ Repaid {repaid.length}</span>
            <span>■ Rolled over {rolled.length}</span>
            <span className="down">■ Auctioned {settled.length} · surplus returned {usd(surplusBack)}</span>
          </div>
          <div className="eyebrow" style={{ marginTop: 26 }}>Loans opened</div>
          <div className="row"><span>Certificates issued</span><span>{opened.length}</span></div>
          <div className="row"><span>Principal lent (all time)</span><span>{usd(opened.reduce((s, e) => s + (e.args.principal ?? 0n), 0n))} USDG</span></div>
        </div>
        <div className="panel">
          <div className="eyebrow">Fee distributions</div>
          {ev.data?.distributed.length ? (
            <div className="scroll-x">
              <table style={{ marginTop: 6 }}>
                <thead>
                  <tr><th>Date</th><th>Stakers</th><th>Buyback</th><th>Reserve</th><th>Treasury</th><th>Tx</th></tr>
                </thead>
                <tbody>
                  {[...ev.data.distributed].reverse().map((e) => (
                    <tr key={e.transactionHash}>
                      <td>{etDate(ev.data!.blockTime(e.blockNumber)).split(" · ")[0]}</td>
                      <td>{usd(e.args.stakers)}</td>
                      <td>{usd(e.args.buyback)}</td>
                      <td>{usd(e.args.reserve)}</td>
                      <td>{usd(e.args.treasury)}</td>
                      <td className="ash">{short(e.transactionHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginTop: 10, fontSize: 14 }}>No distributions yet.</p>
          )}
          <p style={{ fontSize: 12, marginTop: 12 }}>Every number on this page is read from the contracts.</p>
        </div>
      </div>
    </section>
  );
}
