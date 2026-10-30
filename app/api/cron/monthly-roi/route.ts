import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { loadLiveSubscriptions, planForAuthUser } from '@/lib/planAudience';
import { planMonthlyPrice } from '@/lib/planPrice';
import { emailDedupeKey, monthKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { getCountryConfig, getRevenueSymbol } from '@/lib/countryConfig';
import { revenueRecoveredEstimate } from '@/lib/revenueModel';
import { logCronRun } from '@/lib/cronRuns';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PAID_PLANS = ['personal_pro', 'business', 'agency', 'enterprise'];

// Item 9: the canonical revenue model (lib/revenueModel → lib/scoring):
// recovered = gap(mentions at start) − gap(mentions now), lostShare =
// 1 − mentioned/responded. The old score-gain formula was a second model.

interface RoiEmailParams {
  name: string; monthLabel: string; monthName: string;
  startScore: number; currentScore: number; scoreChange: number;
  fixesApplied: number; platformsGained: number;
  // ax74: patients/customers recovered (estimated) — the wound-first flow
  // promises a monthly patients-recovered report; the email only ever
  // showed score change + estimated revenue.
  patientsRecovered: number; patientsLabel: string;
  revenue: number; revenueSymbol: string; chargeSymbol: string; price: number; roiDisplay: string;
}

function monthlyRoiHtml(p: RoiEmailParams): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 16px;">Your Rankall results for ${p.monthLabel}</h2>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${p.name}, here's what Rankall did for your business in ${p.monthName}:</p>
      <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
        <p style="font-size:34px;font-weight:900;color:#fff;margin:0;line-height:1;">
          <span style="color:#64748B;">${p.startScore}</span> <span style="color:#94A3B8;">→</span> <span style="color:${p.scoreChange >= 0 ? '#22C55E' : '#F87171'};">${p.currentScore}</span>
        </p>
        <p style="color:#CBD5E1;font-size:13px;margin:8px 0 0;">score, start → end of month</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#64748B;font-size:14px;">Fixes applied</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0F172A;font-size:14px;">${p.fixesApplied}</td></tr>
        <tr><td style="padding:8px 0;color:#64748B;font-size:14px;">Score change</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${p.scoreChange >= 0 ? '#059669' : '#DC2626'};font-size:14px;">${p.scoreChange >= 0 ? '+' : ''}${p.scoreChange} pts</td></tr>
        <tr><td style="padding:8px 0;color:#64748B;font-size:14px;">Platforms gained</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0F172A;font-size:14px;">${p.platformsGained}</td></tr>
        ${p.patientsRecovered > 0 ? `<tr><td style="padding:8px 0;color:#64748B;font-size:14px;">${p.patientsLabel} (estimated)</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669;font-size:14px;">+${p.patientsRecovered}</td></tr>` : ''}
      </table>
      ${p.revenue > 0 ? `<div style="background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <p style="font-size:14px;font-weight:700;color:#059669;margin:0 0 4px;">Estimated revenue impact: ${p.revenueSymbol}${p.revenue.toLocaleString()}/month</p>
        <p style="font-size:13px;color:#166534;margin:0;">Your Rankall investment: ${p.chargeSymbol}${p.price}/month${p.roiDisplay ? ` · Return on investment: ${p.roiDisplay}` : ''}</p>
      </div>` : ''}
      <a href="https://www.rankall.io/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;padding:13px 28px;font-weight:700;font-size:14px;">View full monthly report →</a>
    </div>`;
}

export async function GET(req: NextRequest) {
  // Fail closed: Bearer CRON_SECRET only (x-vercel-cron is spoofable, and an
  // unset secret must not open the route).
  // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
  const denied = cronAuthFailure(req);
  if (denied) return denied;
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, message: 'RESEND_API_KEY not set' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Test mode: send one representative email (US sample data) only to the given
  // address and return, without touching real users, dedup, or logging.
  const testEmail = new URL(req.url).searchParams.get('test_email');
  if (testEmail) {
    const cfg = getCountryConfig('US');
    const sample = revenueRecoveredEstimate({ mentionedBefore: 2, mentionedAfter: 5, industry: 'dentist', countryCode: 'US' });
    const revenue = sample?.revenue ?? 0;
    const html = monthlyRoiHtml({
      name: 'Test Business', monthLabel, monthName: now.toLocaleDateString('en-US', { month: 'long' }),
      startScore: 42, currentScore: 71, scoreChange: 29, fixesApplied: 3, platformsGained: 2,
      patientsRecovered: sample?.customers ?? 0,
      patientsLabel: 'Patients recovered',
      revenue, revenueSymbol: getRevenueSymbol(cfg), chargeSymbol: cfg.symbol, price: cfg.monthly,
      roiDisplay: revenue > 0 ? `${Math.round(revenue / cfg.monthly)}x` : '',
    });
    const testRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: testEmail, subject: `Your Rankall results for ${monthLabel}`, html }),
    }).catch(() => null);
    return NextResponse.json({ ok: true, test: true, sent_to: testEmail, delivered: testRes?.ok ?? false });
  }

  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  // Plan = subscriptions → app_metadata → free; never user_metadata.
  const liveSubs = await loadLiveSubscriptions(supabase);
  const roiKey = emailDedupeKey('monthly_roi', monthKey(now));

  let sent = 0;
  let failed = 0;
  for (const u of usersData?.users ?? []) {
    const plan = planForAuthUser(u, liveSubs);
    if (!PAID_PLANS.includes(plan) || !u.email) continue;

    // Dedup — one ROI email per calendar month: the key carries the month
    // ('monthly_roi:2026-10'); claimed right before the send below.
    const { data: existing } = await supabase.from('email_sequence_log')
      .select('id').eq('user_id', u.id).eq('trigger_event', roiKey).maybeSingle();
    if (existing) continue;

    const { data: latestScan } = await supabase.from('rankall_scans')
      .select('overall_score, mentioned_count, industry, country_code, user_business_name, input, created_at')
      .eq('user_id', u.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!latestScan) continue;

    // Score ~30 days ago: earliest scan on/after the 30-day mark, else the oldest.
    const { data: startScan } = await supabase.from('rankall_scans')
      .select('overall_score, mentioned_count').eq('user_id', u.id)
      .gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: true }).limit(1).maybeSingle();
    const startScore = Number(startScan?.overall_score) || Number(latestScan.overall_score) || 0;
    const currentScore = Number(latestScan.overall_score) || 0;
    const scoreChange = currentScore - startScore;

    const { count: fixesApplied } = await supabase.from('generated_fixes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id).eq('status', 'applied').gte('applied_at', monthStart.toISOString());

    // Only send if something actually happened this month.
    if (scoreChange === 0 && (fixesApplied ?? 0) === 0) continue;

    const { data: outcomes } = await supabase.from('verified_outcomes')
      .select('before_platforms_found, after_platforms_found, verified_at')
      .eq('user_id', u.id).gte('verified_at', monthStart.toISOString());
    const platformsGained = (outcomes ?? []).reduce((s, o) => s + Math.max(0, (o.after_platforms_found ?? 0) - (o.before_platforms_found ?? 0)), 0);

    const industry = (latestScan.industry as string) || 'local business';
    const countryCode = (latestScan.country_code as string) || 'US';
    const cfg = getCountryConfig(countryCode);
    const recovered = scoreChange > 0
      ? revenueRecoveredEstimate({
          mentionedBefore: typeof startScan?.mentioned_count === 'number' ? startScan.mentioned_count : null,
          mentionedAfter: typeof latestScan.mentioned_count === 'number' ? latestScan.mentioned_count : null,
          industry, countryCode,
        })
      : null;
    const revenue = recovered?.revenue ?? 0;
    // Checkout charges USD for every market: the investment line is the
    // user's own plan price from the US tier, in '$'.
    const usCfg = getCountryConfig('US');
    const price = planMonthlyPrice(plan as Parameters<typeof planMonthlyPrice>[0], usCfg).monthly;
    // Revenue figures are in LOCAL currency (avgCustomerValue is local). When
    // that isn't USD, revenue ÷ price is a cross-currency ratio, so show a
    // qualitative ROI instead of a bogus number.
    const revenueSymbol = getRevenueSymbol(cfg);
    const isGrowthMarket = cfg.currency !== 'USD' || revenueSymbol !== '$';
    const roiDisplay = revenue > 0
      ? (isGrowthMarket ? 'Strong positive return' : `${Math.round(revenue / price)}x`)
      : '';
    const name = (latestScan.user_business_name as string) || (u.user_metadata?.full_name as string) || u.email.split('@')[0];

    // ax74: patients/customers recovered — the customer term of the same
    // canonical estimate, without the currency conversion. Shown only on a
    // measured gain; a flat/negative month recovers nobody, claims nothing.
    const patientsRecovered = recovered?.customers ?? 0;
    const patientsLabel = industry === 'dentist' ? 'Patients recovered' : 'New customers recovered';

    const html = monthlyRoiHtml({
      name, monthLabel, monthName: now.toLocaleDateString('en-US', { month: 'long' }),
      startScore, currentScore, scoreChange, fixesApplied: fixesApplied ?? 0, platformsGained,
      patientsRecovered, patientsLabel,
      revenue, revenueSymbol, chargeSymbol: usCfg.symbol, price, roiDisplay,
    });

    // ax74: claim the month's row FIRST (upsert ignoreDuplicates, error
    // checked) and send only when this run created it; a failed send
    // releases the claim so the next run retries.
    // CAN-SPAM: never mail an unsubscribed / bounced address (lib/emailSuppression).
    if (await shouldSkipEmail({ email: u.email, userId: u.id }, 'weekly_report')) continue;
    const claim = await claimEmailSend(supabase, { userId: u.id, email: u.email, triggerEvent: roiKey });
    if (claim !== 'claimed') { if (claim === 'error') failed++; continue; }
    let sendOk = false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: u.email, subject: `Your Rankall results for ${monthLabel}`, html }),
      });
      sendOk = res.ok;
      if (!sendOk) console.error('[monthly-roi] Resend failed:', u.id, await res.text().catch(() => ''));
    } catch (e) {
      console.error('[monthly-roi] Resend error:', u.id, e);
    }
    if (!sendOk) { failed++; await releaseEmailClaim(supabase, u.id, roiKey); continue; }

    sent++;
    await new Promise((r) => setTimeout(r, 400));
  }

  await logCronRun(supabase, { job: 'monthly-roi', status: failed > 0 ? (sent > 0 ? 'partial' : 'failed') : 'ok', sent, failed });
  return NextResponse.json({ ok: true, sent, failed });
}
