import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const LOOKBACK_DAYS = 30;

export default async function StatsPage() {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: categories }, { data: feeds }, { data: items }, { data: feedback }] =
    await Promise.all([
      db.from("categories").select("*").order("name"),
      db.from("feeds").select("*"),
      db.from("seen_items").select("feed_id, score").gte("seen_at", since),
      db.from("feedback_log").select("category_id, direction").gte("created_at", since),
    ]);

  const categoryList = (categories ?? []) as Category[];
  const feedList = (feeds ?? []) as Feed[];
  const feedById = new Map(feedList.map((f) => [f.id, f]));

  const articlesByCategory = new Map<string, number>();
  const scoreAggByCategory = new Map<string, { sum: number; count: number }>();
  const countByFeed = new Map<string, number>();

  for (const item of items ?? []) {
    const feedId = item.feed_id as string;
    const feed = feedById.get(feedId);
    countByFeed.set(feedId, (countByFeed.get(feedId) ?? 0) + 1);
    if (!feed) continue;

    articlesByCategory.set(
      feed.category_id,
      (articlesByCategory.get(feed.category_id) ?? 0) + 1,
    );

    const score = item.score as number | null;
    if (score != null) {
      const agg = scoreAggByCategory.get(feed.category_id) ?? { sum: 0, count: 0 };
      agg.sum += score;
      agg.count += 1;
      scoreAggByCategory.set(feed.category_id, agg);
    }
  }

  const feedbackByCategory = new Map<string, { up: number; down: number }>();
  for (const row of feedback ?? []) {
    const categoryId = row.category_id as string;
    const agg = feedbackByCategory.get(categoryId) ?? { up: 0, down: 0 };
    if (row.direction === "up") agg.up += 1;
    else agg.down += 1;
    feedbackByCategory.set(categoryId, agg);
  }

  const topFeeds = [...countByFeed.entries()]
    .map(([feedId, count]) => ({ feed: feedById.get(feedId), count }))
    .filter((x): x is { feed: Feed; count: number } => Boolean(x.feed))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const unhealthyFeeds = feedList.filter(
    (f) => f.active && (f.consecutive_errors >= 3 || !f.last_new_item_at),
  );

  return (
    <main className="mx-auto max-w-4xl w-full px-6 py-10 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Statistiques</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {LOOKBACK_DAYS} derniers jours
          </p>
        </div>
        <Link href="/admin">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" />
            Retour
          </Button>
        </Link>
      </header>

      {categoryList.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucune catégorie pour le moment.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {categoryList.map((category) => {
            const total = articlesByCategory.get(category.id) ?? 0;
            const scoreAgg = scoreAggByCategory.get(category.id);
            const avgScore =
              scoreAgg && scoreAgg.count > 0 ? (scoreAgg.sum / scoreAgg.count).toFixed(1) : "—";
            const fb = feedbackByCategory.get(category.id);

            return (
              <Card key={category.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                      aria-hidden
                    />
                    {category.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {total} article{total !== 1 ? "s" : ""} · score moyen {avgScore}
                  </p>
                  {fb && fb.up + fb.down > 0 && (
                    <p>
                      👍 {fb.up} · 👎 {fb.down}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flux les plus actifs</CardTitle>
        </CardHeader>
        <CardContent>
          {topFeeds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun article sur la période.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flux</TableHead>
                  <TableHead className="text-right">Articles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topFeeds.map(({ feed, count }) => (
                  <TableRow key={feed.id}>
                    <TableCell className="font-medium">{feed.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {unhealthyFeeds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Flux à surveiller</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flux</TableHead>
                  <TableHead>Raison</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unhealthyFeeds.map((feed) => (
                  <TableRow key={feed.id}>
                    <TableCell className="font-medium">{feed.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {feed.consecutive_errors >= 3
                        ? `${feed.consecutive_errors} échecs consécutifs`
                        : "aucun nouvel article récemment"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
