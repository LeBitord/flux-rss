export type StockQuote = {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
};

export async function getStockQuote(ticker: string): Promise<StockQuote | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const quote = data["Global Quote"];
    if (!quote || !quote["05. price"]) return null;

    return {
      ticker,
      price: parseFloat(quote["05. price"]),
      change: parseFloat(quote["09. change"]),
      changePercent: parseFloat(String(quote["10. change percent"]).replace("%", "")),
      latestTradingDay: quote["07. latest trading day"],
    };
  } catch (err) {
    console.error(`Stock quote fetch failed for ${ticker}:`, err);
    return null;
  }
}

// Alpha Vantage's free tier caps at ~1 request/second — space calls out when checking
// several tickers in a row rather than firing them concurrently.
export async function getStockQuotes(tickers: string[]): Promise<StockQuote[]> {
  const results: StockQuote[] = [];
  for (const ticker of tickers) {
    const quote = await getStockQuote(ticker);
    if (quote) results.push(quote);
    if (tickers.indexOf(ticker) < tickers.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return results;
}

export function formatStockLine(quote: StockQuote): string {
  // Plain arrows instead of 📈/📉 — the chart emoji render ambiguously (direction is hard
  // to tell at a glance) in some Discord clients' emoji font.
  const arrow = quote.change >= 0 ? "⬆️" : "⬇️";
  const sign = quote.change >= 0 ? "+" : "";
  return `${arrow} **${quote.ticker}** : ${quote.price.toFixed(2)} € (${sign}${quote.change.toFixed(2)} / ${sign}${quote.changePercent.toFixed(2)}%)`;
}
