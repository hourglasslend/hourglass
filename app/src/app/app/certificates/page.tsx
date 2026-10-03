"use client";

import Link from "next/link";
import { useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { loanManagerAbi } from "@/lib/abi";
import { assetByToken, dep, VAULTS } from "@/lib/deployments";
import { duration, etDate, parse, pct, shares, STOCK_DEC, usd } from "@/lib/format";
import { certNo, STATUS, useAllLoans, type LoanView } from "@/lib/loans";
import { useProtocol } from "@/lib/protocol";
import { approveIfNeeded, useTx, write } from "@/lib/tx";
import { wagmiConfig } from "@/lib/wagmi";
import { useNow } from "@/lib/now";

export default function CertificatesPage() {
  const { address } = useConnection();
  const { loans, loading } = useAllLoans();
  const p = useProtocol();
  const [tab, setTab] = useState<"active" | "closed">("active");
  const now = useNow();
  const tx = useTx();
  const surplus = useReadContract({
    address: dep.loanManager,
    abi: loanManagerAbi,
    functionName: "surplus",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address, refetchInterval: 10_000 },
  }).data;

  if (!address) return <div className="empty">Connect a wallet to see your certificates.</div>;
  const mine = loans.filter((l) => l.borrower.toLowerCase() === address.toLowerCase());
  const active = mine.filter((l) => l.status === STATUS.ACTIVE || l.status === STATUS.AUCTION);
  const closed = mine.filter((l) => l.status === STATUS.REPAID || l.status === STATUS.SETTLED);
  const list = (tab === "active" ? active : closed).sort((a, b) => Number(a.maturity - b.maturity));
  const borrowed = active.reduce((s, l) => s + l.principal, 0n);
  const next = active.filter((l) => l.status === STATUS.ACTIVE).sort((a, b) => Number(a.maturity - b.maturity))[0];
  const collValue = active.reduce((s, l) => {
    const a = p.assets.find((x) => x.token.toLowerCase() === l.asset.toLowerCase());
    return s + (a?.price ? (l.collateral * a.price) / 10n ** 20n : 0n);
  }, 0n);

  return (
    <section>
      <div className="ph">
        <div>
          <div className="eyebrow">My certificates</div>
          <h1>Your loans</h1>
        </div>
        <div className="seg">
          <button className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>
            Active · {active.length}
          </button>
          <button className={tab === "closed" ? "on" : ""} onClick={() => setTab("closed")}>
            Closed · {closed.length}
          </button>
        </div>
      </div>
      <div className="kpis">
        <div>
          <span className="eyebrow">Borrowed</span>
          <b>{usd(borrowed)}</b>
          <small>USDG across {active.length} loans</small>
        </div>
        <div>
          <span className="eyebrow">Next due</span>
          <b className="a">{next ? duration(Number(next.maturity) - now) : "—"}</b>
          <small>{next ? `Nº ${String(next.id).padStart(4, "0")} · ${assetByToken(next.asset)?.symbol}` : "No active loans"}</small>
        </div>
        <div>
          <span className="eyebrow">Collateral value</span>
          <b>{usd(collValue)}</b>
          <small>USD at oracle</small>
        </div>
        <div>
          <span className="eyebrow">Surplus to claim</span>
          <b className="up">{usd(surplus ?? 0n)}</b>
          <small>
            USDG
            {surplus ? (
              <>
                {" · "}
                <button
                  className="max"
                  disabled={tx.busy}
                  onClick={() =>
                    tx.run(
                      [
                        {
                          label: "Claiming",
                          send: () =>
                            write({
                              address: dep.loanManager,
                              abi: loanManagerAbi,
                              functionName: "claimSurplus",
                              args: [address],
                            }),
                        },
                      ],
                      "Surplus claimed",
                    )
                  }
                >
                  CLAIM
                </button>
              </>
            ) : null}
          </small>
        </div>
      </div>
      {tx.state.error ? <div className="err">{tx.state.error}</div> : null}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="empty">
          {tab === "active" ? (
            <>
              No active loans. <Link className="a" href="/app/borrow">Borrow USDG →</Link>
            </>
          ) : (
            "No closed loans yet."
          )}
        </div>
      ) : (
        <div className="cgrid">
          {list.map((l) => (
            <Certificate key={String(l.id)} l={l} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function statusOf(l: LoanView, now: number) {
  const m = Number(l.maturity);
  const g = Number(l.graceEnd ?? l.maturity);
  if (l.status === STATUS.REPAID) return { chip: "c-mute", text: "Repaid", bar: "var(--ash)" };
  if (l.status === STATUS.SETTLED) return { chip: "c-mute", text: "Settled by auction", bar: "var(--ash)" };
  if (l.status === STATUS.AUCTION) return { chip: "c-down", text: "● In auction", bar: "var(--down)" };
  if (now > g) return { chip: "c-down", text: "● Overdue · auction pending", bar: "var(--down)" };
  if (now > m) return { chip: "c-down", text: `● Grace · ${duration(g - now)} left`, bar: "var(--down)" };
  if (m - now < 86400 * 2) return { chip: "c-amber", text: `● Due in ${duration(m - now)}`, bar: "var(--amber)" };
  return { chip: "c-up", text: "● On time", bar: "var(--amber)" };
}

function Certificate({ l, now }: { l: LoanView; now: number }) {
  const { address } = useConnection();
  const tx = useTx();
  const [addIn, setAddIn] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const a = assetByToken(l.asset);
  const v = VAULTS.find((x) => x.address.toLowerCase() === l.vault.toLowerCase());
  const st = statusOf(l, now);
  const progress = Math.min(100, Math.max(0, ((now - Number(l.start)) / Number(l.maturity - l.start)) * 100));
  const isActive = l.status === STATUS.ACTIVE;
  const rollOpen = isActive && now + 3 * 86400 >= Number(l.maturity) && now <= Number(l.graceEnd ?? 0n);
  const urgent = isActive && now > Number(l.maturity) - 86400;
  const feeBps = v?.key === "30d" ? 25n : 6n;

  const repay = () =>
    tx.run(
      [
        { label: "Approving USDG", send: () => approveIfNeeded(dep.usdg, address!, dep.loanManager, l.principal + l.interest) },
        {
          label: "Repaying",
          send: () =>
            write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "repay", args: [l.id, address!] }),
        },
      ],
      `Repaid. ${a?.symbol} returned to your wallet.`,
    );
  const roll = () =>
    tx.run(
      [
        {
          label: "Approving USDG",
          send: () => approveIfNeeded(dep.usdg, address!, dep.loanManager, l.interest + (l.principal * feeBps) / 10_000n),
        },
        {
          label: "Rolling over",
          send: async () => {
            // cap the new rate at the top of this asset's rate band (read now, not assumed)
            const [, , rateMax] = await readContract(wagmiConfig, {
              address: dep.loanManager,
              abi: loanManagerAbi,
              functionName: "risk",
              args: [l.vault, l.asset],
            });
            return write({
              address: dep.loanManager,
              abi: loanManagerAbi,
              functionName: "rollover",
              args: [l.id, l.principal, BigInt(rateMax), (l.principal * feeBps) / 10_000n],
            });
          },
        },
      ],
      "Rolled over: new date and rate written on the certificate.",
    );
  const add = () => {
    const amt = parse(addIn, STOCK_DEC);
    if (!amt || !a) return;
    tx.run(
      [
        { label: `Approving ${a.symbol}`, send: () => approveIfNeeded(a.token, address!, dep.loanManager, amt) },
        {
          label: "Adding collateral",
          send: () =>
            write({ address: dep.loanManager, abi: loanManagerAbi, functionName: "addCollateral", args: [l.id, amt] }),
        },
      ],
      "Collateral added",
    ).then((ok) => ok && (setAddIn(""), setShowAdd(false)));
  };

  return (
    <div className="cert" style={st.chip === "c-down" ? { borderColor: "#4a2222" } : st.chip === "c-amber" ? { borderColor: "#3a3020" } : undefined}>
      <div className="h">
        <div>
          <div className="no">{certNo(l.id)}</div>
          <div className="ash" style={{ fontSize: 13 }}>
            <span className="mono" style={{ color: "var(--paper)" }}>
              {a?.symbol} → USDG
            </span>{" "}
            · {v?.label}
          </div>
        </div>
        <span className={`chip ${st.chip}`}>{st.text}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${progress}%`, background: st.bar }} />
      </div>
      <div className="row"><span>Collateral</span><span>{shares(l.collateral)} {a?.symbol}</span></div>
      <div className="row"><span>Borrowed</span><span>{usd(l.principal)} USDG</span></div>
      <div className="row"><span>Fixed rate</span><span>{pct(l.rateBps)} APR</span></div>
      <div className="row"><span>{now > Number(l.maturity) ? "Was due" : "Redeem by"}</span><span className={now > Number(l.maturity) ? "down" : "a"}>{etDate(l.maturity)}</span></div>
      {isActive ? (
        <div className="row">
          <span>{now < Number(l.maturity) ? "Repay today" : "To repay"}</span>
          <span>{usd(l.principal + (l.dueNow ?? 0n))} USDG</span>
        </div>
      ) : null}
      {isActive && (
        <>
          <div className="acts">
            <button className={urgent ? "btn p" : "btn o"} disabled={tx.busy} onClick={repay}>
              {tx.busy ? `${tx.state.busy}…` : "Repay"}
            </button>
            <button className="btn s" disabled={!rollOpen || tx.busy} onClick={roll} title={rollOpen ? "" : "Opens 3 days before the due date"}>
              Roll over{rollOpen ? "" : ` · ${etDate(l.maturity - 3n * 86400n).split(" ").slice(0, 3).join(" ")}`}
            </button>
            <button className="btn s" disabled={tx.busy} onClick={() => setShowAdd(!showAdd)}>
              + Collateral
            </button>
          </div>
          {showAdd && (
            <div className="field">
              <div className="lbl"><span>Add {a?.symbol}</span></div>
              <div className="val">
                <input inputMode="decimal" value={addIn} onChange={(e) => setAddIn(e.target.value)} placeholder="0.00" />
                <button className="btn o sm" onClick={add} disabled={tx.busy}>
                  Add
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {tx.state.error ? <div className="err">{tx.state.error}</div> : null}
      {tx.state.done ? <div className="ok">{tx.state.done}</div> : null}
    </div>
  );
}
