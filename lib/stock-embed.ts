import type { DiscordEmbed } from "./discord-bot";
import type { StockQuote } from "./stocks";

export type PricePoint = { trade_date: string; price: number };

const QUICKCHART_CREATE_URL = "https://quickchart.io/chart/create";

// Merge today's live quote into the historical series — stock_price_history may not have
// today's row yet (poll writes it in the same run that calls this, before or after
// depending on call order; /cours never writes it at all), so this guarantees the chart
// always ends on the price actually shown in the embed.
export function withLatestPoint(history: PricePoint[], quote: StockQuote): PricePoint[] {
  const withoutToday = history.filter((h) => h.trade_date !== quote.latestTradingDay);
  return [...withoutToday, { trade_date: quote.latestTradingDay, price: quote.price }].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date),
  );
}

async function buildChartUrl(history: PricePoint[], trendUp: boolean): Promise<string | null> {
  if (history.length < 2) return null; // a single point isn't a chart

  const color = trendUp ? "#2ecc71" : "#e74c3c";
  const config = {
    type: "line",
    data: {
      labels: history.map((h) => h.trade_date.slice(5)), // MM-DD
      datasets: [
        {
          data: history.map((h) => h.price),
          borderColor: color,
          backgroundColor: `${color}33`,
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.25,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 6, font: { size: 10 } } },
        y: { ticks: { font: { size: 10 } } },
      },
    },
  };

  try {
    const res = await fetch(QUICKCHART_CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: config,
        width: 400,
        height: 180,
        backgroundColor: "white",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.url === "string" ? data.url : null;
  } catch (err) {
    console.error("Chart generation failed:", err);
    return null;
  }
}

export async function buildStockEmbed(
  quote: StockQuote,
  history: PricePoint[],
): Promise<DiscordEmbed> {
  const trendUp = quote.change >= 0;
  const arrow = trendUp ? "⬆️" : "⬇️";
  const sign = trendUp ? "+" : "";
  const color = trendUp ? 0x2ecc71 : 0xe74c3c;

  const embed: DiscordEmbed = {
    title: `${arrow} ${quote.label}`,
    color,
    description:
      `**${quote.price.toFixed(2)} €**  (${sign}${quote.change.toFixed(2)} / ${sign}${quote.changePercent.toFixed(2)}%)\n` +
      `\`${quote.ticker}\``,
  };

  const chartUrl = await buildChartUrl(history, trendUp);
  if (chartUrl) embed.image = { url: chartUrl };

  return embed;
}
