// Registers the bot's slash commands with Discord, on every server the bot is in
// (server commands show up instantly, unlike global ones).
//
//   node scripts/register-commands.mjs            → shows registered vs missing, changes nothing
//   node scripts/register-commands.mjs --apply    → creates the missing commands
//   node scripts/register-commands.mjs --apply --force → also overwrites existing ones
//
// Commands are created one by one (POST), never through the bulk PUT endpoint, so a
// command registered by hand and not listed here is left untouched.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: [join(rootDir, ".env.local"), join(rootDir, ".env")], quiet: true });

const STRING = 3;

const COMMANDS = [
  {
    name: "recap",
    description: "Les articles les mieux notés des 3 derniers jours pour ce salon",
  },
  {
    name: "cours",
    description: "Cours et graphiques des positions de ce salon",
    options: [
      {
        type: STRING,
        name: "periode",
        description: "Période du graphique",
        required: false,
        choices: [
          { name: "jour", value: "day" },
          { name: "semaine", value: "week" },
          { name: "mois", value: "month" },
        ],
      },
    ],
  },
  {
    name: "cherche",
    description: "Retrouver un article déjà reçu, par mot du titre",
    options: [
      { type: STRING, name: "mots", description: "Mots à chercher dans le titre", required: true },
    ],
  },
  {
    name: "resume",
    description: "Résumer un article en français à partir de son lien",
    options: [{ type: STRING, name: "lien", description: "URL de l'article", required: true }],
  },
];

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!token || !applicationId) throw new Error("Missing DISCORD_BOT_TOKEN / DISCORD_APPLICATION_ID in env");

  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const api = async (path, init) => {
    const res = await fetch(`https://discord.com/api/v10${path}`, { headers, ...init });
    if (!res.ok) throw new Error(`${path} → Discord a répondu ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const guilds = await api("/users/@me/guilds");
  if (guilds.length === 0) throw new Error("Le bot n'est sur aucun serveur.");

  for (const guild of guilds) {
    const path = `/applications/${applicationId}/guilds/${guild.id}/commands`;
    const existing = new Set((await api(path)).map((c) => c.name));
    const registered = [...existing].map((n) => `/${n}`).join(", ") || "(aucune)";
    console.log(`\n${guild.name} — déjà enregistrées : ${registered}`);

    const toCreate = COMMANDS.filter((c) => force || !existing.has(c.name));
    if (toCreate.length === 0) {
      console.log("Rien à faire.");
      continue;
    }
    console.log(`À ${force ? "créer ou écraser" : "créer"} : ${toCreate.map((c) => `/${c.name}`).join(", ")}`);
    if (!apply) continue;

    for (const command of toCreate) {
      await api(path, { method: "POST", body: JSON.stringify(command) });
      console.log(`✓ /${command.name}`);
    }
  }
  if (!apply) console.log("\nRelancer avec --apply pour appliquer.");
}

// exitCode rather than process.exit(): exiting with fetch sockets still open trips a
// libuv assertion on Windows.
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
