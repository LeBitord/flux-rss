import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  Category,
  Feed,
  StockPosition,
  PositionTransactionRow,
  PositionDividendRow,
  SportsTeam,
} from "@/lib/types";
import { CategoryCard } from "./CategoryCard";
import { NewCategoryDialog } from "./NewCategoryDialog";
import { OpmlDialog } from "./OpmlDialog";
import { LogoutButton } from "./LogoutButton";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

// Data also changes outside the admin (Discord feedback, cron jobs), so never serve a
// copy prerendered at build time.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const db = supabaseAdmin();

  const [
    { data: categories },
    { data: feeds },
    { data: positions },
    { data: transactions },
    { data: dividends },
    { data: teams },
  ] = await Promise.all([
    db.from("categories").select("*").order("name"),
    db.from("feeds").select("*").order("name"),
    db.from("stock_positions").select("*").order("label"),
    db.from("position_transactions").select("*"),
    db.from("position_dividends").select("*"),
    db.from("sports_teams").select("*").order("name"),
  ]);

  const categoryList = (categories ?? []) as Category[];
  const feedList = (feeds ?? []) as Feed[];
  const positionList = (positions ?? []) as StockPosition[];
  const transactionList = (transactions ?? []) as PositionTransactionRow[];
  const feedsByCategory = new Map<string, Feed[]>();
  for (const feed of feedList) {
    const bucket = feedsByCategory.get(feed.category_id) ?? [];
    bucket.push(feed);
    feedsByCategory.set(feed.category_id, bucket);
  }
  const positionsByCategory = new Map<string, StockPosition[]>();
  for (const position of positionList) {
    const bucket = positionsByCategory.get(position.category_id) ?? [];
    bucket.push(position);
    positionsByCategory.set(position.category_id, bucket);
  }
  const teamsByCategory = new Map<string, SportsTeam[]>();
  for (const team of (teams ?? []) as SportsTeam[]) {
    const bucket = teamsByCategory.get(team.category_id) ?? [];
    bucket.push(team);
    teamsByCategory.set(team.category_id, bucket);
  }
  const dividendsByPosition = new Map<string, PositionDividendRow[]>();
  for (const dividend of (dividends ?? []) as PositionDividendRow[]) {
    const bucket = dividendsByPosition.get(dividend.position_id) ?? [];
    bucket.push(dividend);
    dividendsByPosition.set(dividend.position_id, bucket);
  }
  const transactionsByPosition = new Map<string, PositionTransactionRow[]>();
  for (const tx of transactionList) {
    const bucket = transactionsByPosition.get(tx.position_id) ?? [];
    bucket.push(tx);
    transactionsByPosition.set(tx.position_id, bucket);
  }

  return (
    <main className="mx-auto max-w-4xl w-full px-6 py-10 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Flux RSS — Administration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {categoryList.length} catégorie{categoryList.length > 1 ? "s" : ""} ·{" "}
            {feedList.length} flux surveillé{feedList.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin/stats">
            <Button variant="outline" size="sm">
              <BarChart3 className="size-4" />
              Stats
            </Button>
          </Link>
          <ChangePasswordDialog />
          <LogoutButton />
        </div>
      </header>

      <div className="flex justify-end gap-2">
        <OpmlDialog categories={categoryList.map((c) => ({ id: c.id, name: c.name }))} />
        <NewCategoryDialog />
      </div>

      {categoryList.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Aucune catégorie pour le moment. Créez-en une pour commencer à ajouter des flux.
        </div>
      ) : (
        <div className="space-y-6">
          {categoryList.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              feeds={feedsByCategory.get(category.id) ?? []}
              positions={positionsByCategory.get(category.id) ?? []}
              transactionsByPosition={transactionsByPosition}
              dividendsByPosition={dividendsByPosition}
              teams={teamsByCategory.get(category.id) ?? []}
            />
          ))}
        </div>
      )}
    </main>
  );
}
