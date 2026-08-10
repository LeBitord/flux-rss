import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DISCORD_WEBHOOK_RE = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isValidDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url);
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

// Blocks the obvious SSRF targets (loopback, RFC1918, link-local/cloud metadata) for
// URLs an admin enters for outbound server-side fetches (RSS feeds). Not a defense
// against DNS rebinding between this check and the later fetch.
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL invalide");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Seules les URLs http/https sont autorisées");
  }

  const hostname = url.hostname;
  if (hostname.toLowerCase() === "localhost") {
    throw new Error("Hôte non autorisé");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Adresse IP privée non autorisée");
    return;
  }

  const results = await lookup(hostname, { all: true });
  if (results.some((r) => isPrivateIp(r.address))) {
    throw new Error("Ce nom d'hôte résout vers une adresse privée non autorisée");
  }
}
