// TheSportsDB's public test key ("3") — free, no signup, no card. Rate-limited but
// plenty for a daily check on a handful of teams. https://www.thesportsdb.com/free_sports_api
//
// Free-key limits that shape this file: eventslast.php returns a single event, in practice
// the last HOME match only, and league season listings stop at 5 events. So an away
// result is never listed. The workaround: remember each team's next match (eventsnext is
// reliable) and, once its date has passed, fetch its score by id (lookupevent.php).
const API_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const PENDING_GIVE_UP_DAYS = 3; // a match still without a score after this is dropped

export type SportEvent = {
  id: string;
  date: string;
  time: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
};

function toSportEvent(e: Record<string, unknown>): SportEvent {
  const score = (v: unknown) => (v == null || v === "" ? null : String(v));
  return {
    id: String(e.idEvent),
    date: e.dateEvent as string,
    time: (e.strTime as string) || null,
    homeTeam: e.strHomeTeam as string,
    awayTeam: e.strAwayTeam as string,
    homeScore: score(e.intHomeScore),
    awayScore: score(e.intAwayScore),
  };
}

export function hasScore(event: SportEvent): boolean {
  return event.homeScore != null && event.awayScore != null;
}

async function fetchEvents(kind: "next" | "last", teamId: string): Promise<SportEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/events${kind}.php?id=${teamId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const raw: Record<string, unknown>[] = (kind === "next" ? data.events : data.results) ?? [];
    return raw.map(toSportEvent);
  } catch (err) {
    console.error(`Sports fetch failed for team ${teamId} (${kind}):`, err);
    return [];
  }
}

async function lookupEvent(eventId: string): Promise<SportEvent | null> {
  try {
    const res = await fetch(`${API_BASE}/lookupevent.php?id=${encodeURIComponent(eventId)}`);
    if (!res.ok) return null;
    const raw = ((await res.json()).events ?? [])[0];
    return raw ? toSportEvent(raw) : null;
  } catch (err) {
    console.error(`Sports lookup failed for event ${eventId}:`, err);
    return null;
  }
}

// Most recent event that has a final score, among the candidates found.
export function pickLastMatch(candidates: (SportEvent | null)[]): SportEvent | null {
  return (
    candidates
      .filter((e): e is SportEvent => e != null && hasScore(e))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

// Which match to remember for next time. The remembered match is kept until it has a
// score (it may be played tonight, or its score may land a day late), then replaced by
// the upcoming one; it is dropped if still scoreless a few days after its date.
export function nextPendingEventId(
  pending: SportEvent | null,
  next: SportEvent | null,
  today: string,
): string | null {
  if (!pending || hasScore(pending) || pending.date > today) return next?.id ?? null;
  const daysLate = (Date.parse(today) - Date.parse(pending.date)) / 86_400_000;
  return daysLate > PENDING_GIVE_UP_DAYS ? (next?.id ?? null) : pending.id;
}

export async function getTeamRecap(
  team: { thesportsdb_id: string; pending_event_id: string | null; last_notified_event_id: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ lastMatch: SportEvent | null; nextMatch: SportEvent | null; pendingEventId: string | null }> {
  const lookupIds = [...new Set([team.pending_event_id, team.last_notified_event_id])].filter(
    (id): id is string => Boolean(id),
  );
  const [last, next, ...looked] = await Promise.all([
    fetchEvents("last", team.thesportsdb_id),
    fetchEvents("next", team.thesportsdb_id),
    ...lookupIds.map(lookupEvent),
  ]);
  const byId = new Map(looked.filter((e): e is SportEvent => e != null).map((e) => [e.id, e]));
  const pending = team.pending_event_id ? (byId.get(team.pending_event_id) ?? null) : null;
  const nextMatch = next[0] ?? null;

  return {
    lastMatch: pickLastMatch([last[0] ?? null, ...byId.values()]),
    nextMatch,
    pendingEventId: nextPendingEventId(pending, nextMatch, today),
  };
}

export function formatMatchResult(event: SportEvent, teamName: string): string | null {
  if (event.homeScore == null || event.awayScore == null) return null;

  const isHome = event.homeTeam === teamName;
  const opponent = isHome ? event.awayTeam : event.homeTeam;
  const teamScore = Number(isHome ? event.homeScore : event.awayScore);
  const oppScore = Number(isHome ? event.awayScore : event.homeScore);
  const outcome = teamScore > oppScore ? "✅ Victoire" : teamScore < oppScore ? "❌ Défaite" : "➖ Nul";

  return `Dernier match — ${outcome} ${teamScore}-${oppScore} contre ${opponent} (${event.date})`;
}

export function formatNextMatch(event: SportEvent, teamName: string): string {
  const isHome = event.homeTeam === teamName;
  const opponent = isHome ? event.awayTeam : event.homeTeam;
  const location = isHome ? "domicile" : "extérieur";
  const time = event.time ? ` à ${event.time.slice(0, 5)}` : "";
  return `Prochain match — vs ${opponent} (${location}) le ${event.date}${time}`;
}

export type TeamSearchResult = { id: string; name: string; sport: string; league: string | null };

export async function searchTeams(query: string): Promise<TeamSearchResult[]> {
  const res = await fetch(`${API_BASE}/searchteams.php?t=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`TheSportsDB a répondu ${res.status}`);
  const data = await res.json();
  const raw: Record<string, unknown>[] = data.teams ?? [];
  return raw.map((t) => ({
    id: String(t.idTeam),
    name: String(t.strTeam),
    sport: String(t.strSport ?? ""),
    league: (t.strLeague as string) || null,
  }));
}

const SPORT_EMOJI: Record<string, string> = {
  Rugby: "🏉",
  Basketball: "🏀",
  Soccer: "⚽",
  "Ice Hockey": "🏒",
  Handball: "🤾",
  Volleyball: "🏐",
  Tennis: "🎾",
};

export function sportEmoji(sport: string): string {
  return SPORT_EMOJI[sport] ?? "🏅";
}
