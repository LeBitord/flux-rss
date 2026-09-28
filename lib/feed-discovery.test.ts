import { describe, expect, it } from "vitest";
import { findFeedLinks, looksLikeFeed } from "@/lib/feed-discovery";

describe("findFeedLinks", () => {
  it("finds advertised RSS and Atom feeds as absolute URLs", () => {
    const html = `<head>
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" type="application/rss+xml" title="Articles" href="/feed.xml">
      <link type="application/atom+xml" href="https://cdn.site.fr/atom?a=1&amp;b=2" rel="alternate">
      <link rel="alternate" hreflang="en" href="/en/">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    </head>`;
    expect(findFeedLinks(html, "https://site.fr/blog/")).toEqual([
      "https://site.fr/feed.xml",
      "https://cdn.site.fr/atom?a=1&b=2",
    ]);
  });

  it("returns nothing when no feed is advertised", () => {
    expect(findFeedLinks("<html><head></head></html>", "https://site.fr")).toEqual([]);
  });
});

describe("looksLikeFeed", () => {
  it("recognises RSS, Atom and RDF documents", () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss version="2.0">')).toBe(true);
    expect(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(looksLikeFeed("<rdf:RDF>")).toBe(true);
  });

  it("rejects HTML pages", () => {
    expect(looksLikeFeed("<!doctype html><html><head>")).toBe(false);
  });
});
