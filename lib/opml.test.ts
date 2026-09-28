import { describe, expect, it } from "vitest";
import { buildOpml, parseOpml } from "@/lib/opml";

describe("parseOpml", () => {
  it("reads feeds and the folder they sit in", () => {
    const xml = `<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="Tech" title="Tech">
          <outline type="rss" text="Next.js" xmlUrl="https://nextjs.org/feed.xml"/>
          <outline type="rss" title="Le Monde &amp; Co" text="ignored" xmlUrl='https://lemonde.fr/rss'/>
        </outline>
        <outline type="rss" text="Sans dossier" xmlUrl="https://example.com/rss"/>
      </body></opml>`;
    expect(parseOpml(xml)).toEqual([
      { title: "Next.js", xmlUrl: "https://nextjs.org/feed.xml", group: "Tech" },
      { title: "Le Monde & Co", xmlUrl: "https://lemonde.fr/rss", group: "Tech" },
      { title: "Sans dossier", xmlUrl: "https://example.com/rss", group: null },
    ]);
  });

  it("uses the nearest folder for nested folders", () => {
    const xml = `<opml><body><outline text="Sport"><outline text="Rugby">
      <outline xmlUrl="https://a.fr/rss" text="A"/></outline>
      <outline xmlUrl="https://b.fr/rss" text="B"/></outline></body></opml>`;
    expect(parseOpml(xml).map((f) => f.group)).toEqual(["Rugby", "Sport"]);
  });

  it("drops duplicate URLs and outlines without xmlUrl", () => {
    const xml = `<opml><body>
      <outline xmlUrl="https://a.fr/rss" text="A"/>
      <outline xmlUrl="https://a.fr/rss" text="A bis"/>
      <outline text="Lien" htmlUrl="https://a.fr"/>
    </body></opml>`;
    expect(parseOpml(xml)).toHaveLength(1);
  });

  it("returns nothing for non-OPML input", () => {
    expect(parseOpml("pas du xml")).toEqual([]);
  });
});

describe("buildOpml", () => {
  it("round-trips through parseOpml, escaping special characters", () => {
    const xml = buildOpml([
      { name: "Tech & IA", feeds: [{ name: 'Blog "dev"', url: "https://x.fr/rss?a=1&b=2" }] },
      { name: "Vide", feeds: [] },
    ]);
    expect(parseOpml(xml)).toEqual([
      { title: 'Blog "dev"', xmlUrl: "https://x.fr/rss?a=1&b=2", group: "Tech & IA" },
    ]);
    expect(xml).not.toContain("Vide");
  });
});
