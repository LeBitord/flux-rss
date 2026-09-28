import type { DiscordActionRow, DiscordButton, DiscordSelectMenu } from "@/lib/discord-bot";

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

export const SUMMARY_MENU_ID = "sum";
const MENU_LABEL_MAX = 100; // Discord cap on select option labels

// A select menu in the last free row: pick an article, get its summary — same as /resume
// without copying the link.
export function buildSummaryMenu(items: { seenItemId: string; title: string }[]): DiscordActionRow {
  const menu: DiscordSelectMenu = {
    type: 3,
    custom_id: SUMMARY_MENU_ID,
    placeholder: "📝 Résumer un article…",
    options: items.map((item, i) => ({
      label: `${i + 1}. ${item.title}`.slice(0, MENU_LABEL_MAX),
      value: item.seenItemId,
    })),
  };
  return { type: 1, components: [menu] };
}

// Re-renders the digest's buttons after a vote: the chosen button keeps its colour and
// gets a check mark, the other button of the same article turns grey. Everything else
// (other articles, the summary menu) is returned untouched.
export function markVote(
  rows: DiscordActionRow[],
  seenItemId: string,
  direction: "up" | "down",
): DiscordActionRow[] {
  return rows.map((row) => ({
    ...row,
    components: row.components.map((component) => {
      if (component.type !== 2) return component;
      const [prefix, dir, id] = component.custom_id.split(":");
      if (prefix !== "fb" || id !== seenItemId) return component;
      const baseLabel = component.label.replace(/ ✓$/, "");
      return dir === direction
        ? { ...component, style: dir === "up" ? 3 : 4, label: `${baseLabel} ✓` }
        : { ...component, style: 2, label: baseLabel };
    }),
  }));
}
