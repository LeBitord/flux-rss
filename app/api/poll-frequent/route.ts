import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed } from "@/lib/types";
import { cronHandler } from "@/lib/cron-runs";
import { collectNewItems, scoreAndSendDigests, sendFailureAlert } from "@/lib/news-poll";

export const maxDuration = 300;

// Daytime news-only pass for categories flagged frequent_polling: same digests as the
// morning /api/poll, but no stock quotes, briefing, feed-health checks or purge — those
// stay once a day. Items posted here are marked seen, so the next morning's briefing
// only covers what arrived after the last pass.
export const GET = cronHandler("poll-frequent", async () => {
  const db = supabaseAdmin();
  const { data: categories, error: catError } = await db
    .from("categories")
    .select("*")
    .eq("frequent_polling", true);
  if (catError) return Response.json({ error: catError.message }, { status: 500 });

  const categoryList = (categories ?? []) as Category[];
  if (categoryList.length === 0) return Response.json({ feedsPolled: 0, digestsSent: 0 });

  const { data: feeds, error: feedError } = await db
    .from("feeds")
    .select("*")
    .eq("active", true)
    .in(
      "category_id",
      categoryList.map((c) => c.id),
    );
  if (feedError) return Response.json({ error: feedError.message }, { status: 500 });

  const feedList = (feeds ?? []) as Feed[];
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));

  const { newItemsByCategory, errors } = await collectNewItems(db, feedList);
  const digests = await scoreAndSendDigests(db, newItemsByCategory, categoryById);
  errors.push(...digests.errors);

  await sendFailureAlert(errors);

  return Response.json({
    feedsPolled: feedList.length,
    digestsSent: digests.digestsSent,
    newItems: [...newItemsByCategory.values()].reduce((sum, v) => sum + v.length, 0),
    errors,
  });
});
