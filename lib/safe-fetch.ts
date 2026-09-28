import { assertPublicHttpUrl } from "@/lib/url-safety";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

// Fetches a user-supplied URL server-side. Redirects are followed by hand so every hop
// goes through the SSRF check, not just the first URL.
export async function safeFetchText(
  url: string,
): Promise<{ text: string; contentType: string; finalUrl: string }> {
  await assertPublicHttpUrl(url);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; flux-rss/1.0)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirection ${res.status} sans destination`);
      current = new URL(location, current).toString();
      await assertPublicHttpUrl(current);
      continue;
    }
    if (!res.ok) throw new Error(`La page a répondu ${res.status}`);
    const text = await res.text();
    return {
      text: text.slice(0, MAX_BYTES),
      contentType: res.headers.get("content-type") ?? "",
      finalUrl: current,
    };
  }
  throw new Error("Trop de redirections");
}
