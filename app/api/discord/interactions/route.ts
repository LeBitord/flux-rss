import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function mergeKeywords(existing: string | null, additions: string[]): string {
  const current = (existing ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const merged = new Set(current.map((k) => k.toLowerCase()));
  const result = [...current];
  for (const term of additions) {
    const trimmed = term.trim();
    if (trimmed && !merged.has(trimmed.toLowerCase())) {
      merged.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return result.join(", ");
}

export async function POST(req: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  if (!publicKey || !signature || !timestamp) {
    return new Response("Unauthorized", { status: 401 });
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (body.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (body.type === InteractionType.MESSAGE_COMPONENT) {
    const customId: string = body.data?.custom_id ?? "";
    const [prefix, direction, seenItemId] = customId.split(":");

    if (prefix !== "fb" || (direction !== "up" && direction !== "down") || !seenItemId) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Bouton non reconnu.", flags: InteractionResponseFlags.EPHEMERAL },
      });
    }

    const db = supabaseAdmin();
    const { data: seenItem } = await db
      .from("seen_items")
      .select("feed_id, topics")
      .eq("id", seenItemId)
      .maybeSingle();

    if (!seenItem) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Article introuvable (trop ancien ?).",
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const topics = (seenItem.topics ?? "")
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    if (topics.length === 0) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Pas de mot-clé exploitable pour cet article.",
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const { data: feed } = await db
      .from("feeds")
      .select("id, keywords, exclude_keywords")
      .eq("id", seenItem.feed_id)
      .single();

    if (feed) {
      const column = direction === "up" ? "keywords" : "exclude_keywords";
      const updated = mergeKeywords(feed[column], topics);
      await db
        .from("feeds")
        .update({ [column]: updated })
        .eq("id", feed.id);
    }

    const emoji = direction === "up" ? "👍" : "👎";
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `${emoji} Noté — "${topics.join(", ")}" ${direction === "up" ? "renforcé" : "exclu"} pour ce flux.`,
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }

  return new Response("Unhandled interaction type", { status: 400 });
}
