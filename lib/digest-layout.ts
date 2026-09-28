export const MAX_EMBEDS_PER_MESSAGE = 10; // Discord cap
export const DEFAULT_MIN_SCORE = 4;

type Scored = { score?: number };

// Splits a category's new items (already sorted best-first) into the ones posted as full
// embeds and the rest, which go into one compact list embed at the bottom: items under
// the category's minimum score, plus any overflow past Discord's 10-embed cap. Low-rated
// items are listed rather than dropped so a wrong call by the model stays visible.
export function layoutDigest<T extends Scored>(
  items: T[],
  minScore: number,
): { featured: T[]; compact: T[]; belowThreshold: number } {
  const important = items.filter((item) => (item.score ?? minScore) >= minScore);
  const minor = items.filter((item) => (item.score ?? minScore) < minScore);

  if (minor.length === 0 && important.length <= MAX_EMBEDS_PER_MESSAGE) {
    return { featured: important, compact: [], belowThreshold: 0 };
  }
  // One embed slot is taken by the compact list.
  const featured = important.slice(0, MAX_EMBEDS_PER_MESSAGE - 1);
  return {
    featured,
    compact: [...important.slice(featured.length), ...minor],
    belowThreshold: minor.length,
  };
}

// "• [Titre](lien) · 3/10" lines, cut to fit Discord's 4096-char embed description.
export function formatCompactList(
  items: { title: string; link: string; score?: number }[],
  maxLength = 4096,
): string {
  const lines: string[] = [];
  let length = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = item.title.replace(/[[\]]/g, "").slice(0, 120);
    const line = `• [${title}](${item.link})${item.score != null ? ` · ${item.score}/10` : ""}`;
    const remaining = items.length - i;
    const suffix = `\n…et ${remaining} autre(s)`;
    if (length + line.length + 1 + suffix.length > maxLength) {
      lines.push(`…et ${remaining} autre(s)`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}
