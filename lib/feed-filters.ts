export const MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DUPLICATE_TITLE_THRESHOLD = 0.6;

export function isRecent(
  item: { isoDate?: string; pubDate?: string },
  now: number = Date.now(),
): boolean {
  const dateStr = item.isoDate ?? item.pubDate;
  if (!dateStr) return true; // no date to judge by — don't silently drop it
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return true;
  return now - time <= MAX_ITEM_AGE_MS;
}

// Google News' own contentSnippet is just the title repeated (plus the source name) —
// not a real summary. Detect and drop that case; keep it for feeds with genuine content.
export function extractDescription(item: {
  title?: string;
  contentSnippet?: string;
}): string | undefined {
  const snippet = item.contentSnippet?.trim();
  if (!snippet) return undefined;
  const title = item.title?.trim() ?? "";
  if (title && snippet.startsWith(title.slice(0, Math.min(30, title.length)))) return undefined;
  return snippet.length > 200 ? `${snippet.slice(0, 200)}…` : snippet;
}

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2), // drop tiny/stopword-ish tokens
  );
}

export function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Different feeds in the same category often relay the same story (e.g. L'Équipe +
// Google News on the same match) — collapse near-identical titles, keeping the first seen.
export function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
  const kept: T[] = [];
  const keptTokens: Set<string>[] = [];
  for (const item of items) {
    const tokens = titleTokens(item.title);
    const isDuplicate = keptTokens.some(
      (k) => titleSimilarity(k, tokens) >= DUPLICATE_TITLE_THRESHOLD,
    );
    if (!isDuplicate) {
      kept.push(item);
      keptTokens.push(tokens);
    }
  }
  return kept;
}

export function parseTerms(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export function passesKeywordFilters(
  item: { title?: string; contentSnippet?: string; content?: string },
  keywords: string | null,
  excludeKeywords: string | null,
): boolean {
  const haystack = `${item.title ?? ""} ${item.contentSnippet ?? item.content ?? ""}`.toLowerCase();

  const excludeTerms = parseTerms(excludeKeywords);
  if (excludeTerms.some((term) => haystack.includes(term))) return false;

  const includeTerms = parseTerms(keywords);
  if (includeTerms.length === 0) return true;
  return includeTerms.some((term) => haystack.includes(term));
}

export function mergeKeywords(existing: string | null, additions: string[]): string {
  const current = (existing ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const merged = new Set(current.map((k) => k.toLowerCase()));
  const result = [...current];
  for (const term of additions) {
    const trimmed = term.trim();
    if (trimmed && !merged.has(trimmed.toLowerCase())) {
      merged.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return result.join(", ");
}
