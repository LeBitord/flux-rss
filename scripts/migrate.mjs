import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const migrationsDir = join(rootDir, "supabase", "migrations");

// .env.local first (what `vercel env pull` writes), .env as fallback.
config({ path: [join(rootDir, ".env.local"), join(rootDir, ".env")], quiet: true });

const rawConnectionString =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!rawConnectionString) {
  console.error("Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL in env");
  process.exit(1);
}

// The Supabase URL carries ?sslmode=require, which current pg versions treat as
// verify-full AND let override the `ssl` option below — so the connection fails on
// Supabase's own (non-public) CA. Strip it and configure TLS explicitly instead.
const connectionUrl = new URL(rawConnectionString);
connectionUrl.searchParams.delete("sslmode");
const connectionString = connectionUrl.toString();

// Supabase root CA (Dashboard → Database → SSL Configuration → Download certificate).
// Public certificate, fine to commit. With it the server certificate is fully verified;
// without it the connection is still encrypted but open to a man-in-the-middle.
const caPath = join(rootDir, "supabase", "prod-ca-2021.crt");
let ssl;
if (existsSync(caPath)) {
  ssl = { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true };
} else {
  console.warn(
    `Warning: ${caPath} not found — TLS certificate NOT verified. ` +
      "Download it from the Supabase dashboard to enable verification.",
  );
  ssl = { rejectUnauthorized: false };
}

// Usage:
//   node scripts/migrate.mjs                    apply every migration not yet recorded
//   node scripts/migrate.mjs --dry-run          list what would be applied, change nothing
//   node scripts/migrate.mjs --baseline <file>  record every migration up to and including
//                                               <file> as applied WITHOUT running it (one-off,
//                                               for a database migrated before tracking existed)
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baselineIndex = args.indexOf("--baseline");
const baseline = baselineIndex >= 0 ? args[baselineIndex + 1] : null;
if (baselineIndex >= 0 && !baseline) {
  console.error("--baseline requires a migration file name, e.g. 0018_position_transactions.sql");
  process.exit(1);
}

const client = new Client({ connectionString, ssl });

async function main() {
  await client.connect();

  const { rows: tracking } = await client.query(
    "select to_regclass('public.schema_migrations') is not null as exists",
  );
  const trackingExists = tracking[0].exists;

  // --dry-run must not touch the database at all, so the tracking table is only created
  // for real runs. RLS on with no policy: only service_role / direct connections can touch
  // it, like the other tables — it must not be readable through the public PostgREST API.
  if (!trackingExists && !dryRun) {
    await client.query(`
      create table schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
      alter table schema_migrations enable row level security;
    `);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set();
  if (trackingExists) {
    const { rows } = await client.query("select name from schema_migrations");
    for (const r of rows) applied.add(r.name);
  }

  if (baseline) {
    if (!files.includes(baseline)) {
      throw new Error(`Unknown migration "${baseline}" — expected one of:\n  ${files.join("\n  ")}`);
    }
    const toRecord = files.slice(0, files.indexOf(baseline) + 1).filter((f) => !applied.has(f));
    for (const file of toRecord) {
      console.log(`${dryRun ? "Would mark" : "Marking"} ${file} as applied (not executed)`);
      if (!dryRun) {
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
      }
    }
    console.log(
      dryRun
        ? `Dry run — ${toRecord.length} migration(s) would be recorded, nothing written.`
        : `Baseline done — ${toRecord.length} migration(s) recorded.`,
    );
    return;
  }

  // Tracking table is empty but the schema clearly exists: this database was migrated
  // before tracking was added. Replaying 0001 would fail (create policy isn't idempotent)
  // and guessing which files already ran is unsafe — make the baseline explicit.
  if (applied.size === 0) {
    const { rows: existing } = await client.query(
      "select to_regclass('public.categories') is not null as exists",
    );
    if (existing[0].exists) {
      console.error(
        "This database already has a schema but no migration history.\n" +
          "Record the migrations it already has, then re-run, e.g.:\n" +
          "  node scripts/migrate.mjs --baseline 0018_position_transactions.sql",
      );
      process.exitCode = 1;
      return;
    }
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("Database is up to date.");
    return;
  }

  for (const file of pending) {
    if (dryRun) {
      console.log(`Would apply ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    // One transaction per file: a failing migration leaves neither half-applied DDL
    // nor a history row behind, so fixing it and re-running just works.
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
    }
    console.log(`Applied ${file}`);
  }
}

main()
  .catch((err) => {
    // Connection failures surface as an AggregateError with an EMPTY message (one attempt
    // per resolved IP) — print the per-address causes, or the run fails silently.
    const causes = err.errors?.map((e) => `  - ${e.message}`).join("\n");
    console.error(err.message || err.code || String(err));
    if (causes) console.error(causes);
    if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
      console.error("Postgres unreachable — is outbound port 5432 blocked on this network?");
    }
    process.exitCode = 1;
  })
  .finally(() => client.end());
