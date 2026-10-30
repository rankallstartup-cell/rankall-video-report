import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// Phase 16: server-side system health check (env vars + DB + core logic).
// Admin-only. Returns one row per service with pass/warn/fail + a fix hint.
type Status = 'pass' | 'warn' | 'fail';
interface HealthCheck { name: string; status: Status; message: string; fix: string | null }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  // Verify admin via the cookie session.
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const checks: HealthCheck[] = [];
  const sb = admin();

  // 1: Supabase connection
  try {
    const { error } = await sb.from('rankall_scans').select('id').limit(1);
    checks.push({
      name: 'Supabase Connection',
      status: error ? 'fail' : 'pass',
      message: error ? error.message : 'Connected successfully',
      fix: error ? 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel' : null,
    });
  } catch (e) {
    checks.push({ name: 'Supabase Connection', status: 'fail', message: String(e), fix: 'Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY' });
  }

  // 2: Anthropic API key
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  checks.push({
    name: 'Anthropic API Key',
    status: anthropicKey ? 'pass' : 'fail',
    message: anthropicKey ? `Key present (length: ${anthropicKey.length})` : 'ANTHROPIC_API_KEY not set',
    fix: anthropicKey ? null : 'Add ANTHROPIC_API_KEY to Vercel Environment Variables',
  });

  // 3: Resend email key
  const resendKey = process.env.RESEND_API_KEY;
  checks.push({
    name: 'Resend Email Key',
    status: resendKey ? 'pass' : 'fail',
    message: resendKey ? 'Key present' : 'RESEND_API_KEY not set',
    fix: resendKey ? null : 'Add RESEND_API_KEY from resend.com to Vercel',
  });

  // 4: SerpAPI key
  const serpKey = process.env.SERPAPI_KEY;
  checks.push({
    name: 'SerpAPI Key',
    status: serpKey ? 'pass' : 'fail',
    message: serpKey ? 'Key present — Knowledge Panel detection active' : 'SERPAPI_KEY not set',
    fix: serpKey ? null : 'Add SERPAPI_KEY from serpapi.com. Required for Knowledge Panel detection (+25 pts per scan)',
  });

  // 5: ElevenLabs
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoice = process.env.ELEVENLABS_VOICE_ID;
  checks.push({
    name: 'ElevenLabs Audio',
    status: elevenKey && elevenVoice ? 'pass' : elevenKey ? 'warn' : 'fail',
    message: elevenKey && elevenVoice ? 'API key and voice ID present' : elevenKey ? 'API key present but no ELEVENLABS_VOICE_ID' : 'ELEVENLABS_API_KEY not set',
    fix: !elevenKey ? 'Add ELEVENLABS_API_KEY from elevenlabs.io to Vercel' : !elevenVoice ? 'Add ELEVENLABS_VOICE_ID from elevenlabs.io Voices to Vercel' : null,
  });

  // 6: Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  checks.push({
    name: 'Stripe Payments',
    status: stripeKey && stripeWebhook ? 'pass' : 'warn',
    message: stripeKey ? (stripeWebhook ? 'Stripe ready — payments active' : 'Stripe key present but no webhook secret') : 'Stripe not configured — showing waitlist mode',
    fix: !stripeKey ? 'Add STRIPE_SECRET_KEY after TIN/EIN arrives. Pricing shows waitlist until then.' : !stripeWebhook ? 'Add STRIPE_WEBHOOK_SECRET from Stripe webhook settings' : null,
  });

  // 7: Sentry
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  checks.push({
    name: 'Sentry Error Tracking',
    status: sentryDsn ? 'pass' : 'warn',
    message: sentryDsn ? 'Sentry active — errors tracked' : 'NEXT_PUBLIC_SENTRY_DSN not set',
    fix: sentryDsn ? null : 'Add Sentry DSN from sentry.io to Vercel. Optional but recommended for production monitoring.',
  });

  // 8: PostHog
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  checks.push({
    name: 'PostHog Analytics',
    status: posthogKey ? 'pass' : 'warn',
    message: posthogKey ? 'PostHog active — analytics tracking' : 'NEXT_PUBLIC_POSTHOG_KEY not set',
    fix: posthogKey ? null : 'Add PostHog key from posthog.com to Vercel. Optional but recommended for user analytics.',
  });

  // 9: CRON secret — presence + strength only. Never compare against (or
  // print) a hardcoded value: a secret in source is not a secret.
  const cronSecret = process.env.CRON_SECRET;
  const cronStrong = !!cronSecret && cronSecret.length >= 32;
  checks.push({
    name: 'CRON Secret',
    status: cronStrong ? 'pass' : cronSecret ? 'warn' : 'fail',
    message: cronSecret ? (cronStrong ? 'CRON_SECRET set' : 'CRON_SECRET is set but short (<32 chars)') : 'CRON_SECRET not set',
    fix: cronStrong ? null : 'Set CRON_SECRET to a long random value (e.g. `openssl rand -hex 32`) in Vercel Environment Variables',
  });

  // 10: Slack webhook
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  checks.push({
    name: 'Slack Alerts',
    status: slackUrl ? 'pass' : 'warn',
    message: slackUrl ? 'Slack webhook configured — hot lead alerts active' : 'SLACK_WEBHOOK_URL not set',
    fix: slackUrl ? null : 'Add Slack webhook URL for hot lead notifications. Create at api.slack.com/apps',
  });

  // 11: Supabase service role
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  checks.push({
    name: 'Supabase Service Role',
    status: serviceRole ? 'pass' : 'fail',
    message: serviceRole ? 'Service role key present — admin operations enabled' : 'SUPABASE_SERVICE_ROLE_KEY not set',
    fix: serviceRole ? null : 'Add service role key from Supabase → Settings → API. Required for usage tracking, scan cache, and admin operations.',
  });

  // 12: Scan route health
  try {
    const base = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.rankall.io';
    const testRes = await fetch(`${base}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'health check test', healthCheck: true }),
      signal: AbortSignal.timeout(5000),
    });
    checks.push({
      name: 'Scan Route Health',
      status: testRes.status !== 500 ? 'pass' : 'fail',
      message: `Scan route responding: HTTP ${testRes.status}`,
      fix: testRes.status === 500 ? 'Check scan route logs in Vercel for errors' : null,
    });
  } catch (e) {
    checks.push({ name: 'Scan Route Health', status: 'fail', message: `Scan route unreachable: ${String(e)}`, fix: 'Check Vercel deployment and ANTHROPIC_API_KEY' });
  }

  // 13: Required DB tables
  const requiredTables = ['rankall_scans', 'usage_tracking', 'scan_cache', 'verified_outcomes', 'outreach_domain_health', 'do_not_contact', 'linkedin_queue', 'content_pieces', 'product_tour', 'ai_inbox_searches'];
  const tableChecks = await Promise.all(requiredTables.map(async (table) => {
    try {
      const { error } = await sb.from(table).select('id').limit(1);
      return { table, exists: !error };
    } catch {
      return { table, exists: false };
    }
  }));
  const missingTables = tableChecks.filter((t) => !t.exists).map((t) => t.table);
  checks.push({
    name: 'Database Tables',
    status: missingTables.length === 0 ? 'pass' : 'fail',
    message: missingTables.length === 0 ? `All ${requiredTables.length} required tables present` : `Missing: ${missingTables.join(', ')}`,
    fix: missingTables.length > 0 ? `Run migrations for missing tables: ${missingTables.join(', ')}` : null,
  });

  // 14: Country detection
  try {
    const { detectCountryFromQuery } = await import('@/lib/countryDetection');
    const gbResult = detectCountryFromQuery('best dentist in London');
    const usResult = detectCountryFromQuery('best dentist in Chicago');
    const countryOk = gbResult === 'GB' && usResult === 'US';
    checks.push({
      name: 'Country Detection',
      status: countryOk ? 'pass' : 'fail',
      message: countryOk ? 'London→GB ✓ Chicago→US ✓' : `London→${gbResult} Chicago→${usResult}`,
      fix: !countryOk ? 'Check lib/countryDetection.ts city mapping' : null,
    });
  } catch (e) {
    checks.push({ name: 'Country Detection', status: 'fail', message: String(e), fix: 'Check lib/countryDetection.ts' });
  }

  // 15: normalizePlan
  try {
    const { normalizePlan } = await import('@/lib/planConfig');
    const tests: [string | null, string][] = [
      ['local_pro', 'business'], ['starter', 'personal_pro'], ['personal_pro', 'personal_pro'], ['agency_seo', 'agency'], [null, 'free'], ['business', 'business'],
    ];
    const failed = tests.filter(([input, expected]) => normalizePlan(input) !== expected);
    checks.push({
      name: 'Plan Normalization',
      status: failed.length === 0 ? 'pass' : 'fail',
      message: failed.length === 0 ? 'All plan mappings correct' : `Failed: ${failed.map(([i, e]) => `${i}→${e}`).join(', ')}`,
      fix: failed.length > 0 ? 'Check normalizePlan() in lib/planConfig.ts' : null,
    });
  } catch (e) {
    checks.push({ name: 'Plan Normalization', status: 'fail', message: String(e), fix: 'Check lib/planConfig.ts' });
  }

  // 16: ax74 — cron freshness. Each cron logs its run outcome to
  // cron_runs (sql/cron_runs.sql); a stale or failed last run is
  // visible here instead of only a console.error + 500 nobody saw.
  // If the table doesn't exist yet, report 'not configured', not an error.
  try {
    const { data: runs, error: runsErr } = await sb
      .from('cron_runs')
      .select('job, status, sent, failed, error, ran_at')
      .order('ran_at', { ascending: false })
      .limit(200);
    if (runsErr) throw runsErr;
    const latestByJob = new Map<string, (typeof runs)[number]>();
    for (const r of runs ?? []) {
      if (!latestByJob.has(r.job)) latestByJob.set(r.job, r);
    }
    const expected: Array<{ job: string; label: string; maxAgeDays: number }> = [
      { job: 'trigger-rescans', label: 'Trigger Rescans (daily)', maxAgeDays: 2 },
      { job: 'rescan-weekly', label: 'Verification Rescans', maxAgeDays: 2 },
      { job: 'weekly-visibility-report', label: 'Weekly Report (Monday)', maxAgeDays: 8 },
      { job: 'monthly-roi', label: 'Monthly ROI Report', maxAgeDays: 35 },
      { job: 'score-decay-warning', label: 'Score Decay Warnings (weekly)', maxAgeDays: 8 },
    ];
    for (const e of expected) {
      const last = latestByJob.get(e.job);
      if (!last) {
        checks.push({ name: `Cron: ${e.label}`, status: 'warn', message: 'No run logged yet', fix: 'Wait for the next scheduled run, or check Vercel cron' });
        continue;
      }
      const ageDays = (Date.now() - new Date(last.ran_at).getTime()) / 86400000;
      const stale = ageDays > e.maxAgeDays;
      checks.push({
        name: `Cron: ${e.label}`,
        status: last.status === 'failed' || stale ? 'fail' : last.status === 'partial' ? 'warn' : 'pass',
        message: `Last run ${new Date(last.ran_at).toLocaleString('en-US')}: ${last.status} (sent ${last.sent}, failed ${last.failed})${stale ? ` — stale, expected within ${e.maxAgeDays}d` : ''}${last.error ? ` — ${String(last.error).slice(0, 120)}` : ''}`,
        fix: last.status === 'failed' || stale ? 'Check Vercel cron logs for this job' : null,
      });
    }
  } catch {
    checks.push({ name: 'Cron: run history', status: 'warn', message: 'cron_runs table not configured — cron runs are not being logged', fix: 'Run sql/cron_runs.sql in the Supabase SQL editor' });
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;

  return NextResponse.json({
    checks,
    summary: { total: checks.length, passed, warned, failed, healthy: failed === 0 },
    timestamp: new Date().toISOString(),
  });
}
