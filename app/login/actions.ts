"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, setSessionCookie, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/admin");

  if (!password || !(await verifyPassword(password))) {
    return { error: "Mot de passe incorrect." };
  }

  await setSessionCookie();

  redirect(redirectTo.startsWith("/") ? redirectTo : "/admin");
}

export async function logout() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  redirect("/login");
}
