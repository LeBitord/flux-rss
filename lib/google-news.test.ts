import { describe, expect, it } from "vitest";
import { buildDecodeRequest, googleNewsArticleId, parseDecodeResponse } from "@/lib/google-news";

describe("googleNewsArticleId", () => {
  it("extracts the id from RSS and web article links", () => {
    expect(googleNewsArticleId("https://news.google.com/rss/articles/CBMiAbc-_1?oc=5")).toBe(
      "CBMiAbc-_1",
    );
    expect(googleNewsArticleId("https://news.google.com/articles/CBMiXyz")).toBe("CBMiXyz");
  });

  it("ignores other links", () => {
    expect(googleNewsArticleId("https://www.lemonde.fr/articles/123")).toBeNull();
    expect(googleNewsArticleId("pas une url")).toBeNull();
  });
});

describe("parseDecodeResponse", () => {
  it("reads the publisher URL out of the RPC response", () => {
    const body = `)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.lefigaro.fr/a-b?x=1\\",1]",null]]`;
    expect(parseDecodeResponse(body)).toBe("https://www.lefigaro.fr/a-b?x=1");
  });

  it("returns null for an unexpected response", () => {
    expect(parseDecodeResponse(`)]}'\n[["er",null]]`)).toBeNull();
  });
});

describe("buildDecodeRequest", () => {
  it("embeds id, timestamp and signature in the form body", () => {
    const decoded = decodeURIComponent(buildDecodeRequest("ID1", "123", "SIG").slice("f.req=".length));
    expect(decoded).toContain('\\"ID1\\",123,\\"SIG\\"');
    expect(JSON.parse(decoded)[0][0][0]).toBe("Fbv4je");
  });
});
