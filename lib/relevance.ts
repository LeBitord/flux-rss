import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const suggestionSchema = z.object({
  hasSuggestion: z.boolean(),
  suggestedContext: z
    .string()
    .describe("Nouveau texte de contexte proposé, en français. Vide si hasSuggestion est false."),
  reasoning: z
    .string()
    .describe("1-2 phrases expliquant ce que les retours révèlent et pourquoi ce changement aide."),
});

export type RelevanceSuggestion = {
  hasSuggestion: boolean;
  suggestedContext: string;
  reasoning: string;
};

// Looks at accumulated 👍/👎 feedback for a category and proposes a refined
// relevance_context — never applied automatically, just surfaced for the user to review.
export async function suggestRelevanceContextUpdate(
  categoryName: string,
  currentContext: string | null,
  feedback: { direction: "up" | "down"; topics: string }[],
): Promise<RelevanceSuggestion | null> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  if (feedback.length === 0) return null;

  const feedbackList = feedback
    .map((f) => `${f.direction === "up" ? "👍" : "👎"} ${f.topics}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: google("gemini-3.5-flash-lite"),
      schema: suggestionSchema,
      system:
        `Tu affines le contexte de pertinence utilisé pour noter les articles de la catégorie "${categoryName}". ` +
        "Le contexte actuel sert à orienter un score de 1 à 10 vers ce qui intéresse vraiment cette personne. " +
        "On te donne les retours 👍 (article jugé pertinent, à renforcer) et 👎 (jugé peu pertinent, à écarter) " +
        "qu'elle a laissés récemment, avec les mots-clés extraits de chaque article. Cherche un pattern réel " +
        "dans ces retours — ne propose un changement que s'il y a un signal clair et répété, pas sur un seul " +
        "retour isolé. Si aucun pattern net ne se dégage, réponds hasSuggestion: false.",
      prompt:
        `Contexte actuel : ${currentContext || "(aucun)"}\n\n` +
        `Retours récents :\n${feedbackList}\n\n` +
        "Propose une nouvelle version du contexte qui intègre ces retours, ou indique qu'il n'y a rien à changer.",
    });

    return object;
  } catch (err) {
    console.error("Relevance suggestion generation failed:", err);
    return null;
  }
}

const scoreSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().min(1).max(10),
      topics: z
        .array(z.string())
        .max(3)
        .describe("1 à 3 mots-clés courts représentant le sujet précis de cet article"),
    }),
  ),
});

export type RelevanceResult = { score: number; topics: string[] };

const DEFAULT_RESULT: RelevanceResult = { score: 5, topics: [] };

// Scores each article 1-10 for a given category's audience and extracts short topic
// keywords, using a fast/cheap model. Returns an array aligned with `items` (same
// length, same order) — never throws, falls back to a neutral result for everything
// on any failure so a bad LLM call never blocks a digest from going out.
export async function scoreRelevance(
  categoryName: string,
  relevanceContext: string | null,
  items: { title: string; description?: string }[],
): Promise<RelevanceResult[]> {
  const fallback = items.map(() => ({ ...DEFAULT_RESULT })) as RelevanceResult[];
  if (items.length === 0) return fallback;

  const list = items
    .map((item, i) => `${i}. ${item.title}${item.description ? ` — ${item.description}` : ""}`)
    .join("\n");

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return fallback;

  const personalContext = relevanceContext
    ? `Ce que cette personne cherche précisément dans "${categoryName}" : ${relevanceContext}\n`
    : "";

  try {
    const { object } = await generateObject({
      model: google("gemini-3.5-flash-lite"),
      schema: scoreSchema,
      system:
        `Tu notes la pertinence d'articles pour quelqu'un qui suit la catégorie "${categoryName}". ` +
        `Score de 1 (anecdotique, sans grand intérêt pour cette personne) à 10 (majeur, à lire en priorité pour elle). ` +
        `${personalContext}` +
        `Note en fonction de CES priorités précises, pas d'une importance générique du sujet — un article qui touche ` +
        `directement ce qui est décrit ci-dessus vaut plus qu'une actu générale du secteur, même si celle-ci fait plus de bruit. ` +
        `Pour chaque article, donne aussi 1 à 3 mots-clés courts (noms propres, thèmes précis) qui le résument — ` +
        `ils serviront à affiner automatiquement les filtres si l'utilisateur réagit à l'article.`,
      prompt: `Articles à noter (un par ligne, numérotés à partir de 0) :\n${list}`,
    });

    const results = [...fallback];
    for (const s of object.scores) {
      if (s.index >= 0 && s.index < items.length) {
        results[s.index] = { score: s.score, topics: s.topics };
      }
    }
    return results;
  } catch (err) {
    console.error("Relevance scoring failed:", err);
    return fallback;
  }
}
