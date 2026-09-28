import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { evaluateCronHealth, type CronRunRow } from "@/lib/cron-runs";

export const maxDuration = 30;

// Watchdog for the other scheduled jobs: alerts on the failure webhook when one has
// stopped succeeding. Triggered daily from GitHub Actions — deliberately not from Vercel
// Cron, so a Vercel-side scheduling problem (which would stop /api/poll) still gets caught.
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabaseAdmin().from("cron_runs").select("*");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const statuses = evaluateCronHealth((data ?? []) as CronRunRow[]);
  const problems = statuses.filter((s) => s.problem);

  const webhookUrl = process.env.ALERTS_DISCORD_WEBHOOK_URL;
  if (webhookUrl && problems.length > 0) {
    const content =
      `⏰ **Flux RSS — ${problems.length} tâche(s) planifiée(s) en panne**\n` +
      problems.map((p) => `• **${p.label}** (\`/api/${p.job}\`) — ${p.problem}`).join("\n");
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      });
    } catch (err) {
      console.error("Failed to send cron health alert:", err);
    }
  }

  return Response.json({
    ok: problems.length === 0,
    problems: problems.map((p) => ({ job: p.job, problem: p.problem })),
  });
}
