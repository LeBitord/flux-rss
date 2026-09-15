import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendBotMessage } from "@/lib/discord-bot";
import type { Category, Feed } from "@/lib/types";

export const maxDuration = 30;

const LOOKBACK_DAYS = 7;
const TOP_N = 15;
const HIGH_RELEVANCE_THRESHOLD = 8;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const destinationChannel = process.env.BRIEFING_DISCORD_CHANNEL_ID;
  if (!destinationChannel) {
    return Response.json({ ok: false, reason: "BRIEFING_DISCORD_CHANNEL_ID not configured" });
  }

  const db = supabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: categories }, { data: feeds }, { data: items }] = await Promise.all([
    db.from("categories").select("*"),
    db.from("feeds").select("*"),
    db
      .from("seen_items")
      .select("title, link, score, feed_id")
      .gte("seen_at", since)
      .not("score", "is", null)
      .not("title", "is", null)
      .order("score", { ascending: false })
      .limit(TOP_N),
  ]);

  const feedById = new Map(((feeds ?? []) as Feed[]).map((f) => [f.id, f]));
  const categoryById = new Map(((categories ?? []) as Category[]).map((c) => [c.id, c]));

  const lines = (items ?? [])
    .map((item, i) => {
      const feed = feedById.get(item.feed_id as string);
      const category = feed ? categoryById.get(feed.category_id) : undefined;
      const isFire = (item.score ?? 0) >= HIGH_RELEVANCE_THRESHOLD;
      const prefix = isFire ? `🔥 ${i + 1}.` : `${i + 1}.`;
      const label = category ? ` _(${category.name})_` : "";
      return `${prefix} [${item.title}](${item.link}) — ${item.score}/10${label}`;
    });

  if (lines.length === 0) {
    return Response.json({ ok: true, sent: false, reason: "no scored items this week" });
  }

  const result = await sendBotMessage(destinationChannel, {
    embeds: [
      {
        title: "🏆 Le meilleur de la semaine, tous sujets",
        color: 0x5865f2,
        description: lines.join("\n").slice(0, 4096),
      },
    ],
  });

  return Response.json({ ok: result.ok, sent: result.ok, error: result.ok ? undefined : result.error });
}
