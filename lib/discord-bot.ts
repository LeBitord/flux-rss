const DISCORD_API = "https://discord.com/api/v10";

export type DiscordEmbed = {
  title: string;
  url?: string;
  color?: number;
  description?: string;
  author?: { name: string; icon_url?: string };
  thumbnail?: { url: string };
  timestamp?: string;
};

export type DiscordButton = {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButton[];
};

export async function sendBotMessage(
  channelId: string,
  payload: { content?: string; embeds?: DiscordEmbed[]; components?: DiscordActionRow[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "Missing DISCORD_BOT_TOKEN" };

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Discord a répondu ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
