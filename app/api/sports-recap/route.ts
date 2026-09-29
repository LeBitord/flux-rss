import { supabaseAdmin } from "@/lib/supabase-admin";
import { cronHandler } from "@/lib/cron-runs";
import { sendBotMessage } from "@/lib/discord-bot";
import { getTeamRecap, formatMatchResult, formatNextMatch } from "@/lib/sports";
import type { Category, SportsTeam } from "@/lib/types";

export const maxDuration = 30;

export const GET = cronHandler("sports-recap", async () => {
  const db = supabaseAdmin();
  const [{ data: categories }, { data: teams }] = await Promise.all([
    db.from("categories").select("*"),
    db.from("sports_teams").select("*"),
  ]);
  const categoryById = new Map(((categories ?? []) as Category[]).map((c) => [c.id, c]));

  let sent = 0;
  const errors: string[] = [];

  for (const team of (teams ?? []) as SportsTeam[]) {
    const category = categoryById.get(team.category_id);
    if (!category?.discord_channel_id) continue;

    const { lastMatch, nextMatch, pendingEventId } = await getTeamRecap(team);
    if (pendingEventId !== team.pending_event_id) {
      await db.from("sports_teams").update({ pending_event_id: pendingEventId }).eq("id", team.id);
    }
    const lines: string[] = [];
    if (lastMatch) {
      const resultLine = formatMatchResult(lastMatch, team.name);
      if (resultLine) lines.push(resultLine);
    }
    if (nextMatch) lines.push(formatNextMatch(nextMatch, team.name));
    if (lines.length === 0) continue;

    const content = `${team.emoji} **${team.name}**\n${lines.join("\n")}`;
    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(result.error);
    }
  }

  return Response.json({ sent, errors });
});
