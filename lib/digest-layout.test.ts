import { describe, expect, it } from "vitest";
import { formatCompactList, layoutDigest } from "@/lib/digest-layout";

const items = (...scores: (number | undefined)[]) =>
  scores.map((score, i) => ({ id: i + 1, score }));
const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe("layoutDigest", () => {
  it("features everything when all items clear the bar and fit", () => {
    const result = layoutDigest(items(9, 7, 5), 4);
    expect(ids(result.featured)).toEqual([1, 2, 3]);
    expect(result.compact).toEqual([]);
  });

  it("moves items under the threshold to the compact list", () => {
    const result = layoutDigest(items(9, 6, 3, 1), 4);
    expect(ids(result.featured)).toEqual([1, 2]);
    expect(ids(result.compact)).toEqual([3, 4]);
    expect(result.belowThreshold).toBe(2);
  });

  it("treats unscored items as passing (a failed scoring call must not hide news)", () => {
    expect(ids(layoutDigest(items(undefined, undefined), 4).featured)).toEqual([1, 2]);
  });

  it("keeps 10 full embeds when nothing is compacted", () => {
    expect(layoutDigest(items(...Array(10).fill(8)), 4).featured).toHaveLength(10);
  });

  it("reserves a slot for the list on overflow, and lists the overflow first", () => {
    const result = layoutDigest(items(...Array(12).fill(8), 2), 4);
    expect(result.featured).toHaveLength(9);
    expect(ids(result.compact)).toEqual([10, 11, 12, 13]);
    expect(result.belowThreshold).toBe(1);
  });

  it("can feature nothing when every item is minor", () => {
    const result = layoutDigest(items(2, 1), 4);
    expect(result.featured).toEqual([]);
    expect(result.compact).toHaveLength(2);
  });
});

describe("formatCompactList", () => {
  it("formats linked lines with scores, stripping brackets from titles", () => {
    expect(formatCompactList([{ title: "Un [grand] titre", link: "https://a.fr", score: 3 }])).toBe(
      "• [Un grand titre](https://a.fr) · 3/10",
    );
  });

  it("stays under the length limit and says how many were cut", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      title: `Article numéro ${i} avec un titre assez long pour remplir`,
      link: `https://exemple.fr/articles/${i}`,
      score: 2,
    }));
    const text = formatCompactList(many, 1000);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toMatch(/…et \d+ autre\(s\)$/);
  });
});
