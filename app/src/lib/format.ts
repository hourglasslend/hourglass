import { formatUnits, parseUnits } from "viem";

export const USDG_DEC = 6;
export const STOCK_DEC = 18;

/** 12,345.67 — fixed decimals, thousands separators, never scientific notation. */
export function fmt(value: bigint | undefined, decimals: number, dp = 2): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export const usd = (v: bigint | undefined, dp = 2) => fmt(v, USDG_DEC, dp);
export const shares = (v: bigint | undefined, dp = 2) => fmt(v, STOCK_DEC, dp);
export const pct = (bps: bigint | number | undefined, dp = 2) =>
  bps === undefined ? "—" : `${(Number(bps) / 100).toFixed(dp)}%`;

export function parse(input: string, decimals: number): bigint | undefined {
  const clean = input.replace(/,/g, "").trim();
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return undefined;
  try {
    return parseUnits(clean, decimals);
  } catch {
    return undefined;
  }
}

const ET = "America/New_York";

/** "Tue 13 Oct · 14:30 ET" */
export function etDate(ts: bigint | number | undefined): string {
  if (ts === undefined) return "—";
  const d = new Date(Number(ts) * 1000);
  const day = d.toLocaleDateString("en-US", { timeZone: ET, weekday: "short" });
  const date = d.toLocaleDateString("en-GB", { timeZone: ET, day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: ET, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${date} · ${time} ET`;
}

/** "6 d 20 h", "20 h 00 m", "12 m" */
export function duration(secs: number): string {
  if (secs <= 0) return "0 m";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} m`;
  return `${m} m`;
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
