# Flux RSS

Agrégateur RSS multi-domaines qui surveille des flux RSS/Atom, filtre les articles par mots-clés et fraîcheur, puis notifie les nouveautés vers des salons Discord dédiés (une catégorie = un salon = une couleur d'embed).

## Fonctionnalités

- **Panel d'administration** protégé par mot de passe (auto-hébergé, sans dépendance à un fournisseur d'identité externe) : gestion des catégories, des flux et de leurs filtres par mots-clés.
- **Polling planifié** (Vercel Cron) : parsing des flux, déduplication, filtrage par ancienneté et par mots-clés, puis notification Discord sous forme d'embeds riches.
- **Alerte automatique** vers un salon Discord dédié en cas d'échec (flux cassé, webhook invalide) — pas besoin de surveiller manuellement.
- **Sécurité** : mot de passe haché (scrypt), invalidation de session au changement de mot de passe, verrouillage anti-bruteforce sur la connexion, garde-fou SSRF sur les URLs saisies, headers de sécurité (CSP, HSTS, anti-clickjacking).

## Stack

- [Next.js](https://nextjs.org) (App Router) + [shadcn/ui](https://ui.shadcn.com) (Base UI)
- [Supabase](https://supabase.com) (Postgres) pour la persistance
- [Vercel](https://vercel.com) pour l'hébergement et les tâches planifiées (Cron)
- [rss-parser](https://www.npmjs.com/package/rss-parser) pour le parsing des flux

## Développement local

```bash
npm install
npm run dev
```

Nécessite un fichier `.env.local` (non versionné) avec :

| Variable | Description |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Accès à la base Supabase |
| `CRON_SECRET` | Secret partagé pour authentifier les appels du cron vers `/api/poll` |
| `ADMIN_PASSWORD` | Mot de passe de secours tant qu'aucun mot de passe n'a été défini via le panel |
| `SESSION_SECRET` | Secret de signature des sessions |
| `ALERTS_DISCORD_WEBHOOK_URL` | Webhook Discord pour les alertes d'échec (optionnel) |

## Base de données

Les migrations SQL se trouvent dans `supabase/migrations/`. Le script `scripts/migrate.mjs` les applique dans l'ordre à la base configurée dans les variables d'environnement.
