import type { DiscordActionRow, DiscordButton } from "@/lib/discord-bot";

const BUTTONS_PER_ROW = 5; // Discord cap
const MAX_ROWS = 5; // Discord cap

function chunk<T>(list: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

// One 👍 and one 👎 per shown article, not just the 🔥 ones — otherwise the feedback loop
// only ever hears about articles the model already rated high and can't learn from what it
// under-rated. 👍 rows first then 👎 rows, 5 per row: 10 articles fit in 4 of the 5 rows.
export function buildFeedbackRows(seenItemIds: string[]): DiscordActionRow[] {
  const up = seenItemIds.map(
    (id, i) =>
      ({ type: 2, style: 3, label: `👍 ${i + 1}`, custom_id: `fb:up:${id}` }) satisfies DiscordButton,
  );
  const down = seenItemIds.map(
    (id, i) =>
      ({ type: 2, style: 4, label: `👎 ${i + 1}`, custom_id: `fb:down:${id}` }) satisfies DiscordButton,
  );
  return [...chunk(up, BUTTONS_PER_ROW), ...chunk(down, BUTTONS_PER_ROW)]
    .slice(0, MAX_ROWS)
    .map((components) => ({ type: 1, components }));
}
