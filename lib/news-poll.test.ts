import { beforeEach, describe, expect, it, vi } from "vitest";

const sendBotMessage = vi.fn();
vi.mock("@/lib/discord-bot", () => ({ sendBotMessage: (...args: unknown[]) => sendBotMessage(...args) }));
vi.mock("@/lib/relevance", () => ({ scoreRelevance: vi.fn() }));

const { sendCategoryDigest } = await import("@/lib/news-poll");

const category = {
  id: "c", name: "basket", discord_webhook_url: "", discord_channel_id: "123", color: "#ff0000",
  relevance_context: null, last_relevance_suggestion_at: null, pending_relevance_suggestion: null,
  frequent_polling: false, min_score: 4, created_at: "",
};
const items = Array.from({ length: 12 }, (_, i) => ({
  seenItemId: `id${i}`, title: `Article [${i}]`, link: `https://a.fr/${i}`, feedName: "L'Équipe",
  feedIconUrl: "https://icon", imageUrl: "https://img", score: i < 10 ? 8 : 2,
}));
const tooLarge = { ok: false, error: 'Discord a répondu 413: {"message": "Request entity too large", "code": 40005}' };

describe("sendCategoryDigest", () => {
  beforeEach(() => sendBotMessage.mockReset());

  it("sends the full digest once when Discord accepts it", async () => {
    sendBotMessage.mockResolvedValue({ ok: true });
    expect(await sendCategoryDigest(category, items)).toEqual({ ok: true });
    expect(sendBotMessage).toHaveBeenCalledTimes(1);
    expect(sendBotMessage.mock.calls[0][1].embeds).toHaveLength(10);
  });

  it("retries without images and compact list after a 413", async () => {
    sendBotMessage.mockResolvedValueOnce(tooLarge).mockResolvedValueOnce({ ok: true });
    expect(await sendCategoryDigest(category, items)).toEqual({ ok: true });
    const lighter = sendBotMessage.mock.calls[1][1];
    expect(lighter.embeds).toHaveLength(9);
    expect(lighter.embeds.every((e: { thumbnail?: unknown }) => e.thumbnail === undefined)).toBe(true);
  });

  it("falls back to plain links, and reports sizes if everything fails", async () => {
    sendBotMessage.mockResolvedValue(tooLarge);
    const result = await sendCategoryDigest(category, items);
    const plain = sendBotMessage.mock.calls[2][1];
    expect(plain.embeds).toBeUndefined();
    expect(plain.content).toContain("1. [Article 0](<https://a.fr/0>)");
    expect(plain.content.length).toBeLessThanOrEqual(2000);
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/octets, 10 encadrés/);
  });

  it("does not retry other errors", async () => {
    sendBotMessage.mockResolvedValue({ ok: false, error: "Discord a répondu 403: Missing Access" });
    await sendCategoryDigest(category, items);
    expect(sendBotMessage).toHaveBeenCalledTimes(1);
  });
});
