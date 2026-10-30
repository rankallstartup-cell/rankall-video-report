import type { SupabaseClient } from '@supabase/supabase-js';

// ax74: one shared run-log for every cron. A cron that fails must be
// VISIBLE (admin health reads this table) — not just a console.error +
// 500 nobody sees. Best-effort: if the table doesn't exist yet (Nandish
// hasn't run sql/cron_runs.sql), the insert fails and is swallowed —
// the cron itself must never fail because its own logging failed.
export async function logCronRun(
  sb: SupabaseClient,
  run: { job: string; status: 'ok' | 'partial' | 'failed'; sent?: number; failed?: number; error?: string | null },
): Promise<void> {
  try {
    await sb.from('cron_runs').insert({
      job: run.job,
      status: run.status,
      sent: run.sent ?? 0,
      failed: run.failed ?? 0,
      error: run.error ?? null,
    });
  } catch {
    /* cron_runs table not created yet — see sql/cron_runs.sql */
  }
}
