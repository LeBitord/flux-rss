import Parser from "rss-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, Feed } from "@/lib/types";
import { assertPublicHttpUrl } from "@/lib/url-safety";
import { scoreRelevance } from "@/lib/relevance";
import { sendBotMessage, type DiscordEmbed } from "@/lib/discord-bot";
import { formatCompactList, layoutDigest } from "@/lib/digest-layout";
import { buildFeedbackRows, buildSummaryMenu } from "@/lib/feedback-buttons";
import {
  dedupeByTitle,
  extractDescription,
  isRecent,
  passesKeywordFilters,
} from "@/lib/feed-filters";

// The news half of a poll — fetch feeds, record new items, score and post digests —
// shared by the daily /api/poll and the extra daytime /api/poll-frequent passes.

export type NewItem = {
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

export type PollError = { feed: string; error: string };

const HIGH_RELEVANCE_THRESHOLD = 8;
const parser = new Parser({ timeout: 15000 });

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? 0x5865f2 : parsed;
}

function faviconUrl(feedUrl: string): string {
  const hostname = new URL(feedUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
}

async function sendCategoryDigest(
  category: Category,
  items: NewItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!category.discord_channel_id) {
    return { ok: false, error: "Aucun salon Discord (discord_channel_id) configuré" };
  }

  const color = hexToInt(category.color);
  const { featured, compact, belowThreshold } = layoutDigest(items, category.min_score);

  const embeds: DiscordEmbed[] = featured.map((item, i) => {
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
  if (compact.length > 0) {
    embeds.push({
      title: `➕ ${compact.length} autre(s) article(s)`,
      color,
      description: formatCompactList(compact),
    });
  }

  const components = buildFeedbackRows(featured.map((item) => item.seenItemId));
  // Discord allows 5 rows; the menu also covers the compact list, numbered ones first.
  if (components.length < 5) components.push(buildSummaryMenu([...featured, ...compact], featured.length));

  const minorNote =
    belowThreshold > 0 ? ` · ${belowThreshold} jugé(s) mineur(s) (note < ${category.min_score}), en bas` : "";
  const content =
    featured.length > 0
      ? `**${category.name}** — ${items.length} nouvel(le)(s) article(s)${minorNote}`
      : `**${category.name}** — rien de marquant, ${items.length} article(s) mineur(s)`;

  return sendBotMessage(category.discord_channel_id, { content, embeds, components });
}

// Fetches each feed, records unseen items in seen_items and returns the ones that pass
// the feed's keyword filters, grouped by category and de-duplicated across feeds.
export async function collectNewItems(
  db: SupabaseClient,
  feedList: Feed[],
): Promise<{ newItemsByCategory: Map<string, NewItem[]>; errors: PollError[] }> {
  const newItemsByCategory = new Map<string, NewItem[]>();
  const errors: PollError[] = [];

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

  for (const [categoryId, items] of newItemsByCategory) {
    newItemsByCategory.set(categoryId, dedupeByTitle(items));
  }
  return { newItemsByCategory, errors };
}

// Scores each category's new items (sorted best-first, so the best survive the embed cap),
// persists score + topics, and posts one digest per category. Mutates the items in place:
// the briefing reads their scores afterwards.
export async function scoreAndSendDigests(
  db: SupabaseClient,
  newItemsByCategory: Map<string, NewItem[]>,
  categoryById: Map<string, Category>,
): Promise<{ digestsSent: number; errors: PollError[] }> {
  const errors: PollError[] = [];
  let digestsSent = 0;
  for (const [categoryId, items] of newItemsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;

    // Score with a fast/cheap model and sort highest-first, so the best items get the
    // full embeds and the rest go to the compact list.
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
  return { digestsSent, errors };
}

export async function sendFailureAlert(errors: { feed: string; error: string }[]) {
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
