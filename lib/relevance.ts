import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

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
