import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export type BriefingCategory = {
  name: string;
  items: { title: string; description?: string; score?: number }[];
};

export type BriefingSection = { category: string; summary: string };

const sectionsSchema = z.object({
  sections: z.array(
    z.object({
      category: z.string(),
      summary: z
        .string()
        .describe(
          "3 à 5 phrases substantielles : ce qui s'est passé, pourquoi ça compte, en citant les faits " +
            "précis des articles (noms, chiffres, annonces) plutôt que de rester vague.",
        ),
    }),
  ),
});

// One real paragraph per category (not a single blended sentence across everything) —
// each section is grounded in that category's actual top-scored articles.
export async function generateBriefingSummary(
  categories: BriefingCategory[],
): Promise<BriefingSection[] | null> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  if (categories.length === 0) return null;

  const list = categories
    .map((c) => {
      const items = c.items
        .slice(0, 12)
        .map(
          (item, i) =>
            `${i + 1}. ${item.title}${item.description ? ` — ${item.description}` : ""}` +
            `${item.score ? ` [score ${item.score}/10]` : ""}`,
        )
        .join("\n");
      return `### ${c.name}\n${items}`;
    })
    .join("\n\n");

  try {
    const { object } = await generateObject({
      model: google("gemini-3.5-flash-lite"),
      schema: sectionsSchema,
      system:
        "Tu rédiges le briefing matinal d'une personne qui suit plusieurs catégories d'actualité " +
        "(vidéosurveillance, tech, finance, rugby, basket). Pour CHAQUE catégorie fournie, écris un " +
        "paragraphe dense et concret (3 à 5 phrases) sur ce qu'il faut retenir aujourd'hui — priorise " +
        "les articles au score le plus élevé, mais mentionne aussi les autres sujets notables s'il y en a. " +
        "Cite les faits précis (noms propres, chiffres, annonces) au lieu de paraphraser vaguement. " +
        "Une catégorie sans article marquant peut avoir un résumé plus court, mais ne l'invente pas. " +
        "Ton direct et factuel, pas de flatterie, pas d'emojis. " +
        "IMPORTANT : réponds INTÉGRALEMENT en français, y compris quand les titres sources sont en " +
        "anglais (fréquent en tech) — traduis et reformule en français, ne laisse jamais de phrase en anglais.",
      prompt: `Catégories et leurs articles du jour (numérotés, triés par score décroissant) :\n\n${list}`,
    });

    return object.sections;
  } catch (err) {
    console.error("Briefing summary generation failed:", err);
    return null;
  }
}
