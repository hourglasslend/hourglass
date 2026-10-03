"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { faucetTokenAbi } from "@/lib/abi";
import { chain, dep, isLocal, isMainnet, isTestnet } from "@/lib/deployments";
import { short } from "@/lib/format";
import { useProtocol } from "@/lib/protocol";
import { useTx, write } from "@/lib/tx";
import { LOCAL_FLAG } from "./LocalReconnect";

const TABS = [
  ["borrow", "Borrow"],
  ["certificates", "Certificates"],
  ["lend", "Lend"],
  ["auctions", "Auctions"],
  ["safety", "Safety"],
  ["ledger", "Ledger"],
] as const;

export function TopBar() {
  const path = usePathname();
  const { marketOpen } = useProtocol();
  const links = TABS.map(([k, label]) => (
    <Link key={k} href={`/app/${k}`} className={path?.startsWith(`/app/${k}`) ? "on" : ""}>
      {label}
    </Link>
  ));
  return (
    <div className="top">
      <div className="in">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hourglass-lockup-on-dark.svg" alt="Hourglass" style={{ height: 26, display: "block" }} />
        </Link>
        <nav className="tabs">{links}</nav>
        <div className="tr">
          {marketOpen === undefined ? null : marketOpen ? (
            <span className="chip c-up hide-m">● Market open</span>
          ) : (
            <span className="chip c-dash hide-m">☾ Market closed</span>
          )}
          {isTestnet ? <Faucet /> : null}
          <span className={`chip ${isMainnet ? "c-mute" : "c-dash"} hide-m`}>{isLocal ? "Local" : isMainnet ? "Mainnet" : "Testnet"}</span>
          <Wallet />
        </div>
      </div>
      <nav className="mtabs">{links}</nav>
    </div>
  );
}

/** Test networks only: every test token (USDG, GLASS, stocks) has a public faucet. */
function Faucet() {
  const { address } = useConnection();
  const tx = useTx();
  if (!address) return null;
  const tokens = [dep.usdg, dep.glass, ...dep.assets.map((a) => a.token)];
  return (
    <button
      className="btn s sm"
      disabled={tx.busy}
      title={tx.state.error ?? "Mint test USDG, GLASS and 100 of each test stock"}
      onClick={() =>
        tx.run(
          tokens.map((t) => ({
            label: "Faucet",
            send: () => write({ address: t, abi: faucetTokenAbi, functionName: "faucet" }),
          })),
          "Test tokens sent",
        )
      }
    >
      {tx.busy ? "Minting…" : tx.state.done ? "✓ Faucet" : "Faucet"}
    </button>
  );
}

function Wallet() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  if (isConnected && address && chainId !== chain.id) {
    return (
      <button className="btn o sm" disabled={switching} title={`Switch to ${chain.name}`} onClick={() => switchChain({ chainId: chain.id })}>
        {switching ? "Switching…" : "Wrong network · Switch"}
      </button>
    );
  }
  if (isConnected && address) {
    return (
      <>
        <button className="wallet" onClick={() => setOpen(!open)}>
          <span className="dot" />
          {short(address)}
        </button>
        {open && (
          <div className="menu">
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(LOCAL_FLAG);
                } catch {}
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <button className="btn p sm" onClick={() => setOpen(!open)}>
        Connect wallet
      </button>
      {open && (
        <div className="menu">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                try {
                  if (c.id === "localAnvil") localStorage.setItem(LOCAL_FLAG, "1");
                } catch {}
                connect({ connector: c, chainId: chain.id });
                setOpen(false);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
