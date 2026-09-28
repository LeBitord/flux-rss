import Parser from "rss-parser";
import { safeFetchText } from "@/lib/safe-fetch";

const FEED_TYPES = /application\/(rss|atom)\+xml|application\/feed\+json|text\/xml/i;
// Tried in order when the page doesn't advertise a feed in its <head>.
const COMMON_PATHS = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feed/"];
const PREVIEW_ITEMS = 8;

const parser = new Parser({ timeout: 10000 });

// <link rel="alternate" type="application/rss+xml" href="…"> — the standard way a site
// advertises its feed(s). Returns absolute URLs, in page order, without duplicates.
export function findFeedLinks(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    const type = tag.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!href || !/\balternate\b/i.test(rel) || !FEED_TYPES.test(type)) continue;
    try {
      const absolute = new URL(href.replace(/&amp;/g, "&"), baseUrl).toString();
      if (!urls.includes(absolute)) urls.push(absolute);
    } catch {
      // malformed href — skip
    }
  }
  return urls;
}

export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 1000).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:rdf");
}

export type DiscoveredFeed = {
  feedUrl: string;
  title: string | null;
  items: { title: string; description?: string }[];
  alternatives: string[];
};

async function parseFeedAt(url: string) {
  const { text, finalUrl } = await safeFetchText(url);
  if (!looksLikeFeed(text)) return null;
  return { feed: await parser.parseString(text), finalUrl };
}

function toDiscovered(
  feed: Awaited<ReturnType<typeof parser.parseString>>,
  feedUrl: string,
  alternatives: string[],
): DiscoveredFeed {
  return {
    feedUrl,
    title: feed.title?.trim() || null,
    items: (feed.items ?? []).slice(0, PREVIEW_ITEMS).map((item) => ({
      title: item.title?.trim() || "(sans titre)",
      description: item.contentSnippet?.slice(0, 200),
    })),
    alternatives,
  };
}

// Accepts either a feed URL or a plain site URL: a feed is used as is; for a page, the
// feeds it advertises are tried first, then the usual paths.
export async function discoverFeed(inputUrl: string): Promise<DiscoveredFeed> {
  const { text, finalUrl } = await safeFetchText(inputUrl);
  if (looksLikeFeed(text)) {
    return toDiscovered(await parser.parseString(text), finalUrl, []);
  }

  const advertised = findFeedLinks(text, finalUrl);
  const origin = new URL(finalUrl).origin;
  const guesses = COMMON_PATHS.map((p) => origin + p).filter((u) => !advertised.includes(u));

  for (const candidate of [...advertised, ...guesses]) {
    try {
      const parsed = await parseFeedAt(candidate);
      if (!parsed) continue;
      const others = advertised.filter((u) => u !== candidate);
      return toDiscovered(parsed.feed, parsed.finalUrl, others);
    } catch {
      // unreachable or not a feed — try the next candidate
    }
  }
  throw new Error("Aucun flux RSS/Atom trouvé sur ce site");
}
