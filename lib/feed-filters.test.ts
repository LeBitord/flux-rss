import { describe, expect, it } from "vitest";
import {
  dedupeByTitle,
  extractDescription,
  isRecent,
  mergeKeywords,
  passesKeywordFilters,
  titleTokens,
} from "@/lib/feed-filters";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T12:00:00Z").getTime();

describe("isRecent", () => {
  it("keeps items published within 7 days", () => {
    expect(isRecent({ isoDate: new Date(NOW - 6 * DAY).toISOString() }, NOW)).toBe(true);
  });

  it("drops items older than 7 days", () => {
    expect(isRecent({ isoDate: new Date(NOW - 8 * DAY).toISOString() }, NOW)).toBe(false);
  });

  it("falls back to pubDate", () => {
    expect(isRecent({ pubDate: "Mon, 01 Sep 2026 10:00:00 GMT" }, NOW)).toBe(false);
  });

  it("keeps undated or unparseable items rather than dropping them", () => {
    expect(isRecent({}, NOW)).toBe(true);
    expect(isRecent({ pubDate: "pas une date" }, NOW)).toBe(true);
  });
});

describe("extractDescription", () => {
  it("drops Google News snippets that just repeat the title", () => {
    expect(
      extractDescription({
        title: "Le XV de France bat l'Irlande",
        contentSnippet: "Le XV de France bat l'Irlande  L'Équipe",
      }),
    ).toBeUndefined();
  });

  it("truncates long snippets to 200 chars", () => {
    const out = extractDescription({ title: "Titre", contentSnippet: "a".repeat(300) });
    expect(out).toBe(`${"a".repeat(200)}…`);
  });

  it("returns undefined for an empty snippet", () => {
    expect(extractDescription({ title: "Titre", contentSnippet: "   " })).toBeUndefined();
  });
});

describe("titleTokens", () => {
  it("lowercases, strips accents and punctuation, drops short words", () => {
    expect([...titleTokens("Clermont s'impose à Montpellier !")]).toEqual([
      "clermont",
      "impose",
      "montpellier",
    ]);
  });
});

describe("dedupeByTitle", () => {
  it("collapses near-identical titles, keeping the first", () => {
    const items = [
      { title: "L'ASM Clermont s'impose face au Stade Toulousain", id: 1 },
      { title: "ASM Clermont s'impose face au Stade Toulousain - L'Équipe", id: 2 },
      { title: "La Chorale Roanne perd à domicile", id: 3 },
    ];
    expect(dedupeByTitle(items).map((i) => i.id)).toEqual([1, 3]);
  });

  it("keeps distinct stories", () => {
    const items = [{ title: "Hausse du CAC 40" }, { title: "Résultats trimestriels de LVMH" }];
    expect(dedupeByTitle(items)).toHaveLength(2);
  });
});

describe("passesKeywordFilters", () => {
  const item = { title: "Nouvelle version de Next.js", contentSnippet: "Le framework React évolue" };

  it("accepts everything when no keywords are set", () => {
    expect(passesKeywordFilters(item, null, null)).toBe(true);
    expect(passesKeywordFilters(item, "", " , ")).toBe(true);
  });

  it("requires at least one include keyword, case-insensitively", () => {
    expect(passesKeywordFilters(item, "rust, NEXT.JS", null)).toBe(true);
    expect(passesKeywordFilters(item, "rust, go", null)).toBe(false);
  });

  it("lets exclude keywords win over include keywords", () => {
    expect(passesKeywordFilters(item, "next.js", "react")).toBe(false);
  });

  it("falls back to content when there is no snippet", () => {
    expect(passesKeywordFilters({ title: "Titre", content: "parle de Rust" }, "rust", null)).toBe(
      true,
    );
  });
});

describe("mergeKeywords", () => {
  it("appends new terms and skips case-insensitive duplicates", () => {
    expect(mergeKeywords("Rust, Go", ["go", "Zig", " "])).toBe("Rust, Go, Zig");
  });

  it("handles an empty starting list", () => {
    expect(mergeKeywords(null, ["IA"])).toBe("IA");
  });
});
