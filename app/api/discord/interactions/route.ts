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
  holdingFromPosition,
  type HoldingInfo,
} from "@/lib/stock-embed";
import type { DiscordEmbed } from "@/lib/discord-bot";
import { mergeKeywords, parseTerms } from "@/lib/feed-filters";
import { summarizeArticle } from "@/lib/article-summary";

const DISCORD_API = "https://discord.com/api/v10";

const RECAP_WINDOW_DAYS = 3;
const RECAP_LIMIT = 10;
const HIGH_RELEVANCE_THRESHOLD = 8;

const SEARCH_LIMIT = 10;

type InteractionBody = {
  application_id?: string;
  token?: string;
  data?: { options?: { name: string; value: unknown }[] };
};

function getOption(body: InteractionBody, name: string): unknown {
  return body.data?.options?.find((o) => o.name === name)?.value;
}

function ephemeral(content: string) {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: InteractionResponseFlags.EPHEMERAL },
  });
}

// ilike treats % and _ as wildcards — escape them so a search for "5%" means "5%".
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Discord requires an ack within 3s: acknowledge now, do the work after the response,
// then patch the real content into the original (deferred) reply.
function deferThen(
  body: InteractionBody,
  work: () => Promise<{ content?: string; embeds?: DiscordEmbed[] }>,
) {
  const { application_id: applicationId, token } = body;
  if (applicationId && token) {
    after(async () => {
      let payload: { content?: string; embeds?: DiscordEmbed[] };
      try {
        payload = await work();
      } catch (err) {
        console.error("Deferred interaction failed:", err);
        payload = { content: "Une erreur est survenue." };
      }
      try {
        await fetch(`${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("Failed to patch deferred interaction:", err);
      }
    });
  }
  return Response.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
}

function hexToInt(hex: string): number {
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? 0x5865f2 : parsed;
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

    // 👍 on a feed with no include keywords only gets logged: that feed accepts everything,
    // and adding its first include keyword would silently narrow it to that one topic.
    const filterUpdated =
      feed != null && (direction === "down" || parseTerms(feed.keywords).length > 0);

    if (feed) {
      if (filterUpdated) {
        const column = direction === "up" ? "keywords" : "exclude_keywords";
        await db
          .from("feeds")
          .update({ [column]: mergeKeywords(feed[column], topics) })
          .eq("id", feed.id);
      }

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
        content: filterUpdated
          ? `${emoji} Noté — "${topics.join(", ")}" ${direction === "up" ? "renforcé" : "exclu"} pour ce flux.`
          : `${emoji} Noté — "${topics.join(", ")}" pris en compte pour affiner la pertinence.`,
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

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "cherche") {
    const query = String(getOption(body, "mots") ?? "").trim();
    if (query.length < 2) {
      return ephemeral("Donne au moins 2 caractères à chercher.");
    }
    return deferThen(body, async () => {
      const db = supabaseAdmin();
      const [{ data: items }, { data: feeds }, { data: categories }] = await Promise.all([
        db
          .from("seen_items")
          .select("title, link, score, seen_at, feed_id")
          .ilike("title", `%${escapeLike(query)}%`)
          .order("seen_at", { ascending: false })
          .limit(SEARCH_LIMIT),
        db.from("feeds").select("id, name, category_id"),
        db.from("categories").select("id, name, color"),
      ]);

      if (!items || items.length === 0) {
        return { content: `Aucun article trouvé pour « ${query} ».` };
      }

      const feedById = new Map((feeds ?? []).map((f) => [f.id as string, f]));
      const categoryById = new Map((categories ?? []).map((c) => [c.id as string, c]));
      const lines = items.map((item) => {
        const feed = feedById.get(item.feed_id as string);
        const category = feed ? categoryById.get(feed.category_id as string) : undefined;
        const date = new Date(item.seen_at as string).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
        });
        const fire = (item.score ?? 0) >= HIGH_RELEVANCE_THRESHOLD ? "🔥 " : "";
        const meta = [date, category?.name, item.score ? `${item.score}/10` : null]
          .filter(Boolean)
          .join(" · ");
        return `${fire}[${item.title}](${item.link}) — _${meta}_`;
      });

      return {
        embeds: [
          {
            title: `🔎 « ${query} » — ${items.length} résultat(s)`.slice(0, 256),
            color: 0x5865f2,
            description: lines.join("\n").slice(0, 4096),
          },
        ],
      };
    });
  }

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "resume") {
    const url = String(getOption(body, "lien") ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return ephemeral("Donne un lien complet commençant par http:// ou https://.");
    }
    return deferThen(body, async () => {
      const result = await summarizeArticle(url);
      if (!result.ok) return { content: `Impossible de résumer ce lien : ${result.error}` };
      return {
        embeds: [
          {
            title: `📝 ${result.title ?? "Résumé"}`.slice(0, 256),
            url,
            color: 0x5865f2,
            description: result.summary.slice(0, 4096),
          },
        ],
      };
    });
  }

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "cours") {
    const channelId: string | undefined = body.channel_id;
    const period = (getOption(body, "periode") as ChartPeriod | undefined) ?? "month";

    // Even the category/ticker lookup can blow Discord's 3s budget on a cold start,
    // so every bit of work — DB included — happens after the deferred ack.
    return deferThen(body, async () => {
      const db = supabaseAdmin();
      const { data: category } = await db
        .from("categories")
        .select("id, name")
        .eq("discord_channel_id", channelId)
        .maybeSingle();
      if (!category) return { content: "Ce salon n'est associé à aucune catégorie flux-rss." };

      const { data: positionsInCategory } = await db
        .from("stock_positions")
        .select("ticker, label, shares, cost_basis, purchase_date, dividends_total")
        .eq("category_id", category.id);
      const positions = (positionsInCategory ?? []) as {
        ticker: string;
        label: string;
        shares: number | null;
        cost_basis: number | null;
        purchase_date: string | null;
        dividends_total: number | null;
      }[];
      if (positions.length === 0) {
        return { content: `Aucun ticker boursier configuré pour **${category.name}**.` };
      }

      const holdingByTicker = new Map<string, HoldingInfo>(
        positions.map((p) => [p.ticker, holdingFromPosition(p)]),
      );
      const results = await getStockQuotesWithHistory(positions);
      if (results.length === 0) return { content: "Impossible de récupérer les cours pour le moment." };

      const embeds = await Promise.all(
        results.map(({ quote, history }) =>
          buildStockEmbed(quote, history, period, holdingByTicker.get(quote.ticker) ?? null),
        ),
      );
      const totalEmbed = buildPortfolioTotalEmbed(
        results.map(({ quote }) => ({ quote, holding: holdingByTicker.get(quote.ticker) ?? null })),
      );
      if (totalEmbed) embeds.push(totalEmbed);
      return { embeds };
    });
  }

  return new Response("Unhandled interaction type", { status: 400 });
}
