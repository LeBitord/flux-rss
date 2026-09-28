// Google News RSS links (news.google.com/rss/articles/<id>) don't redirect to the article:
// the page resolves it with JavaScript, and EU visitors first hit a cookie-consent page.
// This recovers the publisher URL the same way that page does — read the signature and
// timestamp embedded in the article page, then ask Google's internal "garturlreq" RPC.
// Undocumented and liable to change: every failure returns null so callers can fall back.

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  // Pre-accepts the consent screen that EU requests otherwise land on.
  Cookie: "SOCS=CAI; CONSENT=YES+",
};
const TIMEOUT_MS = 10_000;

export function googleNewsArticleId(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.hostname !== "news.google.com") return null;
    const match = url.pathname.match(/\/(?:rss\/)?articles\/([\w-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function buildDecodeRequest(id: string, timestamp: string, signature: string): string {
  const inner =
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],` +
    `"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${timestamp},"${signature}"]`;
  return "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]));
}

export function parseDecodeResponse(body: string): string | null {
  const match = body.match(/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/);
  return match ? match[1] : null;
}

export async function resolveGoogleNewsLink(link: string): Promise<string | null> {
  const id = googleNewsArticleId(link);
  if (!id) return null;
  try {
    const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await page.text();
    const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const timestamp = html.match(/data-n-a-ts="(\d+)"/)?.[1];
    if (!signature || !timestamp) return null;

    const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: buildDecodeRequest(id, timestamp, signature),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return parseDecodeResponse(await res.text());
  } catch (err) {
    console.error("Google News link resolution failed:", err);
    return null;
  }
}
