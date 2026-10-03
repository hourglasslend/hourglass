import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/site/Restricted";

export const metadata: Metadata = { title: "Unavailable · Hourglass", robots: { index: false } };

export default function RegionRestricted() {
  return (
    <Restricted title={<>The app isn&apos;t <i className="a">available here.</i></>} actions={<Link className="btn s" href="/docs">Read the docs</Link>}>
      <p>The Hourglass app can&apos;t be used from your location because of sanctions. The contracts on Robinhood Chain are public, but this interface does not serve your region.</p>
    </Restricted>
  );
}
