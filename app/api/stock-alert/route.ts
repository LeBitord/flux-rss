import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getStockQuotes } from "@/lib/stocks";
import { sendBotMessage } from "@/lib/discord-bot";
import type { Category, Feed } from "@/lib/types";

export const maxDuration = 60;

const DEFAULT_THRESHOLD_PERCENT = 3;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const threshold = parseFloat(
    process.env.STOCK_ALERT_THRESHOLD_PERCENT ?? String(DEFAULT_THRESHOLD_PERCENT),
  );

  const db = supabaseAdmin();
  const [{ data: categories }, { data: feeds }] = await Promise.all([
    db.from("categories").select("*"),
    db.from("feeds").select("*").not("stock_ticker", "is", null),
  ]);

  const categoryById = new Map(((categories ?? []) as Category[]).map((c) => [c.id, c]));
  const feedList = (feeds ?? []) as Feed[];

  // First feed carrying a given ticker decides which channel gets the alert.
  const categoryByTicker = new Map<string, Category>();
  for (const feed of feedList) {
    if (!feed.stock_ticker || categoryByTicker.has(feed.stock_ticker)) continue;
    const category = categoryById.get(feed.category_id);
    if (category) categoryByTicker.set(feed.stock_ticker, category);
  }

  const tickers = [...categoryByTicker.keys()];
  if (tickers.length === 0) {
    return Response.json({ checked: 0, alertsSent: 0 });
  }

  const quotes = await getStockQuotes(tickers);
  const today = new Date().toISOString().slice(0, 10);

  let alertsSent = 0;
  for (const quote of quotes) {
    if (Math.abs(quote.changePercent) < threshold) continue;

    const category = categoryByTicker.get(quote.ticker);
    if (!category?.discord_channel_id) continue;

    const direction = quote.changePercent >= 0 ? "up" : "down";

    // Upsert + ignoreDuplicates: only the first crossing of the day for a given
    // ticker/direction actually inserts a row, so this doubles as the "already alerted?" check.
    const { data: inserted } = await db
      .from("stock_alerts_sent")
      .upsert(
        { ticker: quote.ticker, alert_date: today, direction },
        { onConflict: "ticker,alert_date,direction", ignoreDuplicates: true },
      )
      .select("ticker");

    if (!inserted || inserted.length === 0) continue; // already alerted today

    const arrow = direction === "up" ? "⬆️" : "⬇️";
    const sign = direction === "up" ? "+" : "";
    const content =
      `${arrow} **${quote.ticker}** vient de franchir ${sign}${quote.changePercent.toFixed(2)}% ` +
      `aujourd'hui — ${quote.price.toFixed(2)} € (${sign}${quote.change.toFixed(2)})`;

    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (result.ok) alertsSent += 1;
  }

  return Response.json({ checked: quotes.length, alertsSent });
}
