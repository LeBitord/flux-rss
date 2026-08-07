"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminSession, setPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { assertPublicHttpUrl, isValidDiscordWebhookUrl } from "@/lib/url-safety";

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
  const discordWebhookUrl = String(formData.get("discord_webhook_url") ?? "").trim();
  const color = String(formData.get("color") ?? "#5865F2").trim();

  if (!name || !discordWebhookUrl) {
    throw new Error("Nom et webhook Discord requis");
  }
  if (!isValidDiscordWebhookUrl(discordWebhookUrl)) {
    throw new Error("URL de webhook Discord invalide");
  }

  const { error } = await supabaseAdmin()
    .from("categories")
    .insert({ name, discord_webhook_url: discordWebhookUrl, color });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function updateCategory(formData: FormData) {
  await requireAdminSession();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const discordWebhookUrl = String(formData.get("discord_webhook_url") ?? "").trim();
  const color = String(formData.get("color") ?? "#5865F2").trim();

  if (!id || !name || !discordWebhookUrl) {
    throw new Error("Nom et webhook Discord requis");
  }
  if (!isValidDiscordWebhookUrl(discordWebhookUrl)) {
    throw new Error("URL de webhook Discord invalide");
  }

  const { error } = await supabaseAdmin()
    .from("categories")
    .update({ name, discord_webhook_url: discordWebhookUrl, color })
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
