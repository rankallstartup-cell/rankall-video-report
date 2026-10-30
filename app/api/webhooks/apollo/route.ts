import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { safeEqual } from '@/lib/apiAuth';
import { resolvePublicReportUrl } from '@/lib/publicShare';
import { wasEmailedRecently } from '@/lib/outreachTargeting';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Fail CLOSED: with APOLLO_WEBHOOK_SECRET unset, a request with no
  // secret header compared undefined === undefined and was accepted.
  // Constant-time compare (safeEqual is false for empty/missing values).
  const expected = process.env.APOLLO_WEBHOOK_SECRET;
  if (!expected) {
    console.error('[apollo webhook] APOLLO_WEBHOOK_SECRET is not set — rejecting');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  const secret = req.headers.get('x-apollo-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  if (!safeEqual(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    name: business_name,
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    country,
    industry,
    id: apollo_contact_id,
  } = body;

  const owner_name = [first_name, last_name].filter(Boolean).join(' ') || business_name;
  const country_code = country?.toUpperCase()?.slice(0, 2) ?? 'US';
  const fullCity = [city, state].filter(Boolean).join(', ');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Dedupe: if this prospect is already in the pipeline, don't re-scan or re-enrol.
  if (email) {
    const { data: existing } = await supabase
      .from('outreach_targets')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({ ok: true, deduped: true, target_id: existing.id });
    }
  }

  // #9 targeting quality: never enrol a business emailed in the last
  // 90 days (dashboard sends + sequence sends, matched by business + city;
  // exact-email fallback when no city). Checked BEFORE the scan so a
  // skipped prospect never burns scan credits. Fail-open on lookup failure.
  const recentCheck = await wasEmailedRecently(supabase, business_name, fullCity, { email: email ?? undefined });
  if (recentCheck.blocked) {
    console.warn(`[apollo webhook] skipping ${business_name} (${fullCity}): recently emailed (${recentCheck.source}, ${recentCheck.lastSentAt})`);
    return NextResponse.json({ ok: true, skipped: true, reason: 'recently_emailed', lastSentAt: recentCheck.lastSentAt, source: recentCheck.source });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rankall.io';

  // Trigger scan via internal API
  const scanRes = await fetch(`${baseUrl}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `${business_name} ${fullCity}`, country_code }),
  });

  let scanId: string | null = null;
  let rankallScore: number | null = null;
  let competitorName: string | null = null;

  if (scanRes.ok) {
    const scanData = await scanRes.json();
    scanId = scanData.id ?? scanData.scan_id ?? null;
    rankallScore = scanData.score ?? null;
    competitorName = scanData.competitor_name ?? null;
  }

  const videoPageUrl = scanId ? `https://rankall.io/video/${scanId}` : null;
  // Outreach fix #1: store the prospect's own free report page (/r/<id>),
  // never the bare ?q= search URL. Null when there is no scan or the scan
  // is not eligible for public share — the sequence cron re-resolves from
  // the scan at send time and skips {{report_url}} touches without one.
  const reportUrl = await resolvePublicReportUrl(scanId, baseUrl);

  // Store in outreach_targets
  const { data: target } = await supabase.from('outreach_targets').insert({
    business_name,
    owner_name,
    email,
    phone,
    city: fullCity,
    country_code,
    industry,
    apollo_contact_id,
    scan_id: scanId,
    rankall_score: rankallScore,
    competitor_name: competitorName,
    video_url: videoPageUrl,
    report_url: reportUrl,
    status: 'pending',
  }).select().single();

  // Kick off personalised audio generation (best-effort; the Day-1 email links to
  // the audio walkthrough page which renders regardless once the scan exists).
  if (scanId) {
    // b009: generate-video-email requires `Bearer ${CRON_SECRET}` (401
    // otherwise). The old call sent only Content-Type, so the video job
    // never started from this path — every webhook video call 401'd.
    fetch(`${baseUrl}/api/outreach/generate-video-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ scan_id: scanId, country_code }),
    }).catch(() => {});
  }

  // Schedule the Day-1 touch immediately so the next sequence-cron run sends it.
  if (target?.id) {
    try {
      await supabase.from('outreach_sequence_log').insert({
        target_id: target.id,
        sequence_day: 1,
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      });
    } catch { /* non-fatal — cron only sends what got scheduled */ }
  }

  return NextResponse.json({
    ok: true,
    rankall_score: rankallScore,
    competitor_name: competitorName,
    video_url: videoPageUrl,
    report_url: reportUrl,
    target_id: target?.id ?? null,
    day1_scheduled: !!target?.id,
  });
}
