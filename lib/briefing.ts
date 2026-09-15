import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export type BriefingCategory = {
  name: string;
  items: { title: string; score?: number }[];
};

// Condensed cross-category synthesis for the morning briefing channel — separate from
// scoreRelevance (which scores article-by-article) since this reads the already-scored
// items and produces a few sentences of prose instead of structured data.
export async function generateBriefingSummary(
  categories: BriefingCategory[],
  stockLines: string[],
): Promise<string | null> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  if (categories.length === 0 && stockLines.length === 0) return null;

  const list = categories
    .map((c) => {
      const items = c.items
        .slice(0, 8)
        .map((item) => `- ${item.title}${item.score ? ` (score ${item.score}/10)` : ""}`)
        .join("\n");
      return `### ${c.name}\n${items}`;
    })
    .join("\n\n");

  const stockBlock = stockLines.length > 0 ? `\n\nCours du jour :\n${stockLines.join("\n")}` : "";

  try {
    const { text } = await generateText({
      model: google("gemini-3.5-flash-lite"),
      system:
        "Tu rédiges un briefing matinal condensé, en français, pour quelqu'un qui suit plusieurs " +
        "catégories d'actualité (vidéosurveillance, tech, finance, rugby, basket). " +
        "Résume en 4 à 6 phrases percutantes les points à retenir aujourd'hui, en priorisant ce qui a " +
        "le score le plus élevé. Ton direct, factuel, pas de flatterie ni d'emojis en trop. " +
        "Ne liste pas mécaniquement chaque catégorie — synthétise.",
      prompt: `Articles du jour par catégorie :\n\n${list || "(aucun article aujourd'hui)"}${stockBlock}`,
    });
    return text.trim();
  } catch (err) {
    console.error("Briefing summary generation failed:", err);
    return null;
  }
}
