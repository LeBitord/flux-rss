import Parser from "rss-parser";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed } from "@/lib/types";

export const maxDuration = 300;

type NewItem = {
  title: string;
  link: string;
  feedName: string;
  imageUrl?: string;
  publishedAt?: string;
};

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

function matchesKeywords(
  item: { title?: string; contentSnippet?: string; content?: string },
  keywords: string | null,
): boolean {
  if (!keywords) return true;
  const terms = keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = `${item.title ?? ""} ${item.contentSnippet ?? item.content ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

async function sendDiscordEmbeds(webhookUrl: string, category: Category, items: NewItem[]) {
  const color = hexToInt(category.color);
  const shown = items.slice(0, MAX_EMBEDS_PER_MESSAGE);
  const overflow = items.length - shown.length;

  const embeds = shown.map((item) => ({
    title: item.title.slice(0, 256),
    url: item.link,
    color,
    footer: { text: item.feedName },
    timestamp: item.publishedAt,
    thumbnail: item.imageUrl ? { url: item.imageUrl } : undefined,
  }));

  const content =
    `**${category.name}** — ${items.length} nouvel(le)(s) article(s)` +
    (overflow > 0 ? `\n…et ${overflow} autre(s) non affiché(s).` : "");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, embeds }),
  });

  if (!res.ok) {
    console.error(`Discord webhook failed for ${category.name}: ${res.status}`);
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = supabaseAdmin();

  const [{ data: categories, error: catError }, { data: feeds, error: feedError }] =
    await Promise.all([
      db.from("categories").select("*"),
      db.from("feeds").select("*").eq("active", true),
    ]);

  if (catError || feedError) {
    return Response.json(
      { error: catError?.message ?? feedError?.message },
      { status: 500 },
    );
  }

  const categoryList = (categories ?? []) as Category[];
  const feedList = (feeds ?? []) as Feed[];
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));

  const newItemsByCategory = new Map<string, NewItem[]>();
  const errors: { feed: string; error: string }[] = [];

  for (const feed of feedList) {
    try {
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
      }));

      // Upsert + ignoreDuplicates avoids a huge "already seen?" lookup query (which can
      // fail silently for feeds with very long guids, e.g. Google News) — PostgREST only
      // returns the rows that were actually newly inserted.
      const { data: inserted, error: insertError } = await db
        .from("seen_items")
        .upsert(rowsToInsert, { onConflict: "feed_id,guid", ignoreDuplicates: true })
        .select("guid");

      if (insertError) {
        errors.push({ feed: feed.name, error: insertError.message });
        continue;
      }

      const insertedGuids = new Set((inserted ?? []).map((row) => row.guid as string));
      const fresh = dedup.filter((item) =>
        insertedGuids.has(item.guid ?? item.link ?? item.title ?? ""),
      );

      if (fresh.length === 0) continue;

      // All fresh items are recorded as seen above regardless of the keyword filter below —
      // only whether they trigger a Discord notification depends on matching the feed's keywords.
      const notify = fresh.filter((item) => matchesKeywords(item, feed.keywords));
      if (notify.length === 0) continue;

      const bucket = newItemsByCategory.get(feed.category_id) ?? [];
      for (const item of notify) {
        bucket.push({
          title: item.title ?? "(sans titre)",
          link: item.link ?? feed.url,
          feedName: feed.name,
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

  let digestsSent = 0;
  for (const [categoryId, items] of newItemsByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;
    await sendDiscordEmbeds(category.discord_webhook_url, category, items);
    digestsSent += 1;
  }

  return Response.json({
    feedsPolled: feedList.length,
    digestsSent,
    newItems: [...newItemsByCategory.values()].reduce((sum, v) => sum + v.length, 0),
    errors,
  });
}
