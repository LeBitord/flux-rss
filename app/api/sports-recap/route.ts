import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendBotMessage } from "@/lib/discord-bot";
import { getTeamRecap, formatMatchResult, formatNextMatch } from "@/lib/sports";
import type { Category } from "@/lib/types";

export const maxDuration = 30;

// TheSportsDB team ids (verified against https://www.thesportsdb.com/api/v1/json/3/searchteams.php).
// Hardcoded rather than admin-configurable — these two teams are the whole point of this route.
const TEAMS = [
  { teamId: "135332", teamName: "ASM Clermont Auvergne", categoryName: "rugby", emoji: "🏉" },
  { teamId: "137293", teamName: "Chorale Roanne Basket", categoryName: "basket", emoji: "🏀" },
];

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: categories } = await db.from("categories").select("*");
  const categoryByName = new Map(
    ((categories ?? []) as Category[]).map((c) => [c.name.toLowerCase(), c]),
  );

  let sent = 0;
  const errors: string[] = [];

  for (const team of TEAMS) {
    const category = categoryByName.get(team.categoryName.toLowerCase());
    if (!category?.discord_channel_id) continue;

    const { lastMatch, nextMatch } = await getTeamRecap(team.teamId);
    const lines: string[] = [];
    if (lastMatch) {
      const resultLine = formatMatchResult(lastMatch, team.teamName);
      if (resultLine) lines.push(resultLine);
    }
    if (nextMatch) lines.push(formatNextMatch(nextMatch, team.teamName));
    if (lines.length === 0) continue;

    const content = `${team.emoji} **${team.teamName}**\n${lines.join("\n")}`;
    const result = await sendBotMessage(category.discord_channel_id, { content });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(result.error);
    }
  }

  return Response.json({ sent, errors });
}
