import Parser from "rss-parser";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed, StockPosition } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-safety";
import { scoreRelevance } from "@/lib/relevance";
import { sendBotMessage, type DiscordActionRow, type DiscordButton } from "@/lib/discord-bot";
import { getStockQuotes, formatStockLine } from "@/lib/stocks";
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
  stockLines: string[] = [],
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
    (stockLines.length > 0 ? `${stockLines.join("\n")}\n\n` : "") +
    `**${category.name}** — ${items.length} nouvel(le)(s) article(s)` +
    (overflow > 0 ? `\n…et ${overflow} autre(s) non affiché(s).` : "");

  return sendBotMessage(category.discord_channel_id, { content, embeds, components });
}

async function sendStandaloneStockMessage(
  category: Category,
  stockLines: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!category.discord_channel_id) {
    return { ok: false, error: "Aucun salon Discord (discord_channel_id) configuré" };
  }
  const content = `**${category.name}** — cours du jour\n${stockLines.join("\n")}`;
  return sendBotMessage(category.discord_channel_id, { content });
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
    }
  }

  // Group tracked positions by category, so a category's digest can be prefixed with the
  // day's prices — or, if no news fired, sent as a standalone message.
  const tickersByCategory = new Map<string, string[]>();
  for (const position of positionList) {
    const bucket = tickersByCategory.get(position.category_id) ?? [];
    bucket.push(position.ticker);
    tickersByCategory.set(position.category_id, bucket);
  }
  const stockLinesByCategory = new Map<string, string[]>();
  for (const [categoryId, tickers] of tickersByCategory) {
    try {
      const quotes = await getStockQuotes(tickers);
      if (quotes.length > 0) stockLinesByCategory.set(categoryId, quotes.map(formatStockLine));
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

    const stockLines = stockLinesByCategory.get(categoryId) ?? [];
    const result = await sendCategoryDigest(category, items, stockLines);
    if (!result.ok) {
      errors.push({ feed: `catégorie ${category.name}`, error: result.error });
      continue;
    }
    digestsSent += 1;
    stockLinesByCategory.delete(categoryId); // included in the digest above — skip the standalone send
  }

  // Categories with tickers but no news digest today still get their prices.
  for (const [categoryId, stockLines] of stockLinesByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;
    const result = await sendStandaloneStockMessage(category, stockLines);
    if (!result.ok) {
      errors.push({ feed: `cours ${category.name}`, error: result.error });
    }
  }

  await sendFailureAlert(errors);

  return Response.json({
    feedsPolled: feedList.length,
    digestsSent,
    newItems: [...newItemsByCategory.values()].reduce((sum, v) => sum + v.length, 0),
    errors,
  });
}
