import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendBotMessage } from "@/lib/discord-bot";
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

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  for (const [categoryId, categoryPositions] of positionsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category?.discord_channel_id) continue;

    const lines: string[] = [];
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

      lines.push(
        formatWeeklyLine(position.label, position.ticker, latestRow.price, weekAgoRow.price),
      );
    }

    if (lines.length === 0) continue;

    const content = `📊 **${category.name}** — résumé hebdo\n${lines.join("\n")}`;
    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(result.error);
    }
  }

  return Response.json({ sent, errors });
}
