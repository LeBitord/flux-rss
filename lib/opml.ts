export type OpmlFeed = { title: string; xmlUrl: string; group: string | null };

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function encodeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[match[1].toLowerCase()] = decodeXml(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

// Walks <outline> tags with a stack instead of a full XML parser: a feed is an outline
// with xmlUrl, and its group is the nearest enclosing outline without one (a "folder",
// which is how every reader exports categories).
export function parseOpml(xml: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];
  const folders: (string | null)[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(/<outline\b([^>]*?)(\/?)>|<\/outline\s*>/gi)) {
    if (match[0].startsWith("</")) {
      folders.pop();
      continue;
    }
    const attrs = parseAttributes(match[1]);
    const selfClosing = match[2] === "/";
    const xmlUrl = attrs.xmlurl?.trim();

    if (xmlUrl) {
      if (!seen.has(xmlUrl)) {
        seen.add(xmlUrl);
        const group = [...folders].reverse().find((f) => f !== null) ?? null;
        feeds.push({ title: (attrs.title || attrs.text || xmlUrl).trim(), xmlUrl, group });
      }
      if (!selfClosing) folders.push(null); // a feed outline with children isn't a folder
    } else if (!selfClosing) {
      folders.push((attrs.title || attrs.text || "").trim() || null);
    }
  }
  return feeds;
}

export function buildOpml(
  categories: { name: string; feeds: { name: string; url: string }[] }[],
): string {
  const body = categories
    .filter((c) => c.feeds.length > 0)
    .map((c) => {
      const feeds = c.feeds
        .map(
          (f) =>
            `      <outline type="rss" text="${encodeXml(f.name)}" title="${encodeXml(f.name)}" xmlUrl="${encodeXml(f.url)}"/>`,
        )
        .join("\n");
      return `    <outline text="${encodeXml(c.name)}" title="${encodeXml(c.name)}">\n${feeds}\n    </outline>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<opml version="2.0">\n` +
    `  <head><title>Flux RSS</title><dateCreated>${new Date().toUTCString()}</dateCreated></head>\n` +
    `  <body>\n${body}\n  </body>\n` +
    `</opml>\n`
  );
}
