# Flux RSS

Agrégateur RSS multi-domaines qui surveille des flux RSS/Atom, filtre les articles par mots-clés et fraîcheur, puis notifie les nouveautés vers des salons Discord dédiés (une catégorie = un salon = une couleur d'embed).

Autour de ce noyau : notation de pertinence par IA avec boucle de feedback depuis Discord, briefing matinal, suivi de positions boursières et récap sportif hebdo.

## Fonctionnalités

### Veille RSS
- **Polling quotidien** (`/api/poll`) : parsing des flux, déduplication par `guid`, filtre d'ancienneté (7 jours), mots-clés à inclure / à exclure par flux, puis regroupement des doublons inter-flux (titres similaires dans une même catégorie).
- **Digest Discord par catégorie** : un message par salon, jusqu'à 10 embeds triés par pertinence, avec favicon de la source, résumé et image quand le flux en fournit.
- **Santé des flux** : alerte si un flux échoue 3 fois de suite ou ne publie plus rien depuis 14 jours (au plus une fois par semaine) ; désactivation automatique après 10 échecs ou 30 jours de silence.
- **Alerte d'échec** vers un salon dédié (webhook) quand un flux, un envoi Discord ou une étape du passage plante.

### Pertinence IA (Gemini)
- Chaque nouvel article est noté de 1 à 10 selon le **contexte de pertinence** propre à sa catégorie, et reçoit 1 à 3 mots-clés. Les articles ≥ 8 sont marqués 🔥.
- **Boutons 👍/👎** sous les articles 🔥 : un clic ajoute les mots-clés de l'article aux `keywords` (👍) ou `exclude_keywords` (👎) du flux, et journalise le retour.
- **Suggestions de contexte** (hebdo) : dès qu'une catégorie a accumulé 5+ retours, l'IA propose une version affinée de son contexte de pertinence, avec boutons Appliquer / Ignorer sur Discord. Jamais appliqué automatiquement.
- **Briefing matinal** : un paragraphe factuel par catégorie (en français, même pour les sources anglophones), plus les cours du jour.
- **Top de la semaine** : les 15 articles les mieux notés, tous sujets confondus.

### Bourse
- Positions (ticker + libellé) rattachées à une catégorie, avec **historique de transactions** (achats/ventes) pour calculer parts détenues, PRU et performance depuis l'achat.
- Graphique par position (QuickChart) dans le digest quotidien + un embed de total du portefeuille.
- **Alertes de seuil** en séance : message dès qu'une position varie de ±3 % dans la journée (une seule alerte par sens et par jour).
- Résumé hebdo de la variation sur 7 jours.

### Sport
- Récap hebdo (dernier résultat + prochain match) de l'ASM Clermont Auvergne (salon `rugby`) et de la Chorale Roanne (salon `basket`), via TheSportsDB.

### Bot Discord
- `/recap` : les 10 articles les mieux notés des 3 derniers jours pour la catégorie du salon.
- `/cours [periode]` : cours et graphiques (jour / semaine / mois) des positions de la catégorie du salon.

### Administration (`/admin`)
- Gestion des catégories (salon Discord, couleur, contexte de pertinence), des flux (URL, mots-clés, activation) et des positions boursières / transactions.
- Page `/admin/stats` : volume d'articles, score moyen et retours 👍/👎 par catégorie sur 30 jours, flux les plus actifs.
- **Sécurité** : mot de passe haché (scrypt), invalidation de session au changement de mot de passe, verrouillage anti-bruteforce sur la connexion, garde-fou SSRF sur les URLs saisies et pollées, headers de sécurité (CSP, HSTS, anti-clickjacking).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + [shadcn/ui](https://ui.shadcn.com) (Base UI)
- [Supabase](https://supabase.com) (Postgres) pour la persistance
- [Vercel](https://vercel.com) pour l'hébergement ; Vercel Cron + GitHub Actions pour les tâches planifiées
- [rss-parser](https://www.npmjs.com/package/rss-parser) pour le parsing des flux
- [AI SDK](https://ai-sdk.dev) + Google Gemini (`gemini-3.5-flash-lite`) pour la notation, les résumés et les suggestions
- [discord-interactions](https://www.npmjs.com/package/discord-interactions) pour le bot (boutons + commandes slash)
- Alpha Vantage (cours), QuickChart (graphiques), TheSportsDB (sport)

## Tâches planifiées

Toutes les routes sont protégées par `Authorization: Bearer $CRON_SECRET` (`lib/cron-auth.ts`). Le plan Hobby de Vercel limite les crons à un passage par jour, d'où le complément GitHub Actions (`.github/workflows/`, secret `CRON_SECRET` côté dépôt).

| Route | Planification (UTC) | Déclencheur | Rôle |
|---|---|---|---|
| `/api/poll` | tous les jours 05:00 | Vercel Cron | Digests RSS, cours du jour, briefing, santé des flux |
| `/api/weekly-recap` | lundi 07:00 | Vercel Cron | Résumé hebdo des positions |
| `/api/sports-recap` | lundi 08:00 | GitHub Actions | Récap ASM / Chorale Roanne |
| `/api/relevance-suggestions` | lundi 09:00 | GitHub Actions | Suggestions de contexte de pertinence |
| `/api/stock-alert` | toutes les heures 07:00–16:00, lun–ven | GitHub Actions | Alertes de seuil boursier |
| `/api/weekly-top` | dimanche 18:00 | GitHub Actions | Top de la semaine |

Chaque workflow GitHub peut aussi être lancé à la main (`workflow_dispatch`).

## Discord

Deux mécanismes coexistent :

- **Bot** (`DISCORD_BOT_TOKEN`) : tous les messages de catégorie, briefing, bourse et sport sont postés par le bot dans le salon `discord_channel_id` de la catégorie — nécessaire pour les boutons interactifs. Le bot doit avoir accès en écriture à chaque salon.
- **Webhook** (`ALERTS_DISCORD_WEBHOOK_URL`) : uniquement pour les alertes techniques (échecs, santé des flux).

Les interactions (boutons, commandes slash) arrivent sur `POST /api/discord/interactions`, à renseigner comme *Interactions Endpoint URL* dans le portail développeur Discord ; la signature est vérifiée avec `DISCORD_PUBLIC_KEY`. Les commandes `/recap` et `/cours` sont enregistrées une fois pour toutes via l'API Discord (pas de script dans le dépôt).

## Développement local

```bash
npm install
npm run dev
```

Nécessite un fichier `.env.local` (non versionné, récupérable via `vercel env pull`) avec :

| Variable | Description |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Accès à la base Supabase |
| `POSTGRES_URL_NON_POOLING` | Connexion directe Postgres, utilisée par le script de migration |
| `CRON_SECRET` | Secret partagé pour authentifier les appels planifiés |
| `ADMIN_PASSWORD` | Mot de passe de secours tant qu'aucun mot de passe n'a été défini via le panel |
| `SESSION_SECRET` | Secret de signature des sessions |
| `ALERTS_DISCORD_WEBHOOK_URL` | Webhook Discord pour les alertes techniques (optionnel) |
| `DISCORD_BOT_TOKEN` | Token du bot, pour poster dans les salons |
| `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` | Vérification des interactions et identifiant de l'application |
| `BRIEFING_DISCORD_CHANNEL_ID` | Salon du briefing matinal, du top hebdo et des suggestions (optionnel) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Clé Gemini — sans elle, pas de notation (score neutre), ni briefing, ni suggestions |
| `ALPHA_VANTAGE_API_KEY` | Cours de bourse (offre gratuite : ~100 jours d'historique, 1 requête/s) |
| `STOCK_ALERT_THRESHOLD_PERCENT` | Seuil des alertes boursières en % (optionnel, défaut `3`) |

## Base de données

Les migrations SQL se trouvent dans `supabase/migrations/` (numérotées, appliquées dans l'ordre alphabétique). `npm run migrate` applique celles qui ne l'ont pas encore été, à la base désignée par `POSTGRES_URL_NON_POOLING` (lu depuis `.env.local`, sinon `.env`).

- Les migrations appliquées sont enregistrées dans la table `schema_migrations` : relancer le script ne rejoue rien, il est sans risque.
- Chaque fichier passe dans sa propre transaction : si une migration échoue, elle est annulée entièrement (ni DDL à moitié appliqué, ni ligne d'historique), on corrige le fichier et on relance.
- `npm run migrate -- --dry-run` affiche ce qui serait appliqué sans rien modifier.

Pour ajouter une migration : créer `supabase/migrations/00XX_description.sql` avec le numéro suivant, puis `npm run migrate`.

**Base créée avant le suivi des migrations** : le script refuse de tourner s'il trouve un schéma existant sans historique (rejouer `0001` échouerait). Marquer une fois pour toutes les migrations déjà présentes, sans les exécuter, puis relancer normalement :

```bash
npm run migrate -- --baseline 0018_position_transactions.sql
```

Toutes les tables ont RLS activé avec accès réservé au rôle `service_role` : l'appli n'utilise que la clé service côté serveur.

Tables principales : `categories`, `feeds`, `seen_items` (articles vus, avec score et mots-clés), `feedback_log`, `stock_positions`, `position_transactions`, `stock_price_history`, `stock_alerts_sent`, `admin_settings`, `login_attempts`.
