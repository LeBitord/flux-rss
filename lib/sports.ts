// TheSportsDB's public test key ("3") — free, no signup, no card. Rate-limited but
// plenty for a daily check on a handful of teams. https://www.thesportsdb.com/free_sports_api
const API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

export type SportEvent = {
  id: string;
  date: string;
  time: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
};

async function fetchEvents(kind: "next" | "last", teamId: string): Promise<SportEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/events${kind}.php?id=${teamId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const raw: Record<string, unknown>[] = (kind === "next" ? data.events : data.results) ?? [];
    return raw.map((e) => ({
      id: String(e.idEvent),
      date: e.dateEvent as string,
      time: (e.strTime as string) || null,
      homeTeam: e.strHomeTeam as string,
      awayTeam: e.strAwayTeam as string,
      homeScore: (e.intHomeScore as string) ?? null,
      awayScore: (e.intAwayScore as string) ?? null,
    }));
  } catch (err) {
    console.error(`Sports fetch failed for team ${teamId} (${kind}):`, err);
    return [];
  }
}

export async function getTeamRecap(
  teamId: string,
): Promise<{ lastMatch: SportEvent | null; nextMatch: SportEvent | null }> {
  const [last, next] = await Promise.all([
    fetchEvents("last", teamId),
    fetchEvents("next", teamId),
  ]);
  return { lastMatch: last[0] ?? null, nextMatch: next[0] ?? null };
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
