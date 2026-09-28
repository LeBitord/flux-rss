import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

const HOUR_MS = 60 * 60 * 1000;

// How long each scheduled job may go without a successful run before it's considered
// stuck — its schedule period plus some slack for a late or retried trigger.
export const CRON_JOBS = {
  poll: { label: "Passage quotidien", maxAgeMs: 26 * HOUR_MS },
  // Runs twice a day even when no category opted in (it then returns immediately).
  "poll-frequent": { label: "Passages de la journée", maxAgeMs: 26 * HOUR_MS },
  "weekly-recap": { label: "Résumé hebdo des positions", maxAgeMs: 8 * 24 * HOUR_MS },
  "sports-recap": { label: "Récap sportif", maxAgeMs: 8 * 24 * HOUR_MS },
  "sports-results": { label: "Résultats sportifs du soir", maxAgeMs: 26 * HOUR_MS },
  "relevance-suggestions": { label: "Suggestions de contexte", maxAgeMs: 8 * 24 * HOUR_MS },
  "weekly-top": { label: "Top de la semaine", maxAgeMs: 8 * 24 * HOUR_MS },
  // Hourly on weekdays only: Friday 16:00 → Monday 07:00 is the longest normal gap.
  "stock-alert": { label: "Alertes boursières", maxAgeMs: 72 * HOUR_MS },
} as const;

export type CronJob = keyof typeof CRON_JOBS;

export type CronRunRow = {
  job: string;
  last_run_at: string;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type CronJobStatus = {
  job: CronJob;
  label: string;
  row: CronRunRow | null;
  problem: string | null;
};

// A job with no row yet (never ran since tracking was added) isn't flagged — a weekly
// job would otherwise raise a false alarm for up to a week after deployment.
export function evaluateCronHealth(rows: CronRunRow[], now: number = Date.now()): CronJobStatus[] {
  const rowByJob = new Map(rows.map((r) => [r.job, r]));
  return (Object.keys(CRON_JOBS) as CronJob[]).map((job) => {
    const { label, maxAgeMs } = CRON_JOBS[job];
    const row = rowByJob.get(job) ?? null;
    let problem: string | null = null;
    if (row) {
      const lastSuccess = row.last_success_at ? new Date(row.last_success_at).getTime() : null;
      const lastError = row.last_error_at ? new Date(row.last_error_at).getTime() : null;
      if (lastError !== null && (lastSuccess === null || lastError > lastSuccess)) {
        problem = `dernier passage en échec : ${row.last_error ?? "erreur inconnue"}`;
      } else if (lastSuccess === null || now - lastSuccess > maxAgeMs) {
        problem = "aucun passage réussi dans les délais prévus";
      }
    }
    return { job, label, row, problem };
  });
}

async function recordCronRun(job: CronJob, error: string | null) {
  const now = new Date().toISOString();
  const { error: dbError } = await supabaseAdmin()
    .from("cron_runs")
    .upsert(
      error
        ? { job, last_run_at: now, last_error: error.slice(0, 500), last_error_at: now }
        : { job, last_run_at: now, last_success_at: now },
      { onConflict: "job" },
    );
  // Never let bookkeeping break the job itself (e.g. table not migrated yet).
  if (dbError) console.error(`Failed to record cron run for ${job}:`, dbError.message);
}

// Wraps a scheduled route: checks the cron secret, runs the job, and records the outcome
// in cron_runs so /api/cron-health can spot a job that silently stopped running.
export function cronHandler(job: CronJob, run: () => Promise<Response>) {
  return async function GET(req: Request): Promise<Response> {
    if (!isAuthorizedCronRequest(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      const res = await run();
      await recordCronRun(job, res.ok ? null : `HTTP ${res.status}`);
      return res;
    } catch (err) {
      await recordCronRun(job, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
