import { LISTING_GROUPS } from "@/lib/listings";

/* Pre-launch counterparts of Live.tsx: same markup, no wallet code and no chain reads. Numbers that only the
   chain can give stay "—"; never sample numbers. */

export function StaticStats() {
  const cells = ["USDG in vaults", "Lent out now", "Avg fixed rate", "Repaid on time", "Bad debt"];
  return (
    <div className="stats">
      <div className="wrap">
        {cells.map((c) => <div className="s" key={c}><div className="eyebrow">{c}</div><div className="v">—</div></div>)}
      </div>
    </div>
  );
}

export function StaticCertificate() {
  return (
    <div className="cert" aria-label="Loan certificate">
      <div className="h">
        <div>
          <div className="eyebrow">Loan certificate</div>
          <div className="no" style={{ marginTop: 6 }}>Certificate Nº —</div>
          <div className="ash" style={{ fontSize: 14, marginTop: 6 }}>
            <span className="mono" style={{ color: "var(--paper)" }}>STOCK → USDG</span> · 7-Day or 30-Day vault
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/hourglass-mark.svg" alt="" style={{ width: 56 }} />
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="row"><span>Collateral</span><span>Your stock tokens</span></div>
        <div className="row"><span>Borrowed</span><span>USDG</span></div>
        <div className="row"><span>Fixed rate</span><span>Locked at signing</span></div>
        <div className="row"><span>Interest at maturity</span><span className="a">Known up front</span></div>
        <div className="row"><span>Redeem by</span><span className="a">Tue–Thu · market hours</span></div>
      </div>
      <div className="bar" style={{ height: 6, margin: "22px 0 8px" }}><i style={{ width: "0%" }} /></div>
      <div className="eyebrow">Testnet opens soon</div>
      <div className="count">
        {["DAYS", "HRS", "MIN", "SEC"].map((u) => <div key={u}><b>—</b><span>{u}</span></div>)}
      </div>
    </div>
  );
}

export function StaticMarkets() {
  return (
    <div className="scroll-x" style={{ marginTop: 34 }}>
      <table>
        <thead>
          <tr><th>Asset</th><th>Price</th><th>Max LTV 7D</th><th>Max LTV 30D</th><th>Rate band</th><th>Rate now · 7D</th><th>Oracle</th><th></th></tr>
        </thead>
        <tbody>
          {LISTING_GROUPS.map((g) => [
            <tr className="grp" key={g.group}><td colSpan={8}>{g.group}</td></tr>,
            ...g.rows.map((a) => (
              <tr key={a.symbol}>
                <td><div className="tk"><span className="logo">{a.symbol}</span><div><b>{a.symbol}</b><small>{a.name}</small></div></div></td>
                <td>—</td>
                <td>{a.ltv7}%</td>
                <td>{a.ltv30}%</td>
                <td>{a.rateMin}–{a.rateMax}%</td>
                <td className="a">—</td>
                <td>—</td>
                <td><span className="chip c-mute">Soon</span></td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

export function StaticVaults() {
  return (
    <div className="vaults">
      {[["7-Day", "7D", 7], ["30-Day", "30D", 30]].map(([label, key, days]) => (
        <div className="card" key={key}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div className="eyebrow">Vault</div><h3 className="serif" style={{ fontSize: 32, fontWeight: 500, marginTop: 4 }}>{label}</h3></div>
            <span className="chip c-mute">hgUSDG-{key}</span>
          </div>
          <div className="apy">—<small>% APY now</small></div>
          <div className="util"><i style={{ width: "0%" }} /><em /></div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="eyebrow"><span>Utilisation —</span><span className="a">Cap 80%</span></div>
          <div className="kv">
            <div><span className="eyebrow">TVL</span><b>—</b></div>
            <div><span className="eyebrow">Withdraw now</span><b>—</b></div>
            <div><span className="eyebrow">Max wait</span><b>≤ {Number(days) + 2} days</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StaticLedger() {
  return <p style={{ marginTop: 18 }}>The ledger fills in from the contracts once testnet opens. No fee distributions yet.</p>;
}
