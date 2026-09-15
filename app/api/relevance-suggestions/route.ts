import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { suggestRelevanceContextUpdate } from "@/lib/relevance";
import { sendBotMessage } from "@/lib/discord-bot";
import type { Category } from "@/lib/types";

export const maxDuration = 60;

const MIN_FEEDBACK_FOR_SUGGESTION = 5;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: categories } = await db.from("categories").select("*");
  const categoryList = (categories ?? []) as Category[];

  const briefingChannelId = process.env.BRIEFING_DISCORD_CHANNEL_ID;
  let suggestionsSent = 0;
  const errors: string[] = [];

  for (const category of categoryList) {
    let query = db
      .from("feedback_log")
      .select("direction, topics")
      .eq("category_id", category.id)
      .order("created_at", { ascending: false });
    if (category.last_relevance_suggestion_at) {
      query = query.gt("created_at", category.last_relevance_suggestion_at);
    }
    const { data: feedback } = await query;

    if (!feedback || feedback.length < MIN_FEEDBACK_FOR_SUGGESTION) continue;

    const suggestion = await suggestRelevanceContextUpdate(
      category.name,
      category.relevance_context,
      feedback as { direction: "up" | "down"; topics: string }[],
    );

    // Mark the category as checked regardless of outcome — otherwise the same feedback
    // batch gets re-evaluated (and re-billed to Gemini) every run until it produces a hit.
    await db
      .from("categories")
      .update({ last_relevance_suggestion_at: new Date().toISOString() })
      .eq("id", category.id);

    if (!suggestion?.hasSuggestion || !suggestion.suggestedContext.trim()) continue;

    const destinationChannel = briefingChannelId ?? category.discord_channel_id;
    if (!destinationChannel) continue;

    const content =
      `💡 **Suggestion de contexte — ${category.name}**\n` +
      `${suggestion.reasoning}\n\n` +
      `Actuel : ${category.relevance_context || "_(aucun)_"}\n` +
      `Proposé : ${suggestion.suggestedContext}\n\n` +
      "_Pas appliqué automatiquement — modifie-le dans l'admin si tu es d'accord._";

    const result = await sendBotMessage(destinationChannel, { content: content.slice(0, 2000) });
    if (result.ok) {
      suggestionsSent += 1;
    } else {
      errors.push(result.error);
    }
  }

  return Response.json({ suggestionsSent, errors });
}
