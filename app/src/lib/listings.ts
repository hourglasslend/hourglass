// Planned first listings on mainnet (contracts/script/Deploy.s.sol). Used where no chain is read (docs,
// pre-launch site). Live values always come from LoanManager.
export type Listing = { symbol: string; name: string; ltv7: number; ltv30: number; rateMin: number; rateMax: number };
export type ListingGroup = { group: string; rows: Listing[] };

const idx = { ltv7: 60, ltv30: 55, rateMin: 8, rateMax: 12 };
const mega = { ltv7: 45, ltv30: 40, rateMin: 10, rateMax: 16 };

export const LISTING_GROUPS: ListingGroup[] = [
  { group: "Index & ETF", rows: [{ symbol: "SPY", name: "SPDR S&P 500 ETF", ...idx }, { symbol: "QQQ", name: "Invesco QQQ", ...idx }] },
  {
    group: "Mega-cap",
    rows: [
      { symbol: "NVDA", name: "NVIDIA", ...mega },
      { symbol: "AAPL", name: "Apple", ...mega },
      { symbol: "MSFT", name: "Microsoft", ...mega },
      { symbol: "GOOGL", name: "Alphabet", ...mega },
      { symbol: "META", name: "Meta Platforms", ...mega },
      { symbol: "AMZN", name: "Amazon", ...mega },
    ],
  },
  { group: "High volatility", rows: [{ symbol: "TSLA", name: "Tesla", ltv7: 40, ltv30: 35, rateMin: 12, rateMax: 20 }] },
  { group: "T-bills", rows: [{ symbol: "SGOV", name: "iShares 0-3M Treasury", ltv7: 80, ltv30: 80, rateMin: 6, rateMax: 8 }] },
];
