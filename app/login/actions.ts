"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, setSessionCookie, verifyPassword } from "@/lib/auth";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  getClientIp,
  recordFailedLoginAttempt,
} from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/admin");

  const ip = await getClientIp();
  const rateLimit = await checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return {
      error: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.`,
    };
  }

  if (!password || !(await verifyPassword(password))) {
    await recordFailedLoginAttempt(ip);
    return { error: "Mot de passe incorrect." };
  }

  await clearLoginAttempts(ip);
  await setSessionCookie();

  redirect(redirectTo.startsWith("/") ? redirectTo : "/admin");
}

export async function logout() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  redirect("/login");
}
