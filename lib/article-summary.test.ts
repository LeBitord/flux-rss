import { describe, expect, it } from "vitest";
import { extractArticleText } from "@/lib/article-summary";

describe("extractArticleText", () => {
  it("prefers the <article> element and drops page chrome", () => {
    const html = `<html><head><title>Mon titre</title><style>.a{}</style></head><body>
      <nav>Accueil Sport Tech</nav>
      <article><h1>Gros titre</h1><p>Premier paragraphe.</p><script>track()</script><p>Second &amp; dernier.</p></article>
      <footer>Mentions légales</footer></body></html>`;
    const { title, text } = extractArticleText(html);
    expect(title).toBe("Mon titre");
    expect(text).toContain("Premier paragraphe.");
    expect(text).toContain("Second & dernier.");
    expect(text).not.toMatch(/Accueil|Mentions|track\(\)/);
  });

  it("falls back to the whole body when there is no <article>", () => {
    const { title, text } = extractArticleText("<body><p>Juste du texte</p></body>");
    expect(title).toBeNull();
    expect(text).toBe("Juste du texte");
  });
});
