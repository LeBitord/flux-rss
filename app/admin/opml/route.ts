import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession } from "@/lib/auth";
import { buildOpml } from "@/lib/opml";
import type { Category, Feed } from "@/lib/types";

// Already behind the /admin proxy; checked again here since a route handler returns data
// directly rather than rendering a page.
export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = supabaseAdmin();
  const [{ data: categories }, { data: feeds }] = await Promise.all([
    db.from("categories").select("*").order("name"),
    db.from("feeds").select("*").order("name"),
  ]);
  const feedList = (feeds ?? []) as Feed[];

  const xml = buildOpml(
    ((categories ?? []) as Category[]).map((c) => ({
      name: c.name,
      feeds: feedList.filter((f) => f.category_id === c.id).map((f) => ({ name: f.name, url: f.url })),
    })),
  );

  const date = new Date().toISOString().slice(0, 10);
  return new Response(xml, {
    headers: {
      "Content-Type": "text/x-opml; charset=utf-8",
      "Content-Disposition": `attachment; filename="flux-rss-${date}.opml"`,
    },
  });
}
