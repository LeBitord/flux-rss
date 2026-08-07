import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function checkLoginRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count } = await supabaseAdmin()
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("attempted_at", windowStart);

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMinutes: WINDOW_MINUTES };
  }
  return { allowed: true };
}

export async function recordFailedLoginAttempt(ip: string): Promise<void> {
  await supabaseAdmin().from("login_attempts").insert({ ip });

  // Opportunistic cleanup so the table doesn't grow unbounded — cheap enough to run
  // on every failed attempt given how infrequent those should be.
  const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  await supabaseAdmin().from("login_attempts").delete().lt("attempted_at", cutoff);
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  await supabaseAdmin().from("login_attempts").delete().eq("ip", ip);
}
