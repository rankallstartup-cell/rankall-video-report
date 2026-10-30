// app/api/cron/outreach-pipeline/route.ts
// Nightly prospect pipeline (outreach improvement #5). Registered in
// vercel.json: 0 2 * * * (nightly). CRON_SECRET-authenticated like every
// other cron (fail-closed via cronAuthFailure).
//
// Each night: take the next unscanned prospects (outreach_targets +
// outreach_intelligence + admin-seeded), scan each via the EXISTING
// /api/outreach/run-scan path, enrol each into the Day-1 sequence.
// Spend is hard-capped (OUTREACH_PIPELINE_NIGHTLY_MAX, default 10) and every
// attempt is logged to outreach_pipeline_log.

import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { logCronRun } from '@/lib/cronRuns';
import {
  createSupabasePipelineDb,
  dryRunNightlyPipeline,
  runNightlyPipeline,
  scanProspectViaRunScan,
} from '@/lib/outreachPipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rankall.io';
  const cronSecret = process.env.CRON_SECRET ?? '';

  // ?dryRun=1 — report what tonight's run WOULD do. No scans, no enrolments,
  // no writes. Safe to call on staging before the first live run.
  if (req.nextUrl.searchParams.get('dryRun') === '1') {
    const dry = await dryRunNightlyPipeline(createSupabasePipelineDb(sb));
    return NextResponse.json(dry);
  }

  const result = await runNightlyPipeline({
    db: createSupabasePipelineDb(sb),
    scanProspect: (c) => scanProspectViaRunScan(baseUrl, cronSecret, c),
    // Best-effort video kick-off, same as the Apollo webhook (which sends
    // Bearer CRON_SECRET — generate-video-email requires it).
    kickVideo: (scanId, countryCode) => {
      fetch(`${baseUrl}/api/outreach/generate-video-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ scan_id: scanId, country_code: countryCode }),
      }).catch(() => {});
    },
  });

  const status = result.failed > 0 && result.scanned === 0 && result.cached === 0 && result.enrolledOnly === 0
    ? 'failed'
    : result.failed > 0
      ? 'partial'
      : 'ok';
  await logCronRun(sb, {
    job: 'outreach-pipeline',
    status,
    sent: result.scanned + result.cached + result.enrolledOnly,
    failed: result.failed,
    error: result.capReached ? 'cap reached' : result.timeBudgetHit ? 'time budget hit' : null,
  });

  return NextResponse.json(result);
}
