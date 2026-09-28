import { describe, expect, it } from "vitest";
import { computeHoldingFromTransactions } from "@/lib/position-transactions";

describe("computeHoldingFromTransactions", () => {
  it("returns no holding for no transactions", () => {
    expect(computeHoldingFromTransactions([])).toEqual({ shares: 0, costBasis: null });
  });

  it("averages the cost across buys", () => {
    const result = computeHoldingFromTransactions([
      { transaction_date: "2026-01-10", shares: 10, price_per_share: 100 },
      { transaction_date: "2026-02-10", shares: 10, price_per_share: 120 },
    ]);
    expect(result).toEqual({ shares: 20, costBasis: 110 });
  });

  it("keeps the average cost unchanged on a sell", () => {
    const result = computeHoldingFromTransactions([
      { transaction_date: "2026-01-10", shares: 10, price_per_share: 100 },
      { transaction_date: "2026-02-10", shares: 10, price_per_share: 120 },
      { transaction_date: "2026-03-10", shares: -5, price_per_share: 150 },
    ]);
    expect(result).toEqual({ shares: 15, costBasis: 110 });
  });

  it("applies transactions in date order regardless of input order", () => {
    const result = computeHoldingFromTransactions([
      { transaction_date: "2026-03-10", shares: -5, price_per_share: 150 },
      { transaction_date: "2026-01-10", shares: 10, price_per_share: 100 },
    ]);
    expect(result).toEqual({ shares: 5, costBasis: 100 });
  });

  it("restarts the average after a full exit", () => {
    const result = computeHoldingFromTransactions([
      { transaction_date: "2026-01-10", shares: 10, price_per_share: 100 },
      { transaction_date: "2026-02-10", shares: -10, price_per_share: 130 },
      { transaction_date: "2026-03-10", shares: 4, price_per_share: 90 },
    ]);
    expect(result).toEqual({ shares: 4, costBasis: 90 });
  });

  it("reports no cost basis when everything was sold", () => {
    const result = computeHoldingFromTransactions([
      { transaction_date: "2026-01-10", shares: 10, price_per_share: 100 },
      { transaction_date: "2026-02-10", shares: -10, price_per_share: 130 },
    ]);
    expect(result).toEqual({ shares: 0, costBasis: null });
  });
});
