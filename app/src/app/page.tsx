import { Providers } from "@/components/Providers";
import { HomePage } from "@/components/home/HomePage";
import { HeroCertificate, LiveLedger, LiveMarkets, LiveStats, LiveVaults, ReserveText, StakedText } from "@/components/home/Live";

export default function Home() {
  return (
    <Providers>
      <HomePage
        certificate={<HeroCertificate />}
        stats={<LiveStats />}
        markets={<LiveMarkets />}
        vaults={<LiveVaults />}
        reserve={<ReserveText />}
        staked={<StakedText />}
        ledger={<LiveLedger />}
      />
    </Providers>
  );
}
