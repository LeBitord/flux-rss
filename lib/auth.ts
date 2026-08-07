import { createHmac, timingSafeEqual, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { supabaseAdmin } from "@/lib/supabase-admin";

const scryptAsync = promisify(scrypt);

const COOKIE_NAME = "flux_rss_session";

function expectedToken(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");
  return createHmac("sha256", secret).update("admin-session").digest("hex");
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = expectedToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
  const { error } = await supabaseAdmin()
    .from("admin_settings")
    .upsert({ id: 1, password_hash, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
}

export { COOKIE_NAME, expectedToken };
