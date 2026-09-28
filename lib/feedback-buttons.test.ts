import { describe, expect, it } from "vitest";
import { buildFeedbackRows } from "@/lib/feedback-buttons";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i + 1}`);

describe("buildFeedbackRows", () => {
  it("fits 10 articles in 4 rows of 5 buttons", () => {
    const rows = buildFeedbackRows(ids(10));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.components.length === 5)).toBe(true);
  });

  it("puts 👍 rows before 👎 rows, numbered like the embeds", () => {
    const rows = buildFeedbackRows(ids(7));
    expect(rows.map((r) => r.components.map((b) => b.label))).toEqual([
      ["👍 1", "👍 2", "👍 3", "👍 4", "👍 5"],
      ["👍 6", "👍 7"],
      ["👎 1", "👎 2", "👎 3", "👎 4", "👎 5"],
      ["👎 6", "👎 7"],
    ]);
  });

  it("encodes direction and item id in custom_id", () => {
    const [upRow, downRow] = buildFeedbackRows(ids(3));
    expect(upRow.components.map((b) => b.custom_id)).toEqual([
      "fb:up:id1",
      "fb:up:id2",
      "fb:up:id3",
    ]);
    expect(downRow.components[2].custom_id).toBe("fb:down:id3");
  });

  it("returns no rows when nothing is shown", () => {
    expect(buildFeedbackRows([])).toEqual([]);
  });

  it("never exceeds Discord's 5-row cap", () => {
    expect(buildFeedbackRows(ids(15)).length).toBeLessThanOrEqual(5);
  });
});
