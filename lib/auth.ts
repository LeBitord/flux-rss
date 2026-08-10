import { createHmac, timingSafeEqual, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const scryptAsync = promisify(scrypt);

const COOKIE_NAME = "flux_rss_session";

async function getSessionVersion(): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("admin_settings")
    .select("session_version")
    .eq("id", 1)
    .maybeSingle();
  return data?.session_version ?? 0;
}

// Includes the current session_version so that changing the password (which bumps
// the version) invalidates every previously issued cookie, including leaked ones.
async function expectedToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  const version = await getSessionVersion();
  return createHmac("sha256", secret).update(`admin-session:${version}`).digest("hex");
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await expectedToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function setSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, await expectedToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function requireAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    throw new Error("Unauthorized");
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function compareHash(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

async function getStoredPasswordHash(): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("admin_settings")
    .select("password_hash")
    .eq("id", 1)
    .maybeSingle();
  return data?.password_hash ?? null;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const storedHash = await getStoredPasswordHash();

  if (storedHash) {
    return compareHash(password, storedHash);
  }

  const bootstrapPassword = process.env.ADMIN_PASSWORD;
  if (!bootstrapPassword) throw new Error("Missing ADMIN_PASSWORD");
  const a = Buffer.from(password);
  const b = Buffer.from(bootstrapPassword);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function setPassword(newPassword: string): Promise<void> {
  const password_hash = await hashPassword(newPassword);
  const version = await getSessionVersion();
  const { error } = await supabaseAdmin().from("admin_settings").upsert({
    id: 1,
    password_hash,
    session_version: version + 1,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}

export { COOKIE_NAME };
