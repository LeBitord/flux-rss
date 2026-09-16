import type { DiscordEmbed } from "./discord-bot";
import type { StockQuote, DailyClose } from "./stocks";

export type ChartPeriod = "day" | "week" | "month";

const PERIOD_LABEL: Record<ChartPeriod, string> = {
  day: "7 derniers jours",
  week: "Vue hebdomadaire",
  month: "Vue mensuelle",
};

// Same underlying ~100-day daily series (Alpha Vantage free tier's max depth), sliced or
// grouped differently depending on the requested zoom level.
export function aggregateByPeriod(history: DailyClose[], period: ChartPeriod): DailyClose[] {
  if (period === "day") return history.slice(-7);

  if (period === "week") {
    const byWeek = new Map<string, DailyClose>();
    for (const point of history) {
      const date = new Date(point.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // Monday of that week
      byWeek.set(weekStart.toISOString().slice(0, 10), point); // last write wins = latest close of the week
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, point]) => point);
  }

  // month
  const byMonth = new Map<string, DailyClose>();
  for (const point of history) {
    byMonth.set(point.date.slice(0, 7), point); // last write wins = latest close of the month
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

const QUICKCHART_CREATE_URL = "https://quickchart.io/chart/create";

async function buildChartUrl(
  history: DailyClose[],
  period: ChartPeriod,
  trendUp: boolean,
): Promise<string | null> {
  if (history.length < 2) return null; // a single point isn't a chart

  const lineColor = trendUp ? "#16a34a" : "#dc2626";
  const fillColor = trendUp ? "rgba(22, 163, 74, 0.12)" : "rgba(220, 38, 38, 0.12)";

  const labelFormat: Intl.DateTimeFormatOptions =
    period === "month" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" };

  const config = {
    type: "line",
    data: {
      labels: history.map((h) => new Date(h.date).toLocaleDateString("fr-FR", labelFormat)),
      datasets: [
        {
          data: history.map((h) => h.close),
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2.5,
          tension: 0.35,
          cubicInterpolationMode: "monotone",
        },
      ],
    },
    options: {
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: PERIOD_LABEL[period],
          font: { size: 13, weight: "normal" },
          color: "#6b7280",
          padding: { bottom: 10 },
        },
      },
      elements: { line: { capBezierPoints: true } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 11 }, color: "#9ca3af" },
        },
        y: {
          grid: { color: "#f0f0f0" },
          ticks: {
            font: { size: 11 },
            color: "#9ca3af",
            callback: "function(v) { return v.toFixed(0) + ' €'; }",
          },
        },
      },
    },
  };

  try {
    const res = await fetch(QUICKCHART_CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: config,
        width: 520,
        height: 220,
        backgroundColor: "white",
        version: "4",
        devicePixelRatio: 2,
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
  fullHistory: DailyClose[],
  period: ChartPeriod = "month",
): Promise<DiscordEmbed> {
  const trendUp = quote.change >= 0;
  const arrow = trendUp ? "⬆️" : "⬇️";
  const sign = trendUp ? "+" : "";
  const color = trendUp ? 0x16a34a : 0xdc2626;

  const embed: DiscordEmbed = {
    title: `${arrow} ${quote.label}`,
    color,
    description:
      `**${quote.price.toFixed(2)} €**  (${sign}${quote.change.toFixed(2)} / ${sign}${quote.changePercent.toFixed(2)}%)\n` +
      `\`${quote.ticker}\``,
  };

  const chartUrl = await buildChartUrl(aggregateByPeriod(fullHistory, period), period, trendUp);
  if (chartUrl) embed.image = { url: chartUrl };

  return embed;
}
