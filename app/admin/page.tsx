import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Category, Feed, StockPosition } from "@/lib/types";
import { CategoryCard } from "./CategoryCard";
import { NewCategoryDialog } from "./NewCategoryDialog";
import { LogoutButton } from "./LogoutButton";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

export default async function AdminPage() {
  const db = supabaseAdmin();

  const [{ data: categories }, { data: feeds }, { data: positions }] = await Promise.all([
    db.from("categories").select("*").order("name"),
    db.from("feeds").select("*").order("name"),
    db.from("stock_positions").select("*").order("label"),
  ]);

  const categoryList = (categories ?? []) as Category[];
  const feedList = (feeds ?? []) as Feed[];
  const positionList = (positions ?? []) as StockPosition[];
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

      <div className="flex justify-end">
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
            />
          ))}
        </div>
      )}
    </main>
  );
}
