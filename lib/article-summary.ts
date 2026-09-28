import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { safeFetchText } from "@/lib/safe-fetch";

const MAX_TEXT_CHARS = 15_000; // plenty for an article, keeps the prompt cheap

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

// Rough readability: prefer the <article> element when there is one, drop scripts,
// styles and page chrome, then strip the remaining tags. Good enough to feed an LLM,
// which copes fine with a bit of leftover menu text.
export function extractArticleText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const body = articleMatch ? articleMatch[0] : html;

  const text = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : null;
  return { title, text };
}

async function fetchPage(url: string): Promise<string> {
  const { text, contentType } = await safeFetchText(url);
  if (!contentType.includes("html")) throw new Error("Ce lien ne pointe pas vers une page web");
  return text;
}

export async function summarizeArticle(
  url: string,
): Promise<{ ok: true; title: string | null; summary: string } | { ok: false; error: string }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { ok: false, error: "Clé Gemini non configurée." };
  }

  let page: { title: string | null; text: string };
  try {
    page = extractArticleText(await fetchPage(url));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (page.text.length < 200) {
    return {
      ok: false,
      error: "Pas assez de texte récupéré (page protégée, paywall ou contenu chargé en JavaScript).",
    };
  }

  try {
    const { text } = await generateText({
      model: google("gemini-3.5-flash-lite"),
      system:
        "Tu résumes un article pour quelqu'un qui n'a pas le temps de le lire. Réponds en français, " +
        "même si l'article est en anglais. Format : une phrase d'accroche qui dit l'essentiel, puis 3 à 5 " +
        "puces avec les faits précis (noms, chiffres, dates, annonces). Ton factuel, pas d'emojis. " +
        "Ignore les restes de menus, publicités ou mentions légales présents dans le texte. " +
        "Si le texte ne ressemble pas à un article, dis-le en une phrase au lieu d'inventer.",
      prompt: `Titre de la page : ${page.title ?? "(inconnu)"}\n\nTexte :\n${page.text}`,
    });
    return { ok: true, title: page.title, summary: text.trim() };
  } catch (err) {
    console.error("Article summary failed:", err);
    return { ok: false, error: "Le résumé a échoué côté IA." };
  }
}
