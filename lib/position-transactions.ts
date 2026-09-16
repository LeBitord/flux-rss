export type PositionTransaction = {
  transaction_date: string;
  shares: number; // positive = buy, negative = sell
  price_per_share: number;
};

// Average-cost method: a buy blends into the running average cost; a sell only reduces
// the share count — it doesn't change the average cost of what's left (no lot-level
// tracking, this is a personal tracker, not a tax tool).
export function computeHoldingFromTransactions(
  transactions: PositionTransaction[],
): { shares: number; costBasis: number | null } {
  const sorted = [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date),
  );

  let shares = 0;
  let avgCost = 0;
  for (const tx of sorted) {
    if (tx.shares > 0) {
      const newShares = shares + tx.shares;
      avgCost = newShares > 0 ? (avgCost * shares + tx.price_per_share * tx.shares) / newShares : 0;
      shares = newShares;
    } else {
      shares += tx.shares; // tx.shares already negative
    }
  }

  return { shares, costBasis: shares > 0 ? avgCost : null };
}
