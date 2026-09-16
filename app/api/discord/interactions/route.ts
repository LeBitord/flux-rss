import { after } from "next/server";
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStockQuotesWithHistory } from "@/lib/stocks";
import {
  buildStockEmbed,
  buildPortfolioTotalEmbed,
  type ChartPeriod,
  type HoldingInfo,
} from "@/lib/stock-embed";
import type { DiscordEmbed } from "@/lib/discord-bot";

const DISCORD_API = "https://discord.com/api/v10";

const RECAP_WINDOW_DAYS = 3;
const RECAP_LIMIT = 10;
const HIGH_RELEVANCE_THRESHOLD = 8;

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? 0x5865f2 : parsed;
}

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

    if (customId.startsWith("relsug:")) {
      const [, action, categoryId] = customId.split(":");
      if ((action !== "apply" && action !== "dismiss") || !categoryId) {
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "Bouton non reconnu.", flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      const db = supabaseAdmin();
      const { data: category } = await db
        .from("categories")
        .select("pending_relevance_suggestion")
        .eq("id", categoryId)
        .maybeSingle();

      const pending = category?.pending_relevance_suggestion as string | null | undefined;
      if (!pending) {
        return Response.json({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: "Cette suggestion n'est plus disponible (déjà traitée ?).",
            components: [],
          },
        });
      }

      await db
        .from("categories")
        .update(
          action === "apply"
            ? { relevance_context: pending, pending_relevance_suggestion: null }
            : { pending_relevance_suggestion: null },
        )
        .eq("id", categoryId);

      return Response.json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          content:
            action === "apply"
              ? `✅ Contexte mis à jour :\n${pending}`
              : "❌ Suggestion ignorée.",
          components: [],
        },
      });
    }

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
      .select("id, category_id, keywords, exclude_keywords")
      .eq("id", seenItem.feed_id)
      .single();

    if (feed) {
      const column = direction === "up" ? "keywords" : "exclude_keywords";
      const updated = mergeKeywords(feed[column], topics);
      await db
        .from("feeds")
        .update({ [column]: updated })
        .eq("id", feed.id);

      // Kept separately from the keyword merge above so the relevance-context suggestion
      // job can look at the raw feedback history even after keywords keep changing.
      await db.from("feedback_log").insert({
        category_id: feed.category_id,
        direction,
        topics: topics.join(", "),
      });
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

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "recap") {
    const channelId: string | undefined = body.channel_id;
    const db = supabaseAdmin();

    const { data: category } = await db
      .from("categories")
      .select("*")
      .eq("discord_channel_id", channelId)
      .maybeSingle();

    if (!category) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Ce salon n'est associé à aucune catégorie flux-rss.",
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const { data: feedsInCategory } = await db
      .from("feeds")
      .select("id")
      .eq("category_id", category.id);
    const feedIds = (feedsInCategory ?? []).map((f) => f.id as string);

    if (feedIds.length === 0) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Aucun flux configuré pour **${category.name}**.`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    const since = new Date(Date.now() - RECAP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentItems } = await db
      .from("seen_items")
      .select("title, link, score, seen_at")
      .in("feed_id", feedIds)
      .gte("seen_at", since)
      .not("title", "is", null)
      .order("score", { ascending: false, nullsFirst: false })
      .order("seen_at", { ascending: false })
      .limit(RECAP_LIMIT);

    if (!recentItems || recentItems.length === 0) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `Rien de nouveau dans **${category.name}** ces ${RECAP_WINDOW_DAYS} derniers jours.`,
        },
      });
    }

    const color = hexToInt(category.color);
    const embeds = recentItems.map((item, i) => ({
      title: (
        ((item.score ?? 0) >= HIGH_RELEVANCE_THRESHOLD ? "🔥 " : "") +
        `${i + 1}. ${item.title}`
      ).slice(0, 256),
      url: item.link ?? undefined,
      color,
      timestamp: item.seen_at ?? undefined,
    }));

    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `**Récap ${category.name}** — ${recentItems.length} article(s) des ${RECAP_WINDOW_DAYS} derniers jours`,
        embeds,
      },
    });
  }

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "cours") {
    const channelId: string | undefined = body.channel_id;
    const applicationId: string | undefined = body.application_id;
    const token: string | undefined = body.token;
    const periodOption = (body.data?.options ?? []).find(
      (o: { name: string; value: string }) => o.name === "periode",
    )?.value as ChartPeriod | undefined;
    const period: ChartPeriod = periodOption ?? "month";

    // Discord requires an ack within 3s. Even the category/ticker lookup can blow that
    // budget on a cold start, so defer FIRST and do every bit of work — DB included — in
    // the background, then patch the real content in once it's ready.
    if (applicationId && token) {
      after(async () => {
        const db = supabaseAdmin();
        let content: string | undefined;
        let embeds: DiscordEmbed[] | undefined;
        try {
          const { data: category } = await db
            .from("categories")
            .select("id, name")
            .eq("discord_channel_id", channelId)
            .maybeSingle();

          if (!category) {
            content = "Ce salon n'est associé à aucune catégorie flux-rss.";
          } else {
            const { data: positionsInCategory } = await db
              .from("stock_positions")
              .select("ticker, label, shares, cost_basis, purchase_date")
              .eq("category_id", category.id);
            const positions = (positionsInCategory ?? []) as {
              ticker: string;
              label: string;
              shares: number | null;
              cost_basis: number | null;
              purchase_date: string | null;
            }[];

            if (positions.length === 0) {
              content = `Aucun ticker boursier configuré pour **${category.name}**.`;
            } else {
              const holdingByTicker = new Map<string, HoldingInfo>(
                positions.map((p) => [
                  p.ticker,
                  { shares: p.shares, costBasis: p.cost_basis, purchaseDate: p.purchase_date },
                ]),
              );
              const results = await getStockQuotesWithHistory(positions);
              if (results.length === 0) {
                content = "Impossible de récupérer les cours pour le moment.";
              } else {
                embeds = await Promise.all(
                  results.map(({ quote, history }) =>
                    buildStockEmbed(quote, history, period, holdingByTicker.get(quote.ticker) ?? null),
                  ),
                );
                const totalEmbed = buildPortfolioTotalEmbed(
                  results.map(({ quote }) => ({
                    quote,
                    holding: holdingByTicker.get(quote.ticker) ?? null,
                  })),
                );
                if (totalEmbed) embeds.push(totalEmbed);
              }
            }
          }
        } catch (err) {
          console.error("Failed to resolve /cours follow-up:", err);
          content = "Une erreur est survenue.";
        }

        try {
          await fetch(
            `${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content, embeds }),
            },
          );
        } catch (err) {
          console.error("Failed to patch /cours follow-up:", err);
        }
      });
    }

    return Response.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return new Response("Unhandled interaction type", { status: 400 });
}
