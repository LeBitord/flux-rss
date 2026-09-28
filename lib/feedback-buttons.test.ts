import { describe, expect, it } from "vitest";
import { buildFeedbackRows, buildSummaryMenu, markVote } from "@/lib/feedback-buttons";
import type { DiscordButton, DiscordSelectMenu } from "@/lib/discord-bot";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i + 1}`);
const buttons = (rows: ReturnType<typeof buildFeedbackRows>) =>
  rows.map((r) => r.components as DiscordButton[]);

describe("buildFeedbackRows", () => {
  it("fits 10 articles in 2 rows of 5 👎 buttons, numbered like the embeds", () => {
    const rows = buttons(buildFeedbackRows(ids(7)));
    expect(rows.map((r) => r.map((b) => b.label))).toEqual([
      ["👎 1", "👎 2", "👎 3", "👎 4", "👎 5"],
      ["👎 6", "👎 7"],
    ]);
    expect(buildFeedbackRows(ids(10))).toHaveLength(2);
  });

  it("encodes direction and item id in custom_id", () => {
    expect(buttons(buildFeedbackRows(ids(2)))[0].map((b) => b.custom_id)).toEqual([
      "fb:down:id1",
      "fb:down:id2",
    ]);
  });

  it("returns no rows when nothing is shown", () => {
    expect(buildFeedbackRows([])).toEqual([]);
  });
});

describe("buildSummaryMenu", () => {
  it("lists articles numbered like the embeds, labels capped at 100 chars", () => {
    const row = buildSummaryMenu([
      { seenItemId: "a", title: "Court" },
      { seenItemId: "b", title: "x".repeat(200) },
    ]);
    const menu = row.components[0] as DiscordSelectMenu;
    expect(menu.custom_id).toBe("sum");
    expect(menu.options[0]).toEqual({ label: "1. Court", value: "a" });
    expect(menu.options[1].label).toHaveLength(100);
  });
});

describe("markVote", () => {
  // Older digests still carry 👍 buttons, so voting must handle both directions.
  const upRow = {
    type: 1 as const,
    components: ids(2).map((id, i) => ({ type: 2 as const, style: 3 as const, label: `👍 ${i + 1}`, custom_id: `fb:up:${id}` })),
  };
  const rows = [upRow, ...buildFeedbackRows(ids(2)), buildSummaryMenu([{ seenItemId: "id1", title: "A" }])];

  it("checks the chosen button and greys its counterpart", () => {
    const [up, down] = buttons(markVote(rows, "id1", "up"));
    expect(up[0]).toMatchObject({ label: "👍 1 ✓", style: 3 });
    expect(down[0]).toMatchObject({ label: "👎 1", style: 2 });
  });

  it("leaves other articles and the menu untouched", () => {
    const marked = markVote(rows, "id1", "up");
    expect(marked[0].components[1]).toEqual(rows[0].components[1]);
    expect(marked[2]).toEqual(rows[2]);
  });

  it("switches cleanly when the vote changes", () => {
    const [up, down] = buttons(markVote(markVote(rows, "id1", "up"), "id1", "down"));
    expect(up[0]).toMatchObject({ label: "👍 1", style: 2 });
    expect(down[0]).toMatchObject({ label: "👎 1 ✓", style: 4 });
  });
});
