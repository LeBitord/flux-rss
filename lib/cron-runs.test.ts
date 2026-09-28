import { describe, expect, it, vi } from "vitest";

// cron-runs imports the Supabase client at module load; stub it so the pure health
// evaluation can be tested without env vars.
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: () => ({}) }));

const { evaluateCronHealth } = await import("@/lib/cron-runs");

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-28T08:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function statusOf(job: string, rows: Parameters<typeof evaluateCronHealth>[0]) {
  return evaluateCronHealth(rows, NOW).find((s) => s.job === job)!;
}

describe("evaluateCronHealth", () => {
  it("doesn't flag a job that has never run yet", () => {
    expect(statusOf("poll", []).problem).toBeNull();
  });

  it("is healthy when the last success is within the window", () => {
    const row = {
      job: "poll",
      last_run_at: ago(3 * HOUR),
      last_success_at: ago(3 * HOUR),
      last_error: null,
      last_error_at: null,
    };
    expect(statusOf("poll", [row]).problem).toBeNull();
  });

  it("flags a job whose last success is too old", () => {
    const row = {
      job: "poll",
      last_run_at: ago(30 * HOUR),
      last_success_at: ago(30 * HOUR),
      last_error: null,
      last_error_at: null,
    };
    expect(statusOf("poll", [row]).problem).toMatch(/aucun passage réussi/);
  });

  it("flags a job whose latest run failed, even if recent", () => {
    const row = {
      job: "poll",
      last_run_at: ago(1 * HOUR),
      last_success_at: ago(25 * HOUR),
      last_error: "boom",
      last_error_at: ago(1 * HOUR),
    };
    expect(statusOf("poll", [row]).problem).toMatch(/boom/);
  });

  it("clears once a success follows the failure", () => {
    const row = {
      job: "poll",
      last_run_at: ago(1 * HOUR),
      last_success_at: ago(1 * HOUR),
      last_error: "boom",
      last_error_at: ago(5 * HOUR),
    };
    expect(statusOf("poll", [row]).problem).toBeNull();
  });

  it("tolerates the weekend gap for hourly stock alerts", () => {
    const row = {
      job: "stock-alert",
      last_run_at: ago(64 * HOUR), // Friday 16:00 → Monday 08:00
      last_success_at: ago(64 * HOUR),
      last_error: null,
      last_error_at: null,
    };
    expect(statusOf("stock-alert", [row]).problem).toBeNull();
  });
});
