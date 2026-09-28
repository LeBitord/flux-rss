"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, setPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { assertPublicHttpUrl, isValidDiscordWebhookUrl } from "@/lib/url-safety";
import {
  computeHoldingFromTransactions,
  type PositionTransaction,
} from "@/lib/position-transactions";
import { searchTeams, sportEmoji } from "@/lib/sports";
import { parseOpml } from "@/lib/opml";
import { discoverFeed } from "@/lib/feed-discovery";
import { scoreRelevance } from "@/lib/relevance";

export type ChangePasswordState = { error?: string; success?: boolean };

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  await requireAdminSession();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Tous les champs sont requis." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Les deux nouveaux mots de passe ne correspondent pas." };
  }

  if (newPassword.length < 8) {
    return { error: "Le nouveau mot de passe doit faire au moins 8 caractères." };
  }

  if (!(await verifyPassword(currentPassword))) {
    return { error: "Mot de passe actuel incorrect." };
  }

  // Bumps session_version, invalidating every previously issued cookie (including any
  // leaked one) — then immediately re-issues a fresh cookie so this device stays logged in.
  await setPassword(newPassword);
  await setSessionCookie();

  return { success: true };
}

export async function createCategory(formData: FormData) {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  const discordChannelId = String(formData.get("discord_channel_id") ?? "").trim();
  const discordWebhookUrl = String(formData.get("discord_webhook_url") ?? "").trim();
  const color = String(formData.get("color") ?? "#5865F2").trim();
  const relevanceContext = String(formData.get("relevance_context") ?? "").trim();

  if (!name || !discordChannelId) {
    throw new Error("Nom et ID de salon Discord requis");
  }
  if (discordWebhookUrl && !isValidDiscordWebhookUrl(discordWebhookUrl)) {
    throw new Error("URL de webhook Discord invalide");
  }

  const { error } = await supabaseAdmin()
    .from("categories")
    .insert({
      name,
      discord_channel_id: discordChannelId,
      discord_webhook_url: discordWebhookUrl || null,
      color,
      relevance_context: relevanceContext || null,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function updateCategory(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const discordChannelId = String(formData.get("discord_channel_id") ?? "").trim();
  const discordWebhookUrl = String(formData.get("discord_webhook_url") ?? "").trim();
  const color = String(formData.get("color") ?? "#5865F2").trim();
  const relevanceContext = String(formData.get("relevance_context") ?? "").trim();
  const frequentPolling = formData.get("frequent_polling") === "on";

  if (!id || !name || !discordChannelId) {
    throw new Error("Nom et ID de salon Discord requis");
  }
  if (discordWebhookUrl && !isValidDiscordWebhookUrl(discordWebhookUrl)) {
    throw new Error("URL de webhook Discord invalide");
  }

  const { error } = await supabaseAdmin()
    .from("categories")
    .update({
      name,
      discord_channel_id: discordChannelId,
      discord_webhook_url: discordWebhookUrl || null,
      color,
      relevance_context: relevanceContext || null,
      frequent_polling: frequentPolling,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function deleteCategory(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id manquant");

  const { error } = await supabaseAdmin().from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function createFeed(formData: FormData) {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");
  const keywords = String(formData.get("keywords") ?? "").trim();

  if (!name || !url || !categoryId) {
    throw new Error("Nom, URL et catégorie requis");
  }
  await assertPublicHttpUrl(url);

  const { error } = await supabaseAdmin()
    .from("feeds")
    .insert({ name, url, category_id: categoryId, keywords: keywords || null });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function updateFeed(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const keywords = String(formData.get("keywords") ?? "").trim();

  if (!id || !name || !url) {
    throw new Error("Nom et URL requis");
  }
  await assertPublicHttpUrl(url);

  const { error } = await supabaseAdmin()
    .from("feeds")
    .update({ name, url, keywords: keywords || null })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function deleteFeed(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id manquant");

  const { error } = await supabaseAdmin().from("feeds").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function createPosition(formData: FormData) {
  await requireAdminSession();

  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "");

  if (!ticker || !label || !categoryId) {
    throw new Error("Ticker, libellé et catégorie requis");
  }

  const { error } = await supabaseAdmin()
    .from("stock_positions")
    .insert({ ticker, label, category_id: categoryId });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

// Empty field = no target. Accepts a comma as decimal separator (French keyboards).
function parseOptionalPrice(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const value = parseFloat(text);
  if (Number.isNaN(value) || value <= 0) throw new Error("Seuil de prix invalide");
  return value;
}

export async function updatePosition(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const label = String(formData.get("label") ?? "").trim();
  const targetAbove = parseOptionalPrice(formData.get("target_above"));
  const targetBelow = parseOptionalPrice(formData.get("target_below"));

  if (!id || !ticker || !label) {
    throw new Error("Ticker et libellé requis");
  }
  if (targetAbove !== null && targetBelow !== null && targetBelow >= targetAbove) {
    throw new Error("Le seuil bas doit être inférieur au seuil haut");
  }

  const { error } = await supabaseAdmin()
    .from("stock_positions")
    .update({ ticker, label, target_above: targetAbove, target_below: targetBelow })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function deletePosition(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id manquant");

  const { error } = await supabaseAdmin().from("stock_positions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

// Recomputes shares + PRU moyen for a position from its full transaction history and
// writes them back to stock_positions — the two fields are a cache, transactions are
// the source of truth, so this runs after every insert/delete below.
async function recomputeHolding(positionId: string) {
  const db = supabaseAdmin();
  const { data: transactions } = await db
    .from("position_transactions")
    .select("transaction_date, shares, price_per_share")
    .eq("position_id", positionId);

  const { shares, costBasis } = computeHoldingFromTransactions(
    (transactions ?? []) as PositionTransaction[],
  );

  const { error } = await db
    .from("stock_positions")
    .update({ shares: shares > 0 ? shares : null, cost_basis: costBasis })
    .eq("id", positionId);
  if (error) throw new Error(error.message);
}

export async function addTransaction(formData: FormData) {
  await requireAdminSession();

  const positionId = String(formData.get("position_id") ?? "");
  const transactionDate = String(formData.get("transaction_date") ?? "").trim();
  const type = String(formData.get("type") ?? "buy");
  const sharesRaw = String(formData.get("shares") ?? "").trim();
  const priceRaw = String(formData.get("price_per_share") ?? "").trim();

  const shares = parseFloat(sharesRaw);
  const price = parseFloat(priceRaw);

  if (!positionId || !transactionDate) {
    throw new Error("Position et date requises");
  }
  if (Number.isNaN(shares) || shares <= 0) {
    throw new Error("Nombre de parts invalide");
  }
  if (Number.isNaN(price) || price < 0 || (type === "dividend" && price === 0)) {
    throw new Error("Prix invalide");
  }

  const db = supabaseAdmin();

  if (type === "dividend") {
    // Entered like the broker statement shows it: shares held × dividend per share.
    const { error } = await db.from("position_dividends").insert({
      position_id: positionId,
      payment_date: transactionDate,
      amount: Math.round(shares * price * 100) / 100,
    });
    if (error) throw new Error(error.message);
    await recomputeDividends(positionId);
    revalidatePath("/admin");
    return;
  }

  const { error } = await db.from("position_transactions").insert({
    position_id: positionId,
    transaction_date: transactionDate,
    shares: type === "sell" ? -shares : shares,
    price_per_share: price,
  });
  if (error) throw new Error(error.message);

  await recomputeHolding(positionId);
  revalidatePath("/admin");
}

export async function deleteTransaction(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const positionId = String(formData.get("position_id") ?? "");
  if (!id || !positionId) throw new Error("id manquant");

  const db = supabaseAdmin();
  const { error } = await db.from("position_transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recomputeHolding(positionId);
  revalidatePath("/admin");
}

async function recomputeDividends(positionId: string) {
  const db = supabaseAdmin();
  const { data: dividends } = await db
    .from("position_dividends")
    .select("amount")
    .eq("position_id", positionId);
  const total = (dividends ?? []).reduce((sum, d) => sum + Number(d.amount), 0);
  const { error } = await db
    .from("stock_positions")
    .update({ dividends_total: Math.round(total * 100) / 100 })
    .eq("id", positionId);
  if (error) throw new Error(error.message);
}

export async function deleteDividend(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const positionId = String(formData.get("position_id") ?? "");
  if (!id || !positionId) throw new Error("id manquant");

  const { error } = await supabaseAdmin().from("position_dividends").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recomputeDividends(positionId);
  revalidatePath("/admin");
}

export async function toggleFeed(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) throw new Error("id manquant");

  const { error } = await supabaseAdmin()
    .from("feeds")
    .update({ active: !active })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

// Returns the error instead of throwing: Next.js hides thrown messages in production,
// and "team not found" is something the user needs to read.
export async function createTeam(formData: FormData): Promise<{ error?: string }> {
  await requireAdminSession();

  const categoryId = String(formData.get("category_id") ?? "");
  const query = String(formData.get("query") ?? "").trim();
  if (!categoryId || query.length < 2) return { error: "Nom d'équipe requis" };

  let matches;
  try {
    matches = await searchTeams(query);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (matches.length === 0) {
    return { error: `Aucune équipe « ${query} » sur TheSportsDB — essaie le nom officiel` };
  }
  // Exact name first (case-insensitive), otherwise TheSportsDB's best match.
  const team =
    matches.find((m) => m.name.toLowerCase() === query.toLowerCase()) ?? matches[0];

  const { error } = await supabaseAdmin().from("sports_teams").insert({
    category_id: categoryId,
    thesportsdb_id: team.id,
    name: team.name,
    emoji: sportEmoji(team.sport),
  });
  if (error) {
    return { error: error.code === "23505" ? `${team.name} est déjà suivie ici` : error.message };
  }

  revalidatePath("/admin");
  return {};
}

export async function deleteTeam(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id manquant");

  const { error } = await supabaseAdmin().from("sports_teams").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export type OpmlImportResult = {
  error?: string;
  imported?: number;
  alreadyThere?: number;
  rejected?: string[];
};

const MAX_OPML_BYTES = 1_000_000;

// Feeds in an OPML folder named like an existing category go there; the rest go to the
// category picked in the dialog. Existing URLs are skipped, never overwritten.
export async function importOpml(formData: FormData): Promise<OpmlImportResult> {
  await requireAdminSession();

  const defaultCategoryId = String(formData.get("category_id") ?? "");
  const file = formData.get("file");
  if (!defaultCategoryId) return { error: "Choisis une catégorie par défaut" };
  if (!(file instanceof File) || file.size === 0) return { error: "Choisis un fichier OPML" };
  if (file.size > MAX_OPML_BYTES) return { error: "Fichier trop gros (1 Mo max)" };

  const parsed = parseOpml(await file.text());
  if (parsed.length === 0) return { error: "Aucun flux trouvé dans ce fichier" };

  const db = supabaseAdmin();
  const { data: categories } = await db.from("categories").select("id, name");
  const categoryIdByName = new Map(
    (categories ?? []).map((c) => [(c.name as string).toLowerCase(), c.id as string]),
  );

  const checks = await Promise.allSettled(parsed.map((f) => assertPublicHttpUrl(f.xmlUrl)));
  const rejected = parsed.filter((_, i) => checks[i].status === "rejected").map((f) => f.title);
  const rows = parsed
    .filter((_, i) => checks[i].status === "fulfilled")
    .map((f) => ({
      name: f.title.slice(0, 200),
      url: f.xmlUrl,
      category_id:
        (f.group && categoryIdByName.get(f.group.toLowerCase())) || defaultCategoryId,
    }));

  let imported = 0;
  if (rows.length > 0) {
    const { data: inserted, error } = await db
      .from("feeds")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id");
    if (error) return { error: error.message };
    imported = inserted?.length ?? 0;
  }

  revalidatePath("/admin");
  return { imported, alreadyThere: rows.length - imported, rejected };
}

export type FeedInspection =
  | {
      ok: true;
      feedUrl: string;
      title: string | null;
      items: { title: string; score: number }[];
      averageScore: number | null;
      alternatives: string[];
    }
  | { ok: false; error: string };

// Finds the feed behind a site URL and scores its latest items against the category's
// relevance context — a preview of what the feed would bring before adding it.
export async function inspectFeed(url: string, categoryId: string): Promise<FeedInspection> {
  await requireAdminSession();

  let discovered;
  try {
    discovered = await discoverFeed(url.trim());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const { data: category } = await supabaseAdmin()
    .from("categories")
    .select("name, relevance_context")
    .eq("id", categoryId)
    .maybeSingle();

  const scores = category
    ? await scoreRelevance(category.name, category.relevance_context, discovered.items)
    : discovered.items.map(() => ({ score: 5, topics: [] }));
  const items = discovered.items.map((item, i) => ({ title: item.title, score: scores[i].score }));
  const averageScore =
    items.length > 0 ? items.reduce((sum, item) => sum + item.score, 0) / items.length : null;

  return {
    ok: true,
    feedUrl: discovered.feedUrl,
    title: discovered.title,
    items,
    averageScore,
    alternatives: discovered.alternatives,
  };
}
