"use client";

import { useConnection, useReadContracts } from "wagmi";
import { loanManagerAbi } from "@/lib/abi";
import { assetByToken, dep } from "@/lib/deployments";
import { useEvents } from "@/lib/events";
import { duration, etDate, pct, shares, usd } from "@/lib/format";
import { certNo, STATUS, useAllLoans, type LoanView } from "@/lib/loans";
import { approveIfNeeded, useTx, write } from "@/lib/tx";
import { useNow } from "@/lib/now";

const PHASE = 4 * 3600;

export default function AuctionsPage() {
  const { loans } = useAllLoans();
  const ev = useEvents();
  const now = useNow();
  const live = loans.filter((l) => l.status === STATUS.AUCTION);
  const overdue = loans.filter((l) => l.status === STATUS.ACTIVE && l.graceEnd !== undefined && now > Number(l.graceEnd));

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">
            Auctions <b>·</b> overdue collateral
          </div>
          <h1>Live auctions</h1>
        </div>
      </div>
      <div className="grid2">
        <div style={{ display: "grid", gap: 18 }}>
          {live.length === 0 ? <div className="empty">No live auctions. Every loan is on time or repaid.</div> : null}
          {live.map((l) => (
            <Lot key={String(l.id)} l={l} />
          ))}
          {overdue.map((l) => (
            <Overdue key={String(l.id)} l={l} />
          ))}
        </div>
        <div className="panel">
          <div className="eyebrow">How auctions work</div>
          <p style={{ marginTop: 12 }}>
            A loan goes to auction only after its due date plus 24 h of grace, and only while the price is usable. The whole lot is sold to
            the first buyer at the current price.
          </p>
          <div style={{ marginTop: 14 }}>
            <div className="row"><span>0 → 4 active hours</span><span>102% → 85%</span></div>
            <div className="row"><span>4 → 8 active hours</span><span>85% → 70%</span></div>
            <div className="row"><span>After 8 hours</span><span>Safety module may buy at 70%</span></div>
          </div>
          <div className="eyebrow" style={{ marginTop: 26 }}>
            Recently settled
          </div>
          {ev.data?.settled.length ? (
            <table style={{ marginTop: 6 }}>
              <thead>
                <tr><th>Lot</th><th>Price</th><th>Surplus</th></tr>
              </thead>
              <tbody>
                {[...ev.data.settled].reverse().slice(0, 8).map((e) => {
                  const l = loans.find((x) => x.id === e.args.id);
                  return (
                    <tr key={e.transactionHash}>
                      <td>{assetByToken(l?.asset ?? "")?.symbol} · Nº {String(e.args.id).padStart(4, "0")}</td>
                      <td>{usd(e.args.price)}</td>
                      <td className="up">{usd(e.args.surplus)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ marginTop: 10, fontSize: 14 }}>None yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Lot({ l }: { l: LoanView }) {
  const { address } = useConnection();
  const tx = useTx();
  const a = assetByToken(l.asset);
  const q = useReadContracts({
    contracts: [
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "auctionPrice", args: [l.id] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "auctionFactor", args: [l.id] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "auctionActiveSecs", args: [l.id] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "quoteValue", args: [l.asset, l.collateral] },
      { address: dep.loanManager, abi: loanManagerAbi, functionName: "isMarketOpen" },
    ],
    allowFailure: true,
    query: { refetchInterval: 5_000 },
  });
  const price = q.data?.[0]?.result as bigint | undefined;
  const factor = q.data?.[1]?.result as bigint | undefined;
  const active = Number((q.data?.[2]?.result as bigint | undefined) ?? 0n);
  const value = (q.data?.[3]?.result as readonly [bigint, boolean] | undefined)?.[0];
  const open = q.data?.[4]?.result as boolean | undefined;
  const usable = price !== undefined && open;
  const claim = l.principal + l.lenderInterest + l.principal / 100n;
  const surplus = price !== undefined ? price - claim - (l.interest - l.lenderInterest) : undefined;
  const x = 40 + (550 * Math.min(active, 2 * PHASE)) / (2 * PHASE);
  const y = active < PHASE ? 20 + (60 * active) / PHASE : active < 2 * PHASE ? 80 + (60 * (active - PHASE)) / PHASE : 140;

  const buy = () =>
    price &&
    tx.run(
      [
        { label: "Approving USDG", send: () => approveIfNeeded(dep.usdg, address!, dep.loanManager, price) },
        { label: "Buying", send: () => write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "buy", args: [l.id, price] }) },
      ],
      `Bought ${shares(l.collateral)} ${a?.symbol}`,
    );
  const poke = () =>
    tx.run([{ label: "Checkpointing", send: () => write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "pokeAuction", args: [l.id] }) }], "Clock checkpointed");
  const backstop = () =>
    tx.run([{ label: "Backstop", send: () => write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "backstopBuy", args: [l.id] }) }], "Bought by the safety module");

  return (
    <div className="cert">
      <div className="h">
        <div>
          <div className="eyebrow">Lot</div>
          <div className="no" style={{ marginTop: 4 }}>
            {shares(l.collateral)} {a?.symbol}
          </div>
          <div className="ash" style={{ fontSize: 13 }}>From {certNo(l.id)}</div>
        </div>
        {usable ? <span className="chip c-up">● Clock running</span> : <span className="chip c-dash">❚❚ Clock paused</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
        <div className="panel" style={{ padding: 16, background: "var(--ink)" }}>
          <span className="eyebrow">Price now</span>
          <div className="big a" style={{ marginTop: 8, fontSize: 30 }}>{usd(price)}</div>
          <small className="ash">USDG · {pct(factor)} of oracle</small>
        </div>
        <div className="panel" style={{ padding: 16, background: "var(--ink)" }}>
          <span className="eyebrow">Oracle value</span>
          <div className="big" style={{ marginTop: 8, fontSize: 30 }}>{usd(value)}</div>
          <small className="ash">{duration(active)} active of 8 h</small>
        </div>
      </div>
      <svg viewBox="0 0 600 170" style={{ width: "100%", display: "block", marginTop: 18 }}>
        <g stroke="#222"><line x1="40" y1="20" x2="590" y2="20" /><line x1="40" y1="80" x2="590" y2="80" /><line x1="40" y1="140" x2="590" y2="140" /></g>
        <g fontFamily="var(--f-mono)" fontSize="10" fill="#8E8E88"><text x="0" y="24">102%</text><text x="6" y="84">85%</text><text x="6" y="144">70%</text><text x="40" y="164">0h</text><text x="306" y="164">4h</text><text x="560" y="164">8h</text></g>
        <polyline points="40,20 315,80 590,140" fill="none" stroke="#F2EEE6" strokeWidth="2" />
        <circle cx={x} cy={y} r="6" fill="#FFB800" />
      </svg>
      <div style={{ marginTop: 14 }}>
        <div className="row"><span>Owed to vault (incl. 1% fee)</span><span>{usd(claim)} USDG</span></div>
        <div className="row"><span>Surplus to borrower at this price</span><span className="up">{surplus !== undefined && surplus > 0n ? usd(surplus) : "0.00"} USDG</span></div>
      </div>
      <div className="acts">
        <button className="btn p" disabled={!address || !usable || tx.busy} onClick={buy}>
          {tx.busy ? `${tx.state.busy}…` : `Buy lot · ${usd(price)}`}
        </button>
        <button className="btn s" disabled={!address || tx.busy} onClick={poke}>Checkpoint clock</button>
        {active >= 2 * PHASE ? <button className="btn s" disabled={!address || tx.busy} onClick={backstop}>Backstop</button> : null}
      </div>
      {!usable ? <div className="notice"><span className="a">☾</span><span>Buying is paused while the market is closed or the price is unusable. The clock is paused too.</span></div> : null}
      {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
      {tx.state.done ? <div className="ok">{tx.state.done}</div> : null}
    </div>
  );
}

function Overdue({ l }: { l: LoanView }) {
  const { address } = useConnection();
  const tx = useTx();
  const a = assetByToken(l.asset);
  return (
    <div className="cert" style={{ borderColor: "#4a2222" }}>
      <div className="h">
        <div>
          <div className="no">{certNo(l.id)}</div>
          <div className="ash" style={{ fontSize: 13 }}>{shares(l.collateral)} {a?.symbol} · grace ended {etDate(l.graceEnd)}</div>
        </div>
        <span className="chip c-down">● Overdue</span>
      </div>
      <div className="acts">
        <button
          className="btn o"
          disabled={!address || tx.busy}
          onClick={() =>
            tx.run([{ label: "Starting auction", send: () => write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "startAuction", args: [l.id] }) }], "Auction started")
          }
        >
          Start auction
        </button>
      </div>
      {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
    </div>
  );
}
