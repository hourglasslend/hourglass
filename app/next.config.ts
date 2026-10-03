import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Security headers for every route (same baseline as Kata). frame-ancestors blocks clickjacking of the app.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const NETWORKS = ["local", "testnet", "mainnet", "prelaunch"];

export default function config(phase: string): NextConfig {
  const network = process.env.NEXT_PUBLIC_NETWORK;
  if (network && !NETWORKS.includes(network)) throw new Error(`NEXT_PUBLIC_NETWORK must be one of ${NETWORKS.join(", ")}`);
  // A production build must name a public network: the local build ships the anvil test-account connector.
  if (phase === PHASE_PRODUCTION_BUILD && process.env.VERCEL_ENV === "production" && (!network || network === "local")) {
    throw new Error("Production build needs NEXT_PUBLIC_NETWORK=prelaunch, testnet or mainnet");
  }
  // src/deployments/4663.json ships as {"pending": true} until the mainnet deployment exists
  if (network === "mainnet" && JSON.parse(readFileSync("src/deployments/4663.json", "utf8")).pending) {
    throw new Error("Mainnet addresses are pending: deploy, then run npm run sync:mainnet");
  }
  if (process.env.VERCEL && (process.env.NEXT_PUBLIC_RPC_URL ?? "").includes("127.0.0.1")) {
    throw new Error("NEXT_PUBLIC_RPC_URL points at localhost: that build would ship the anvil test-account connector");
  }
  const prelaunch = network === "prelaunch";
  return {
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
    async redirects() {
      return [
        { source: "/:path*", has: [{ type: "host", value: "www.hourglasslend.xyz" }], destination: "https://hourglasslend.xyz/:path*", permanent: true },
        // the pre-launch routes are only reachable through the rewrites below
        ...(prelaunch ? [] : [{ source: "/prelaunch/:path*", destination: "/", permanent: false }]),
      ];
    },
    // Pre-launch: "/" and "/app/*" serve static routes, so no wallet code is ever loaded.
    async rewrites() {
      if (!prelaunch) return [];
      return {
        beforeFiles: [
          { source: "/", destination: "/prelaunch" },
          { source: "/app", destination: "/prelaunch/app" },
          { source: "/app/:path*", destination: "/prelaunch/app" },
        ],
        afterFiles: [],
        fallback: [],
      };
    },
  };
}
