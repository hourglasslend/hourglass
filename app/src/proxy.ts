import { NextResponse, type NextRequest } from "next/server";

// Regional rules (deploy-plan.md, Terms). The country comes from Vercel's edge geolocation header. Off Vercel
// (local dev) GEO_TEST_COUNTRY / GEO_TEST_REGION can stand in to try the rules; they are ignored on Vercel.
const SANCTIONED = new Set(["CU", "IR", "KP", "SY", "RU", "BY"]);
const SANCTIONED_UA_REGIONS = new Set(["43", "40", "14", "09"]); // Crimea, Sevastopol, Donetsk, Luhansk
const NO_BORROW = new Set(["US", "CA", "GB", "CH"]); // stock tokens can't be offered there

export function proxy(req: NextRequest) {
  const onVercel = !!process.env.VERCEL;
  const country = (req.headers.get("x-vercel-ip-country") ?? (onVercel ? "" : process.env.GEO_TEST_COUNTRY ?? "")).toUpperCase();
  const region = (req.headers.get("x-vercel-ip-country-region") ?? (onVercel ? "" : process.env.GEO_TEST_REGION ?? "")).toUpperCase();

  if (SANCTIONED.has(country) || (country === "UA" && SANCTIONED_UA_REGIONS.has(region))) {
    return NextResponse.rewrite(new URL("/restricted/region", req.url));
  }
  // Only opening new loans is blocked: repaying, rolling over an existing loan, lending and staking stay open.
  if (NO_BORROW.has(country) && req.nextUrl.pathname.startsWith("/app/borrow")) {
    return NextResponse.rewrite(new URL("/restricted/borrow", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/app/:path*"] };
