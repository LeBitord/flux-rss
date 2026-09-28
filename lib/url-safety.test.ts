import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isValidDiscordWebhookUrl } from "@/lib/url-safety";

describe("assertPublicHttpUrl", () => {
  it.each([
    "http://127.0.0.1/feed",
    "http://10.0.0.5/feed",
    "http://172.16.1.1/feed",
    "http://172.31.255.255/feed",
    "http://192.168.1.10/feed",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://localhost:3000/",
    "http://LOCALHOST/",
  ])("rejects private or local target %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });

  it.each(["file:///etc/passwd", "ftp://example.com/feed", "pas une url"])(
    "rejects non-http URL %s",
    async (url) => {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow();
    },
  );

  it.each(["http://8.8.8.8/feed", "https://172.32.0.1/feed", "https://[2606:4700::1111]/"])(
    "accepts public IP %s",
    async (url) => {
      await expect(assertPublicHttpUrl(url)).resolves.toBeUndefined();
    },
  );
});

describe("isValidDiscordWebhookUrl", () => {
  it("accepts Discord webhook URLs", () => {
    expect(isValidDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc-DEF_9")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDiscordWebhookUrl("https://evil.com/api/webhooks/123/abc")).toBe(false);
    expect(isValidDiscordWebhookUrl("http://discord.com/api/webhooks/123/abc")).toBe(false);
  });
});
