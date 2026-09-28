import type { DailyClose } from "@/lib/stocks";

// An ETF tracking the index rather than the index itself: Alpha Vantage's free tier
// serves ETFs (Euronext included) but not raw indices. CW8 = Amundi MSCI World.
export const DEFAULT_BENCHMARK = { ticker: "CW8.PA", label: "MSCI World" };

export function getBenchmarkConfig(): { ticker: string; label: string } | null {
  const ticker = process.env.BENCHMARK_TICKER?.trim();
  if (ticker === "") return null; // explicitly disabled
  if (!ticker) return DEFAULT_BENCHMARK;
  return { ticker, label: process.env.BENCHMARK_LABEL?.trim() || ticker };
}

// % change between the latest close and the last close on or before `cutoffDate`.
export function changeSince(history: DailyClose[], cutoffDate: string): number | null {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const past = [...history].reverse().find((p) => p.date <= cutoffDate);
  if (!past || past.close === 0 || past.date === latest.date) return null;
  return ((latest.close - past.close) / past.close) * 100;
}

// Portfolio change over the period: value-weighted over positions whose share count is
// known (same shares at both ends — a trade during the week isn't modelled); falls back
// to a plain average of the positions' % changes when no share counts are set.
export function portfolioChange(
  positions: { shares: number | null; latest: number; weekAgo: number }[],
): number | null {
  const valid = positions.filter((p) => p.weekAgo > 0);
  if (valid.length === 0) return null;

  const held = valid.filter((p) => p.shares && p.shares > 0);
  if (held.length > 0) {
    const before = held.reduce((sum, p) => sum + p.shares! * p.weekAgo, 0);
    const after = held.reduce((sum, p) => sum + p.shares! * p.latest, 0);
    return ((after - before) / before) * 100;
  }

  const sum = valid.reduce((acc, p) => acc + ((p.latest - p.weekAgo) / p.weekAgo) * 100, 0);
  return sum / valid.length;
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
