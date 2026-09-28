import { supabaseAdmin } from "@/lib/supabase-admin";
import { cronHandler } from "@/lib/cron-runs";
import { sendBotMessage } from "@/lib/discord-bot";
import { getStockQuoteWithHistory } from "@/lib/stocks";
import { changeSince, formatPercent, getBenchmarkConfig, portfolioChange } from "@/lib/benchmark";
import type { Category, StockPosition } from "@/lib/types";

export const maxDuration = 60;

const LOOKBACK_DAYS = 7;

function formatWeeklyLine(label: string, ticker: string, latest: number, weekAgo: number): string {
  const change = latest - weekAgo;
  const changePercent = (change / weekAgo) * 100;
  const arrow = change >= 0 ? "⬆️" : "⬇️";
  const sign = change >= 0 ? "+" : "";
  return (
    `${arrow} **${label} (${ticker})** : ${latest.toFixed(2)} € ` +
    `(${sign}${change.toFixed(2)} / ${sign}${changePercent.toFixed(2)}% sur 7 jours)`
  );
}

export const GET = cronHandler("weekly-recap", async () => {
  const db = supabaseAdmin();
  const [{ data: categories }, { data: positions }] = await Promise.all([
    db.from("categories").select("*"),
    db.from("stock_positions").select("*"),
  ]);

  const categoryById = new Map(((categories ?? []) as Category[]).map((c) => [c.id, c]));
  const positionList = (positions ?? []) as StockPosition[];

  const positionsByCategory = new Map<string, StockPosition[]>();
  for (const position of positionList) {
    const bucket = positionsByCategory.get(position.category_id) ?? [];
    bucket.push(position);
    positionsByCategory.set(position.category_id, bucket);
  }

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let sent = 0;
  const errors: string[] = [];

  // Fetched live rather than from stock_price_history, which only holds tracked positions.
  const benchmark = getBenchmarkConfig();
  let benchmarkChange: number | null = null;
  if (benchmark && positionList.length > 0) {
    const result = await getStockQuoteWithHistory(benchmark.ticker, benchmark.label);
    benchmarkChange = result ? changeSince(result.history, cutoff) : null;
  }

  for (const [categoryId, categoryPositions] of positionsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category?.discord_channel_id) continue;

    const lines: string[] = [];
    const weekly: { shares: number | null; latest: number; weekAgo: number }[] = [];
    for (const position of categoryPositions) {
      const [{ data: latestRow }, { data: weekAgoRow }] = await Promise.all([
        db
          .from("stock_price_history")
          .select("price")
          .eq("ticker", position.ticker)
          .order("trade_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("stock_price_history")
          .select("price")
          .eq("ticker", position.ticker)
          .lte("trade_date", cutoff)
          .order("trade_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!latestRow || !weekAgoRow) {
        lines.push(`◽ **${position.label} (${position.ticker})** : historique insuffisant`);
        continue;
      }

      weekly.push({
        shares: position.shares,
        latest: Number(latestRow.price),
        weekAgo: Number(weekAgoRow.price),
      });
      lines.push(
        formatWeeklyLine(position.label, position.ticker, latestRow.price, weekAgoRow.price),
      );
    }

    if (lines.length === 0) continue;

    const portfolio = portfolioChange(weekly);
    if (portfolio !== null && weekly.length > 1) {
      lines.push(`\n📐 **Ensemble des positions** : ${formatPercent(portfolio)} sur 7 jours`);
    }
    if (portfolio !== null && benchmarkChange !== null && benchmark) {
      const diff = portfolio - benchmarkChange;
      lines.push(
        `🌍 **${benchmark.label}** : ${formatPercent(benchmarkChange)} — ` +
          `${diff >= 0 ? "devant" : "derrière"} l'indice de ${Math.abs(diff).toFixed(2)} pt`,
      );
    }

    const content = `📊 **${category.name}** — résumé hebdo\n${lines.join("\n")}`;
    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(result.error);
    }
  }

  return Response.json({ sent, errors });
});
