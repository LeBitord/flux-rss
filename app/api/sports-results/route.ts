import { supabaseAdmin } from "@/lib/supabase-admin";
import { cronHandler } from "@/lib/cron-runs";
import { sendBotMessage } from "@/lib/discord-bot";
import { getTeamRecap, formatMatchResult, formatNextMatch } from "@/lib/sports";
import type { Category, SportsTeam } from "@/lib/types";

export const maxDuration = 30;

// A result older than this is left to the weekly recap — avoids posting a stale score
// the first time a team is added, or after the job was down for a while.
const MAX_RESULT_AGE_DAYS = 2;

// Evening job: posts the score of any match that finished since the last run, the same
// day, instead of waiting for Monday's recap. last_notified_event_id prevents repeats.
export const GET = cronHandler("sports-results", async () => {
  const db = supabaseAdmin();
  const [{ data: categories }, { data: teams }] = await Promise.all([
    db.from("categories").select("*"),
    db.from("sports_teams").select("*"),
  ]);
  const categoryById = new Map(((categories ?? []) as Category[]).map((c) => [c.id, c]));
  const oldestDate = new Date(Date.now() - MAX_RESULT_AGE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let sent = 0;
  const errors: string[] = [];

  for (const team of (teams ?? []) as SportsTeam[]) {
    const category = categoryById.get(team.category_id);
    if (!category?.discord_channel_id) continue;

    const { lastMatch, nextMatch, pendingEventId } = await getTeamRecap(team);
    // Skipped when the post below fails, so the remembered match (and its score) is kept
    // for the next run instead of being replaced by the upcoming one.
    const savePending = async () => {
      if (pendingEventId !== team.pending_event_id) {
        await db.from("sports_teams").update({ pending_event_id: pendingEventId }).eq("id", team.id);
      }
    };

    const resultLine =
      lastMatch &&
      lastMatch.id !== team.last_notified_event_id &&
      lastMatch.date >= oldestDate &&
      formatMatchResult(lastMatch, team.name);
    if (!lastMatch || !resultLine) {
      await savePending();
      continue;
    }

    const lines = [resultLine.replace(/^Dernier match — /, "")];
    if (nextMatch) lines.push(formatNextMatch(nextMatch, team.name));
    const content = `${team.emoji} **${team.name}** — ${lines.join("\n")}`;

    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    await db
      .from("sports_teams")
      .update({ last_notified_event_id: lastMatch.id })
      .eq("id", team.id);
    await savePending();
    sent += 1;
  }

  return Response.json({ sent, errors });
});
