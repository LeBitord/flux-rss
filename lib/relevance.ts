import { generateObject } from "ai";
import { z } from "zod";

const scoreSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().min(1).max(10),
    }),
  ),
});

const DEFAULT_SCORE = 5;

// Scores each article 1-10 for a given category's audience, using a fast/cheap model.
// Returns an array aligned with `items` (same length, same order) — never throws,
// falls back to a neutral score for everything on any failure so a bad LLM call
// never blocks a digest from going out.
export async function scoreRelevance(
  categoryName: string,
  items: { title: string; description?: string }[],
): Promise<number[]> {
  const fallback = new Array(items.length).fill(DEFAULT_SCORE) as number[];
  if (items.length === 0) return fallback;

  const list = items
    .map((item, i) => `${i}. ${item.title}${item.description ? ` — ${item.description}` : ""}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4.5",
      schema: scoreSchema,
      system:
        `Tu notes la pertinence d'articles pour quelqu'un qui suit la catégorie "${categoryName}". ` +
        `Score de 1 (anecdotique, sans grand intérêt) à 10 (majeur, à lire en priorité). ` +
        `Un score élevé signifie un vrai impact ou une nouveauté significative, pas juste une mention en passant.`,
      prompt: `Articles à noter (un par ligne, numérotés à partir de 0) :\n${list}`,
    });

    const scores = [...fallback];
    for (const s of object.scores) {
      if (s.index >= 0 && s.index < items.length) scores[s.index] = s.score;
    }
    return scores;
  } catch (err) {
    console.error("Relevance scoring failed:", err);
    return fallback;
  }
}
