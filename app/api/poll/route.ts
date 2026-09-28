import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed, StockPosition } from "@/lib/types";
import { generateBriefingSummary } from "@/lib/briefing";
import { sendBotMessage, type DiscordEmbed } from "@/lib/discord-bot";
import { getStockQuotesWithHistory, formatStockLine } from "@/lib/stocks";
import {
  buildStockEmbed,
  buildPortfolioTotalEmbed,
  holdingFromPosition,
  type HoldingInfo,
} from "@/lib/stock-embed";
import { cronHandler } from "@/lib/cron-runs";
import { collectNewItems, scoreAndSendDigests, sendFailureAlert } from "@/lib/news-poll";

export const maxDuration = 300;

const UNHEALTHY_ERROR_STREAK = 3;
const UNHEALTHY_SILENCE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days without a single new item
const HEALTH_ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-alert on the same feed at most weekly
const AUTO_DISABLE_ERROR_STREAK = 10;
const AUTO_DISABLE_SILENCE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days without a single new item
// seen_items older than this are purged. Only dated rows: once published_at is past the
// 7-day freshness filter the item can never be notified again, so its guid is no longer
// needed for dedup. Undated rows are kept forever — dropping them would re-notify any
// undated item still sitting in its feed.
const SEEN_ITEMS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

async function sendStockDigest(
  category: Category,
  embeds: DiscordEmbed[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!category.discord_channel_id) {
    return { ok: false, error: "Aucun salon Discord (discord_channel_id) configuré" };
  }
  return sendBotMessage(category.discord_channel_id, {
    content: `**${category.name}** — cours du jour`,
    embeds,
  });
}

async function sendFeedHealthAlert(feeds: Feed[]) {
  const webhookUrl = process.env.ALERTS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl || feeds.length === 0) return;

  const lines = feeds.map((feed) => {
    const reason =
      feed.consecutive_errors >= UNHEALTHY_ERROR_STREAK
        ? `${feed.consecutive_errors} échecs consécutifs`
        : "aucun nouvel article depuis 14+ jours";
    return `• **${feed.name}** — ${reason}`;
  });
  const content =
    `🩺 **Flux RSS — ${feeds.length} flux à vérifier**\n` +
    lines.join("\n") +
    "\nSource probablement cassée ou tarie — à corriger ou désactiver dans l'admin.";

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });
  } catch (err) {
    console.error("Failed to send feed health alert:", err);
  }
}

async function sendFeedDisabledAlert(feeds: Feed[]) {
  const webhookUrl = process.env.ALERTS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl || feeds.length === 0) return;

  const lines = feeds.map((feed) => {
    const reason =
      feed.consecutive_errors >= AUTO_DISABLE_ERROR_STREAK
        ? `${feed.consecutive_errors} échecs consécutifs`
        : "aucun nouvel article depuis 30+ jours";
    return `• **${feed.name}** — ${reason}`;
  });
  const content =
    `🔌 **Flux RSS — ${feeds.length} flux désactivé(s) automatiquement**\n` +
    lines.join("\n") +
    "\nRéactivable dans l'admin si la source revient.";

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });
  } catch (err) {
    console.error("Failed to send feed disabled alert:", err);
  }
}

export const GET = cronHandler("poll", async () => {
  const db = supabaseAdmin();

  const [
    { data: categories, error: catError },
    { data: feeds, error: feedError },
    { data: positions, error: positionError },
  ] = await Promise.all([
    db.from("categories").select("*"),
    db.from("feeds").select("*").eq("active", true),
    db.from("stock_positions").select("*"),
  ]);

  if (catError || feedError || positionError) {
    return Response.json(
      { error: catError?.message ?? feedError?.message ?? positionError?.message },
      { status: 500 },
    );
  }

  const categoryList = (categories ?? []) as Category[];
  const feedList = (feeds ?? []) as Feed[];
  const positionList = (positions ?? []) as StockPosition[];
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));

  const { newItemsByCategory, errors } = await collectNewItems(db, feedList);

  // Group tracked positions by category — each gets its own chart-embed message,
  // independent of whether a news digest also fires for that category today.
  const positionsByCategory = new Map<string, StockPosition[]>();
  for (const position of positionList) {
    const bucket = positionsByCategory.get(position.category_id) ?? [];
    bucket.push(position);
    positionsByCategory.set(position.category_id, bucket);
  }

  const stockEmbedsByCategory = new Map<string, DiscordEmbed[]>();
  const allStockLines: string[] = [];
  for (const [categoryId, positionsInCategory] of positionsByCategory) {
    try {
      const holdingByTicker = new Map<string, HoldingInfo>(
        positionsInCategory.map((p) => [p.ticker, holdingFromPosition(p)]),
      );
      const results = await getStockQuotesWithHistory(
        positionsInCategory.map((p) => ({ ticker: p.ticker, label: p.label })),
      );
      if (results.length === 0) continue;

      allStockLines.push(...results.map((r) => formatStockLine(r.quote)));

      // Feeds the weekly position summary — no extra API calls, just persisting today's
      // close from the daily series already fetched above.
      await db
        .from("stock_price_history")
        .upsert(
          results.map(({ quote }) => ({
            ticker: quote.ticker,
            trade_date: quote.latestTradingDay,
            price: quote.price,
          })),
          { onConflict: "ticker,trade_date", ignoreDuplicates: true },
        );

      const embeds = await Promise.all(
        results.map(({ quote, history }) =>
          buildStockEmbed(quote, history, "month", holdingByTicker.get(quote.ticker) ?? null),
        ),
      );
      const totalEmbed = buildPortfolioTotalEmbed(
        results.map(({ quote }) => ({
          quote,
          holding: holdingByTicker.get(quote.ticker) ?? null,
        })),
      );
      if (totalEmbed) embeds.push(totalEmbed);
      stockEmbedsByCategory.set(categoryId, embeds);
    } catch (err) {
      errors.push({
        feed: "cours de bourse",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const digests = await scoreAndSendDigests(db, newItemsByCategory, categoryById);
  errors.push(...digests.errors);
  const { digestsSent } = digests;

  // Always its own message — a chart per position, independent of whether news fired.
  for (const [categoryId, embeds] of stockEmbedsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;
    const result = await sendStockDigest(category, embeds);
    if (!result.ok) {
      errors.push({ feed: `cours ${category.name}`, error: result.error });
    }
  }

  const briefingChannelId = process.env.BRIEFING_DISCORD_CHANNEL_ID;
  if (briefingChannelId) {
    const briefingCategories = [...newItemsByCategory.entries()]
      .map(([categoryId, items]) => {
        const category = categoryById.get(categoryId);
        return category
          ? {
              name: category.name,
              items: items.map((i) => ({
                title: i.title,
                description: i.description,
                score: i.score,
              })),
            }
          : null;
      })
      .filter((c) => c !== null);

    const sections = await generateBriefingSummary(briefingCategories);
    if (sections && sections.length > 0) {
      const dateLabel = new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const fields = sections.map((s) => ({
        name: s.category.slice(0, 256),
        value: s.summary.slice(0, 1024),
      }));
      if (allStockLines.length > 0) {
        fields.push({ name: "💰 Cours du jour", value: allStockLines.join("\n").slice(0, 1024) });
      }
      const result = await sendBotMessage(briefingChannelId, {
        embeds: [
          {
            title: `🗞️ Briefing du ${dateLabel}`,
            color: 0x5865f2,
            fields,
          },
        ],
      });
      if (!result.ok) {
        errors.push({ feed: "briefing", error: result.error });
      }
    }
  }

  await sendFailureAlert(errors);

  // Re-fetch feed health fields fresh — they were updated in-loop above, so feedList is stale.
  const { data: healthFeeds } = await db
    .from("feeds")
    .select("*")
    .eq("active", true);
  const now = Date.now();
  const activeHealthFeeds = (healthFeeds ?? []) as Feed[];

  // Well past the "please check this" threshold — deactivate outright instead of
  // alerting forever about a source that's been broken or silent for a month.
  const toDisable = activeHealthFeeds.filter((feed) => {
    const errorsExceeded = feed.consecutive_errors >= AUTO_DISABLE_ERROR_STREAK;
    const tooYoungToJudge = now - new Date(feed.created_at).getTime() < AUTO_DISABLE_SILENCE_MS;
    const silent =
      !tooYoungToJudge &&
      (!feed.last_new_item_at ||
        now - new Date(feed.last_new_item_at).getTime() > AUTO_DISABLE_SILENCE_MS);
    return errorsExceeded || silent;
  });

  if (toDisable.length > 0) {
    await db
      .from("feeds")
      .update({ active: false })
      .in(
        "id",
        toDisable.map((f) => f.id),
      );
    await sendFeedDisabledAlert(toDisable);
  }

  const disabledIds = new Set(toDisable.map((f) => f.id));
  const unhealthyFeeds = activeHealthFeeds.filter((feed) => {
    if (disabledIds.has(feed.id)) return false; // already handled above, don't double-alert
    const errorsExceeded = feed.consecutive_errors >= UNHEALTHY_ERROR_STREAK;
    // Grace period: a feed younger than the silence window hasn't had a fair chance yet.
    const tooYoungToJudge = now - new Date(feed.created_at).getTime() < UNHEALTHY_SILENCE_MS;
    const silent =
      !tooYoungToJudge &&
      (!feed.last_new_item_at ||
        now - new Date(feed.last_new_item_at).getTime() > UNHEALTHY_SILENCE_MS);
    const recentlyAlerted =
      feed.last_health_alert_at &&
      now - new Date(feed.last_health_alert_at).getTime() < HEALTH_ALERT_COOLDOWN_MS;
    return (errorsExceeded || silent) && !recentlyAlerted;
  });

  if (unhealthyFeeds.length > 0) {
    await sendFeedHealthAlert(unhealthyFeeds);
    await db
      .from("feeds")
      .update({ last_health_alert_at: new Date().toISOString() })
      .in(
        "id",
        unhealthyFeeds.map((f) => f.id),
      );
  }

  const purgeCutoff = new Date(now - SEEN_ITEMS_RETENTION_MS).toISOString();
  const { count: purgedItems, error: purgeError } = await db
    .from("seen_items")
    .delete({ count: "exact" })
    .lt("published_at", purgeCutoff);
  if (purgeError) console.error("seen_items purge failed:", purgeError.message);

  return Response.json({
    feedsPolled: feedList.length,
    digestsSent,
    newItems: [...newItemsByCategory.values()].reduce((sum, v) => sum + v.length, 0),
    purgedItems: purgedItems ?? 0,
    errors,
  });
});
