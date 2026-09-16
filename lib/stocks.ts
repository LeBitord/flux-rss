export type StockQuote = {
  ticker: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
};

export type DailyClose = { date: string; close: number };

// Alpha Vantage's free tier only allows outputsize=compact (last ~100 trading days,
// roughly 5 months) — outputsize=full is a premium-only feature.
async function fetchDailySeries(ticker: string): Promise<DailyClose[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${apiKey}`,
    );
    if (!res.ok) return [];

    const data = await res.json();
    const series = data["Time Series (Daily)"];
    if (!series) return [];

    return Object.entries(series as Record<string, { "4. close": string }>)
      .map(([date, day]) => ({ date, close: parseFloat(day["4. close"]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.error(`Daily series fetch failed for ${ticker}:`, err);
    return [];
  }
}

// One API call gets both the current quote AND up to ~5 months of daily history —
// derive the quote from the series instead of also calling GLOBAL_QUOTE, so total
// Alpha Vantage usage per ticker stays the same as before.
export async function getStockQuoteWithHistory(
  ticker: string,
  label: string,
): Promise<{ quote: StockQuote; history: DailyClose[] } | null> {
  const history = await fetchDailySeries(ticker);
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : latest;
  const change = latest.close - previous.close;
  const changePercent = previous.close !== 0 ? (change / previous.close) * 100 : 0;

  return {
    quote: {
      ticker,
      label,
      price: latest.close,
      change,
      changePercent,
      latestTradingDay: latest.date,
    },
    history,
  };
}

// Alpha Vantage's free tier caps at ~1 request/second — space calls out when checking
// several tickers in a row rather than firing them concurrently.
export async function getStockQuotesWithHistory(
  positions: { ticker: string; label: string }[],
): Promise<{ quote: StockQuote; history: DailyClose[] }[]> {
  const results: { quote: StockQuote; history: DailyClose[] }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const result = await getStockQuoteWithHistory(positions[i].ticker, positions[i].label);
    if (result) results.push(result);
    if (i < positions.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return results;
}

export async function getStockQuote(ticker: string, label: string): Promise<StockQuote | null> {
  const result = await getStockQuoteWithHistory(ticker, label);
  return result?.quote ?? null;
}

export async function getStockQuotes(
  positions: { ticker: string; label: string }[],
): Promise<StockQuote[]> {
  const results = await getStockQuotesWithHistory(positions);
  return results.map((r) => r.quote);
}

export function formatStockLine(quote: StockQuote): string {
  // Plain arrows instead of 📈/📉 — the chart emoji render ambiguously (direction is hard
  // to tell at a glance) in some Discord clients' emoji font.
  const arrow = quote.change >= 0 ? "⬆️" : "⬇️";
  const sign = quote.change >= 0 ? "+" : "";
  return `${arrow} **${quote.label}** (${quote.ticker}) : ${quote.price.toFixed(2)} € (${sign}${quote.change.toFixed(2)} / ${sign}${quote.changePercent.toFixed(2)}%)`;
}
