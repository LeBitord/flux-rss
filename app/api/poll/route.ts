import Parser from "rss-parser";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed, StockPosition } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-safety";
import { scoreRelevance } from "@/lib/relevance";
import { generateBriefingSummary } from "@/lib/briefing";
import {
  sendBotMessage,
  type DiscordActionRow,
  type DiscordButton,
  type DiscordEmbed,
} from "@/lib/discord-bot";
import { getStockQuotesWithHistory, formatStockLine } from "@/lib/stocks";
import { buildStockEmbed, buildPortfolioTotalEmbed, type HoldingInfo } from "@/lib/stock-embed";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;

type NewItem = {
  seenItemId: string;
  title: string;
  link: string;
  feedName: string;
  feedIconUrl: string;
  description?: string;
  imageUrl?: string;
  publishedAt?: string;
  score?: number;
  topics?: string[];
};

const HIGH_RELEVANCE_THRESHOLD = 8;
const MAX_FEEDBACK_BUTTONS = 5; // Discord caps messages at 5 action rows; one row per fire article.
const UNHEALTHY_ERROR_STREAK = 3;
const UNHEALTHY_SILENCE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days without a single new item
const HEALTH_ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-alert on the same feed at most weekly
const AUTO_DISABLE_ERROR_STREAK = 10;
const AUTO_DISABLE_SILENCE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days without a single new item

const parser = new Parser({ timeout: 15000 });
const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(item: { isoDate?: string; pubDate?: string }): boolean {
  const dateStr = item.isoDate ?? item.pubDate;
  if (!dateStr) return true; // no date to judge by — don't silently drop it
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return true;
  return Date.now() - time <= MAX_ITEM_AGE_MS;
}

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? 0x5865f2 : parsed;
}

function faviconUrl(feedUrl: string): string {
  const hostname = new URL(feedUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
}

// Google News' own contentSnippet is just the title repeated (plus the source name) —
// not a real summary. Detect and drop that case; keep it for feeds with genuine content.
function extractDescription(item: { title?: string; contentSnippet?: string }): string | undefined {
  const snippet = item.contentSnippet?.trim();
  if (!snippet) return undefined;
  const title = item.title?.trim() ?? "";
  if (title && snippet.startsWith(title.slice(0, Math.min(30, title.length)))) return undefined;
  return snippet.length > 200 ? `${snippet.slice(0, 200)}…` : snippet;
}

const DUPLICATE_TITLE_THRESHOLD = 0.6;

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2), // drop tiny/stopword-ish tokens
  );
}

function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Different feeds in the same category often relay the same story (e.g. L'Équipe +
// Google News on the same match) — collapse near-identical titles, keeping the first seen.
function dedupeByTitle(items: NewItem[]): NewItem[] {
  const kept: NewItem[] = [];
  const keptTokens: Set<string>[] = [];
  for (const item of items) {
    const tokens = titleTokens(item.title);
    const isDuplicate = keptTokens.some(
      (k) => titleSimilarity(k, tokens) >= DUPLICATE_TITLE_THRESHOLD,
    );
    if (!isDuplicate) {
      kept.push(item);
      keptTokens.push(tokens);
    }
  }
  return kept;
}

function parseTerms(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

function passesKeywordFilters(
  item: { title?: string; contentSnippet?: string; content?: string },
  keywords: string | null,
  excludeKeywords: string | null,
): boolean {
  const haystack = `${item.title ?? ""} ${item.contentSnippet ?? item.content ?? ""}`.toLowerCase();

  const excludeTerms = parseTerms(excludeKeywords);
  if (excludeTerms.some((term) => haystack.includes(term))) return false;

  const includeTerms = parseTerms(keywords);
  if (includeTerms.length === 0) return true;
  return includeTerms.some((term) => haystack.includes(term));
}

async function sendCategoryDigest(
  category: Category,
  items: NewItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!category.discord_channel_id) {
    return { ok: false, error: "Aucun salon Discord (discord_channel_id) configuré" };
  }

  const color = hexToInt(category.color);
  const shown = items.slice(0, MAX_EMBEDS_PER_MESSAGE);
  const overflow = items.length - shown.length;

  const embeds = shown.map((item, i) => {
    const isFire = (item.score ?? 0) >= HIGH_RELEVANCE_THRESHOLD;
    const prefix = isFire ? `🔥 ${i + 1}.` : `${i + 1}.`;
    return {
      title: `${prefix} ${item.title}`.slice(0, 256),
      url: item.link,
      color,
      description: item.description,
      author: { name: item.feedName, icon_url: item.feedIconUrl },
      timestamp: item.publishedAt,
      thumbnail: item.imageUrl ? { url: item.imageUrl } : undefined,
    };
  });

  const fireItems = shown
    .map((item, i) => ({ item, position: i + 1 }))
    .filter(({ item }) => (item.score ?? 0) >= HIGH_RELEVANCE_THRESHOLD)
    .slice(0, MAX_FEEDBACK_BUTTONS);

  const components: DiscordActionRow[] = fireItems.map(({ item, position }) => ({
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: `👍 #${position}`,
        custom_id: `fb:up:${item.seenItemId}`,
      } satisfies DiscordButton,
      {
        type: 2,
        style: 4,
        label: `👎 #${position}`,
        custom_id: `fb:down:${item.seenItemId}`,
      } satisfies DiscordButton,
    ],
  }));

  const content =
    `**${category.name}** — ${items.length} nouvel(le)(s) article(s)` +
    (overflow > 0 ? `\n…et ${overflow} autre(s) non affiché(s).` : "");

  return sendBotMessage(category.discord_channel_id, { content, embeds, components });
}

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

async function sendFailureAlert(errors: { feed: string; error: string }[]) {
  const webhookUrl = process.env.ALERTS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl || errors.length === 0) return;

  const lines = errors.slice(0, 15).map((e) => `• **${e.feed}** — ${e.error}`);
  const overflow = errors.length - 15;
  const content =
    `⚠️ **Flux RSS — ${errors.length} erreur(s) lors du dernier passage**\n` +
    lines.join("\n") +
    (overflow > 0 ? `\n…et ${overflow} autre(s).` : "");

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });
  } catch (err) {
    console.error("Failed to send failure alert:", err);
  }
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

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  const newItemsByCategory = new Map<string, NewItem[]>();
  const errors: { feed: string; error: string }[] = [];

  for (const feed of feedList) {
    try {
      await assertPublicHttpUrl(feed.url);
      const parsed = await parser.parseURL(feed.url);

      // Reached as soon as the feed is fetched/parsed successfully — a feed that's merely
      // quiet (no items today) still counts as healthy, only fetch/parse failures don't.
      await db
        .from("feeds")
        .update({ consecutive_errors: 0, last_success_at: new Date().toISOString() })
        .eq("id", feed.id);

      const items = parsed.items ?? [];
      if (items.length === 0) continue;

      const byGuid = new Map<string, (typeof items)[number]>();
      for (const item of items) {
        const guid = item.guid ?? item.link ?? item.title ?? "";
        if (guid && !byGuid.has(guid) && isRecent(item)) byGuid.set(guid, item);
      }
      const dedup = [...byGuid.values()];
      if (dedup.length === 0) continue;

      const rowsToInsert = dedup.map((item) => ({
        feed_id: feed.id,
        guid: item.guid ?? item.link ?? item.title ?? "",
        published_at: item.isoDate ?? item.pubDate ?? null,
        title: item.title ?? null,
        link: item.link ?? null,
      }));

      // Upsert + ignoreDuplicates avoids a huge "already seen?" lookup query (which can
      // fail silently for feeds with very long guids, e.g. Google News) — PostgREST only
      // returns the rows that were actually newly inserted.
      const { data: inserted, error: insertError } = await db
        .from("seen_items")
        .upsert(rowsToInsert, { onConflict: "feed_id,guid", ignoreDuplicates: true })
        .select("id, guid");

      if (insertError) {
        errors.push({ feed: feed.name, error: insertError.message });
        continue;
      }

      const insertedIdByGuid = new Map(
        (inserted ?? []).map((row) => [row.guid as string, row.id as string]),
      );
      const fresh = dedup
        .map((item) => ({
          item,
          seenItemId: insertedIdByGuid.get(item.guid ?? item.link ?? item.title ?? ""),
        }))
        .filter((x): x is { item: (typeof dedup)[number]; seenItemId: string } =>
          Boolean(x.seenItemId),
        );

      if (fresh.length === 0) continue;

      await db
        .from("feeds")
        .update({ last_new_item_at: new Date().toISOString() })
        .eq("id", feed.id);

      // All fresh items are recorded as seen above regardless of the keyword filters below —
      // only whether they trigger a Discord notification depends on matching them.
      const notify = fresh.filter(({ item }) =>
        passesKeywordFilters(item, feed.keywords, feed.exclude_keywords),
      );
      if (notify.length === 0) continue;

      const bucket = newItemsByCategory.get(feed.category_id) ?? [];
      for (const { item, seenItemId } of notify) {
        bucket.push({
          seenItemId,
          title: item.title ?? "(sans titre)",
          link: item.link ?? feed.url,
          feedName: feed.name,
          feedIconUrl: faviconUrl(feed.url),
          description: extractDescription(item),
          imageUrl: item.enclosure?.url,
          publishedAt: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined),
        });
      }
      newItemsByCategory.set(feed.category_id, bucket);
    } catch (err) {
      errors.push({
        feed: feed.name,
        error: err instanceof Error ? err.message : String(err),
      });
      await db
        .from("feeds")
        .update({ consecutive_errors: feed.consecutive_errors + 1 })
        .eq("id", feed.id);
    }
  }

  for (const [categoryId, items] of newItemsByCategory) {
    newItemsByCategory.set(categoryId, dedupeByTitle(items));
  }

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
        positionsInCategory.map((p) => [
          p.ticker,
          { shares: p.shares, costBasis: p.cost_basis, purchaseDate: p.purchase_date },
        ]),
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

  let digestsSent = 0;
  for (const [categoryId, items] of newItemsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;

    // Score with a fast/cheap model and sort highest-first, so if there are more
    // items than MAX_EMBEDS_PER_MESSAGE, the most important ones are the ones kept.
    const results = await scoreRelevance(category.name, category.relevance_context, items);
    items.forEach((item, i) => {
      item.score = results[i].score;
      item.topics = results[i].topics;
    });
    items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // Persist extracted topics + score: topics feed the feedback buttons on click,
    // score feeds /recap and future feed-health checks.
    await Promise.all(
      items.map((item) =>
        db
          .from("seen_items")
          .update({
            topics: item.topics && item.topics.length > 0 ? item.topics.join(", ") : null,
            score: item.score ?? null,
          })
          .eq("id", item.seenItemId),
      ),
    );

    const result = await sendCategoryDigest(category, items);
    if (!result.ok) {
      errors.push({ feed: `catégorie ${category.name}`, error: result.error });
      continue;
    }
    digestsSent += 1;
  }

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

  return Response.json({
    feedsPolled: feedList.length,
    digestsSent,
    newItems: [...newItemsByCategory.values()].reduce((sum, v) => sum + v.length, 0),
    errors,
  });
}
