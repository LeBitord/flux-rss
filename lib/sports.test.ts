import { describe, expect, it } from "vitest";
import { nextPendingEventId, pickLastMatch, type SportEvent } from "@/lib/sports";

const ev = (id: string, date: string, score?: [string, string]): SportEvent => ({
  id,
  date,
  time: null,
  homeTeam: "A",
  awayTeam: "B",
  homeScore: score?.[0] ?? null,
  awayScore: score?.[1] ?? null,
});

describe("pickLastMatch", () => {
  it("prefers a remembered away result over the stale home-only 'last' event", () => {
    // Chorale Roanne, 2026-09-29: eventslast = May home game, the Boulazac away game is only
    // reachable by id.
    const staleHome = ev("elan", "2026-05-15", ["108", "82"]);
    const boulazac = ev("boulazac", "2026-09-26", ["79", "81"]);
    expect(pickLastMatch([staleHome, boulazac])?.id).toBe("boulazac");
  });

  it("ignores events without a score and missing candidates", () => {
    expect(pickLastMatch([ev("x", "2026-09-30"), null, ev("y", "2026-09-20", ["1", "0"])])?.id).toBe("y");
    expect(pickLastMatch([null])).toBeNull();
  });
});

describe("nextPendingEventId", () => {
  const today = "2026-09-29";
  const next = ev("next", "2026-10-02");

  it("remembers the upcoming match when nothing is pending", () => {
    expect(nextPendingEventId(null, next, today)).toBe("next");
  });

  it("moves on once the remembered match has a score", () => {
    expect(nextPendingEventId(ev("p", "2026-09-26", ["79", "81"]), next, today)).toBe("next");
  });

  it("keeps a played match without a score yet, to retry", () => {
    expect(nextPendingEventId(ev("p", "2026-09-28"), next, today)).toBe("p");
  });

  it("gives up on a match still scoreless days later", () => {
    expect(nextPendingEventId(ev("p", "2026-09-20"), next, today)).toBe("next");
  });

  it("follows the schedule while the remembered match is still upcoming", () => {
    expect(nextPendingEventId(ev("p", "2026-10-05"), next, today)).toBe("next");
  });
});
