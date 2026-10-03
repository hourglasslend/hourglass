import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/site/Restricted";

export const metadata: Metadata = { title: "Borrowing unavailable · Hourglass", robots: { index: false } };

export default function BorrowRestricted() {
  return (
    <Restricted
      title={<>Borrowing isn&apos;t <i className="a">available here.</i></>}
      actions={<><Link className="btn p" href="/app/lend">Lend USDG</Link><Link className="btn s" href="/app/certificates">My certificates</Link></>}
    >
      <p>Stock tokens can&apos;t be offered to persons in the United States, Canada, the United Kingdom or Switzerland, so new loans can&apos;t be opened from your location. Existing loans can still be repaid, and lending and staking remain available.</p>
    </Restricted>
  );
}
