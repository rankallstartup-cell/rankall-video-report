import { generateUnsubscribeToken } from '@/lib/outreachGuard';
import { cronAuthFailure } from '@/lib/cronAuth';
import { NextRequest, NextResponse, after } from 'next/server';

export const dynamic = 'force-dynamic';

import { saveScan, getSupabaseAdmin } from '@/lib/supabase';
// P0a: server-side route — service_role (bypasses RLS); no user session here.
const supabase = getSupabaseAdmin();
import { verifyOutcome } from '@/lib/verifiedOutcomes';
import { autoLabelScan } from '@/lib/autoLabel';
import { calculateOverallScore, calculateRecommendationShare, type PlatformStatus } from '@/lib/scoring';

// Match /api/scan: cap the whole platform sweep at 45s, returning partial results.
const MASTER_TIMEOUT_MS = 45000;
import { analyseAllPlatforms, isValidCompetitor } from '@/lib/analyser-ml';
import { generateQueryVariations, computeBasketHash, sanitizeQueryBasket } from '@/lib/queryVariations';
import { ACTIVE_PLATFORMS as PLATFORMS, callPlatform, resetStaggerCounters } from '@/lib/platforms';
import { detectTrustSignals } from '@/lib/trustServer';
import { enrichBusinessData, getTrustedStoredGoogle, type EnrichmentData } from '@/lib/enrichment';
import { detectIntent } from '@/lib/queries';
import { inferCountryFromText } from '@/lib/countryConfig';
import { outcomeSentence } from '@/lib/scoreFraming';
import { logCronRun } from '@/lib/cronRuns';
import { resolveRescanWebsite, competitorNameList } from '@/lib/rescanTrust';
import { shouldSkipEmail } from '@/lib/emailSuppression';

// b0fh: trust inputs carried over from the original scan so the weekly
// trust score is measured on the same basis (website + verified data).
type TrustCarryOver = {
  websiteUrl?: string;
  websiteVerified?: boolean;
  industry?: string;
  enrichment?: { google?: EnrichmentData['google'] | null; serpData?: Record<string, boolean | undefined> | null; reddit?: EnrichmentData['reddit'] | null } | null;
};

async function runScan(input: string, countryCode: string = 'US', lockedQueries?: string[] | null, trustCtx: TrustCarryOver = {}) {
  // P0c: reuse the original scan's basket — never regenerate. A new basket
  // would make the weekly score incomparable with the scan history.
  // The stored basket is re-validated and capped at the normal per-scan
  // count — rows saved before /api/scan stopped trusting client baskets may
  // hold an oversized / attacker-chosen list.
  const queries = sanitizeQueryBasket(lockedQueries) ?? generateQueryVariations(input);
  const basketHash = computeBasketHash(queries);
  resetStaggerCounters();

  // Fire all queries across all platforms, accumulating LIVE into platformMap so
  // the 45s master timeout (identical to /api/scan) returns partial results rather
  // than waiting on a slow platform. Same platform-inclusion rules as a fresh scan.
  const platformMap = new Map<string, { platform: string; weight: number; responses: string[]; error: string | null }>();
  PLATFORMS.forEach(p => platformMap.set(p.name, { platform: p.name, weight: p.weight, responses: [], error: null }));

  const jobs = PLATFORMS.flatMap(platform => {
    const pQueries = platform.maxQueries ? queries.slice(0, platform.maxQueries) : queries;
    return pQueries.map(query =>
      callPlatform(platform, query)
        .then(response => { if (response) platformMap.get(platform.name)?.responses.push(response); })
        .catch(err => { const e = platformMap.get(platform.name); if (e && !e.error) e.error = err?.message || 'Failed'; })
    );
  });

  await Promise.race([
    Promise.allSettled(jobs),
    new Promise<void>(resolve => setTimeout(resolve, MASTER_TIMEOUT_MS)),
  ]);

  const platformResults = Array.from(platformMap.values()).map(entry => ({
    platform: entry.platform,
    weight: entry.weight,
    status: entry.responses.length > 0 ? 'success' : 'error',
    response: entry.responses.length > 0 ? entry.responses.join('\n\n---\n\n') : null,
    error: entry.responses.length > 0 ? null : entry.error,
  }));

  // Build per-query response arrays for fractional mention scoring
  const perQueryMap = new Map<string, string[]>();
  for (const [name, entry] of platformMap) {
    perQueryMap.set(name, [...entry.responses]);
  }

  const analysis = await analyseAllPlatforms({ businessName: input, queries, results: platformResults.map(r => ({ platform: r.platform, weight: r.weight, response: r.response, perQueryResponses: perQueryMap.get(r.platform) || [] })) });
  // Rescans use the SAME recommendation-weighted score as fresh scans (lib/scoring).
  const overallScore = calculateOverallScore(
    analysis.map((a, i) => ({ weight: a.weight, mentionRate: a.mentionRate, status: (platformResults[i]?.status === 'success' ? 'success' : 'error') as PlatformStatus })),
    queries.length,
  ).score;
  // Same competitor logic as /api/scan: the analyser's extracted competitor,
  // validated against the shared city/state/generic blacklist.
  const rawCompetitor = analysis.find(a => a.competitor)?.competitor || null;
  const competitor = isValidCompetitor(rawCompetitor) ? rawCompetitor : null;
  const mentionedCount = analysis.filter(a => a.mentionRate > 0).length;
  // ax87: citations only from responses that mention the business.
  const citationSources = [...new Set(analysis.filter(a => a.mentionRate > 0).flatMap(a => a.citationSources))];

  const intent = detectIntent(input);
  const intentLoc = typeof intent === 'string' ? '' : (intent as any).loc || '';
  const trustSignals = await detectTrustSignals({ businessInput: input, websiteUrl: trustCtx.websiteUrl, industry: trustCtx.industry, enrichment: trustCtx.enrichment ?? null, scanResults: platformResults.map((r, i) => ({ platform: r.platform, response: r.response, mentioned: (analysis[i]?.mentionRate ?? 0) > 0 })), citationSources,
    // Like-for-like with /api/scan: same verified flag + attribution list.
    websiteVerified: trustCtx.websiteVerified ?? false,
    competitorNames: competitorNameList(analysis.map(a => a.competitor)),
  }, countryCode);

  return { platformResults, overallScore, analysis, competitor, mentionedCount, citationSources, trustSignals, intent, intentLoc, basketHash, queries };
}

function buildRescanEmail({
  businessInput, email, newScanId,
  oldTrust, newTrust, oldCoverage, newCoverage, oldMentioned, newMentioned,
  newResponded, remainingFixes,
}: {
  businessInput: string; email: string; newScanId: string;
  oldTrust: number; newTrust: number; oldCoverage: number; newCoverage: number;
  oldMentioned: number; newMentioned: number;
  newResponded: number;
  remainingFixes: Array<{ fix_type: string }>;
}) {
  const reportUrl = `https://rankall.io/report/${newScanId}`;
  const trustDelta = newTrust - oldTrust;
  const coverageDelta = newCoverage - oldCoverage;
  const improved = trustDelta > 0 || coverageDelta > 0;

  const deltaColor = (d: number) => d > 0 ? '#059669' : d < 0 ? '#DC2626' : '#64748B';
  const deltaArrow = (d: number) => d > 0 ? '▲' : d < 0 ? '▼' : '→';
  const deltaStr = (old: number, nw: number, suffix = '') =>
    `${old}${suffix} <span style="color:${deltaColor(nw - old)};font-weight:700;">${deltaArrow(nw - old)} ${nw}${suffix}</span>`;

  const FIX_LABELS: Record<string, string> = {
    faq_schema: 'Add FAQ schema markup',
    jsonld: 'Add LocalBusiness JSON-LD',
    directory: 'Complete directory listings',
    reviews: 'Generate review responses',
    reddit: 'Build Reddit presence',
  };

  const topFixes = remainingFixes.slice(0, 2).map(f => FIX_LABELS[f.fix_type] || f.fix_type);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Fix Verification Rescan — Rankall.io</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#0F172A;border-radius:12px;padding:10px 20px;">
        <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">rankall<span style="color:#2563EB;">.io</span></span>
      </div>
      <p style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.12em;margin:12px 0 0;">Fix Verification Report</p>
    </div>

    <!-- Main card -->
    <div style="background:#ffffff;border:1.5px solid #E2E8F0;border-radius:16px;padding:32px;margin-bottom:16px;">
      <p style="font-size:13px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px;">Rescan complete</p>
      <h1 style="font-size:22px;font-weight:800;color:#0F172A;margin:0 0 6px;line-height:1.25;">"${businessInput}"</h1>
      <p style="font-size:13px;color:#94A3B8;margin:0 0 28px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <!-- Before / After table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <td style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:10px;width:40%;"></td>
            <td style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:10px;text-align:center;">Before</td>
            <td style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:10px;text-align:center;">After</td>
            <td style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:10px;text-align:center;">Change</td>
          </tr>
        </thead>
        <tbody>
          ${[
            { label: 'Trust Score', old: oldTrust, nw: newTrust, suffix: '/100' },
            { label: 'AI Visibility Score', old: oldCoverage, nw: newCoverage, suffix: '/100' },
            { label: 'Platforms Mentioning You', old: oldMentioned, nw: newMentioned, suffix: `/${PLATFORMS.length}` },
          ].map((row, i) => {
            const d = row.nw - row.old;
            const bg = i % 2 === 0 ? '#F8FAFC' : '#ffffff';
            const changeColor = d > 0 ? '#059669' : d < 0 ? '#DC2626' : '#94A3B8';
            const changeText = d > 0 ? `+${d}` : d < 0 ? `${d}` : '—';
            return `
          <tr style="background:${bg};">
            <td style="padding:12px 10px;font-size:13px;font-weight:600;color:#0F172A;border-radius:6px 0 0 6px;">${row.label}</td>
            <td style="padding:12px 10px;font-size:15px;font-weight:700;color:#64748B;text-align:center;">${row.old}${row.suffix}</td>
            <td style="padding:12px 10px;font-size:15px;font-weight:700;color:#0F172A;text-align:center;">${row.nw}${row.suffix}</td>
            <td style="padding:12px 10px;font-size:14px;font-weight:800;color:${changeColor};text-align:center;border-radius:0 6px 6px 0;">${changeText}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Outcome framing -->
      <div style="background:#0F172A;border-radius:10px;padding:14px 18px;margin-bottom:16px;text-align:center;">
        <p style="font-size:14px;font-weight:700;color:#ffffff;margin:0;line-height:1.5;">${
          // b0ff: frame against the platforms that RESPONDED this rescan —
          // a platform that errored is not "recommending competitors".
          newResponded > 0
            ? outcomeSentence(newMentioned, newCoverage, PLATFORMS.length, newResponded)
            : 'No AI platform responded during this rescan — your score is unchanged until the next one.'
        }</p>
      </div>

      <!-- Outcome banner -->
      ${improved ? `
      <div style="background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;font-weight:800;color:#059669;margin:0;">🎉 ${coverageDelta > 0 ? `Your AI visibility score improved by ${coverageDelta} points!` : `Your trust score improved by ${trustDelta} points!`}</p>
        <p style="font-size:13px;color:#064E3B;margin:6px 0 0;">Keep applying fixes — each one compounds.</p>
      </div>` : `
      <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;font-weight:800;color:#D97706;margin:0;">Here's what still needs fixing</p>
        <p style="font-size:13px;color:#78350F;margin:6px 0 0;">AI platforms update their training data over weeks — keep going.</p>
      </div>`}

      ${topFixes.length > 0 ? `
      <!-- Top remaining fixes -->
      <div style="margin-bottom:24px;">
        <p style="font-size:12px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Top fixes still pending</p>
        ${topFixes.map(fix => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:8px;">
          <span style="color:#D97706;font-size:13px;flex-shrink:0;font-weight:700;">○</span>
          <p style="font-size:13px;color:#0F172A;font-weight:600;margin:0;">${fix}</p>
        </div>`).join('')}
      </div>` : ''}

      <!-- CTA -->
      <a href="${reportUrl}" style="display:block;background:#2563EB;border-radius:10px;padding:16px;text-align:center;text-decoration:none;margin-bottom:12px;box-shadow:0 4px 14px rgba(37,99,235,0.3);">
        <span style="font-size:15px;font-weight:700;color:#ffffff;">View Full Report →</span>
      </a>
      <p style="font-size:12px;color:#94A3B8;text-align:center;margin:0;">${reportUrl}</p>
    </div>

    <!-- Next rescan note -->
    <div style="background:#0F172A;border-radius:16px;padding:20px 24px;margin-bottom:16px;text-align:center;">
      <p style="font-size:13px;font-weight:700;color:#ffffff;margin:0 0 6px;">Keep going</p>
      <p style="font-size:12px;color:#64748B;margin:0;">Mark your next fix applied and we'll run its verification rescan on the date you choose.</p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;">
      <p style="font-size:12px;color:#94A3B8;margin:0 0 4px;">Rankall.io · AI Recommendation Intelligence</p>
      <p style="font-size:11px;color:#CBD5E1;margin:0 0 8px;">You received this because you applied a fix on Rankall.io</p>
      <a href="https://rankall.io/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${generateUnsubscribeToken(email)}" style="font-size:11px;color:#94A3B8;text-decoration:underline;">Unsubscribe from rescan emails</a>
    </div>

  </div>
</body>
</html>`;
}

// ── fix_predictions status machine ──────────────────────────────────────────
//   'applied'            → fix applied, awaiting its verification rescan.
//                           Written by /api/fixes/apply. This is the ONLY status
//                           the daily trigger-rescans cron selects.
//   'verified'           → the fix has been through a verification rescan cycle
//                           in this route. The cron never re-picks it — this is
//                           what stops the daily-rescan runaway (before this fix,
//                           nothing ever moved a row out of 'applied', so every
//                           daily run re-scanned, re-emailed, and re-inserted
//                           legacy verified_outcomes rows forever).
//   'verification_error' → the verification rescan failed twice. Terminal: the
//                           cron never re-picks it, so a persistently failing
//                           fix can't loop forever. The failure is recorded in
//                           verification_evidence for an admin to inspect/reset.
// Failure accounting lives in the existing `verification_evidence` jsonb column
// (no migration needed): { verification_attempts, last_verification_error, ... }.
const MAX_VERIFICATION_ATTEMPTS = 2;

// Retry-once-then-stop: the first failure leaves the row 'applied' (the cron
// retries tomorrow); the second failure moves it to terminal 'verification_error'.
// Callers pass the scan whose verification cycle failed.
async function recordVerificationFailure(scanId: string, err: unknown, fixTypes: string[] | null = null): Promise<void> {
  try {
    // ax72: only the fixes this cycle was verifying (null = all applied).
    let q = supabase
      .from('fix_predictions')
      .select('id, verification_evidence')
      .eq('scan_id', scanId)
      .eq('status', 'applied');
    if (fixTypes) q = q.in('fix_type', fixTypes);
    const { data: rows } = await q;
    const now = new Date().toISOString();
    const errMsg = err instanceof Error ? err.message : String(err ?? 'unknown error');
    for (const row of (rows ?? []) as Array<{ id: string; verification_evidence: Record<string, unknown> | null }>) {
      const prev = (row.verification_evidence ?? {}) as Record<string, unknown>;
      const attempts = Number(prev.verification_attempts ?? 0) + 1;
      const evidence = {
        ...prev,
        verification_attempts: attempts,
        last_verification_error: errMsg.slice(0, 500),
        last_verification_attempt_at: now,
      };
      if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
        await supabase.from('fix_predictions')
          .update({ status: 'verification_error', verification_evidence: evidence })
          .eq('id', row.id);
      } else {
        await supabase.from('fix_predictions')
          .update({ verification_evidence: evidence })
          .eq('id', row.id);
      }
    }
  } catch (e) {
    // Never let failure accounting break the rescan response.
    console.error('[rescan-weekly] failed to record verification failure:', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth: this route runs paid LLM scans and emails users, so it must only be
    // callable by the cron (or an admin) holding CRON_SECRET.
    // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
    const denied = cronAuthFailure(req);
    if (denied) return denied;

    const { scan_id, user_id, fix_types } = await req.json();
    if (!scan_id || !user_id) {
      return NextResponse.json({ error: 'scan_id and user_id required' }, { status: 400 });
    }
    // ax72: trigger-rescans passes the fix types whose OWN schedule rows are
    // due; only those are verified. Absent (manual/admin call) = all applied
    // fixes on the scan, the previous behaviour.
    const dueFixTypes: string[] | null = Array.isArray(fix_types)
      ? (fix_types as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
      : null;
    const isDue = (ft: string | null | undefined) => !!ft && (dueFixTypes === null || dueFixTypes.includes(ft));

    // 1. Fetch original scan
    const { data: originalScan, error: scanErr } = await supabase
      .from('rankall_scans')
      .select('*')
      .eq('id', scan_id)
      .single();

    if (scanErr || !originalScan) {
      return NextResponse.json({ error: 'Original scan not found' }, { status: 404 });
    }

    // 2. Fetch user email
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 404 });
    }

    const oldTrust: number = originalScan.trust_signals?.overall || 0;
    const oldCoverage: number = originalScan.overall_score || 0;
    const oldMentioned: number = originalScan.mentioned_count || 0;

    // Infer country from query text (most reliable), then saved code, then default US
    const scanLocation = originalScan.location || '';
    const scanInput = originalScan.input || '';
    const scanCountryCode =
      inferCountryFromText(scanLocation, scanInput) ||
      (originalScan.country_code as string | null) ||
      'US';

    // 3. Re-run the scan
    const { platformResults, overallScore, analysis, competitor, mentionedCount, citationSources, trustSignals, intent, intentLoc, basketHash, queries } = await runScan(originalScan.input, scanCountryCode, originalScan.queries_used, (() => {
      // b0fh: like-for-like trust — reuse the original scan's website only
      // when its stored Google record still passes the confident-match check.
      const trustedGoogle = getTrustedStoredGoogle(originalScan.input, originalScan.location, originalScan.enrichment?.google);
      // Round 2: prefer the user-supplied site when the scan row has one
      // (website_url); a Places site is used but never 'verified'.
      const site = resolveRescanWebsite(originalScan, trustedGoogle?.website);
      return {
        websiteUrl: site.websiteUrl,
        websiteVerified: site.websiteVerified,
        industry: originalScan.industry || undefined,
        enrichment: { google: trustedGoogle ?? null, serpData: originalScan.enrichment?.serpData ?? null, reddit: originalScan.enrichment?.reddit ?? null },
      };
    })());

    const newTrust: number = (trustSignals as any)?.overall || 0;
    const newCoverage: number = overallScore;
    const newMentioned: number = mentionedCount;

    // 4. Save new scan
    const intentType = typeof intent === 'string' ? intent : (intent as any).type || 'general';
    const intentInd = typeof intent === 'string' ? originalScan.input : (intent as any).ind || originalScan.input;

    const newScanId = await saveScan({
      input: originalScan.input,
      intentType,
      industry: intentInd,
      location: intentLoc,
      overallScore,
      results: platformResults,
      userId: user_id,
      trustSignals,
      competitorName: competitor,
      mentionedCount,
      citationSources,
      queriesUsed: queries,
      basketHash,
      // b02f: pass the canonical share — without it saveScan wrote
      // rankall_scans.recommendation_share as NULL for rescan scans
      // while score_history got mentioned/11.
      recommendationShare: calculateRecommendationShare(mentionedCount, PLATFORMS.length),
    });

    if (!newScanId) {
      // Scan ran but the save failed — the fix must not silently re-queue forever.
      // First failure: stays 'applied', cron retries tomorrow. Second failure:
      // recordVerificationFailure moves it to terminal 'verification_error'.
      await recordVerificationFailure(scan_id, 'saveScan returned no id', dueFixTypes);
      return NextResponse.json({ error: 'Failed to save rescan' }, { status: 500 });
    }

    // Save score history
    try {
      // ax9c: same as /api/scan — insert only score_history's real columns
      // (score, recommendation_share, platforms_count, basket_hash). The old
      // column set (overall_score, trust_score, business_input, competitor_name,
      // mentioned_count, scan_type) does not exist; every insert was rejected.
      await supabase.from('score_history').insert({
        user_id,
        scan_id: newScanId,
        score: overallScore,
        recommendation_share: Math.round((mentionedCount / PLATFORMS.length) * 100),
        platforms_count: mentionedCount,
        basket_hash: basketHash,
      });
    } catch { /* non-fatal */ }

    // Phase 1 labeling (ticket b7x5): same auto-label as /api/scan.
    // after() so verification work is never slowed; failures logged only.
    after(async () => {
      try {
        await autoLabelScan({
          scanId: newScanId,
          platformSentiments: analysis.map((a) => ({ platform: a.platform, sentiment: a.sentiment })),
          trustSignals,
        });
      } catch (labelErr) {
        console.error('[rescan-weekly] auto-label failed (non-fatal):', labelErr);
      }
    });

    // 5. Verify outcomes for this scan's applied fixes (CANONICAL path).
    // Outcome rows are created at apply-time by recordFixApplied (before-snapshot).
    // Here we confirm them against this fresh rescan via verifyOutcome() — the
    // single source of truth for the threshold (>=3 pts + a new platform, or >=5).
    //
    // 5c (below) closes the loop on fix_predictions: every fix verified in this
    // cycle moves 'applied' → 'verified', so the daily cron never re-picks it.
    // Scoped to the fix types actually verified here — a fix applied to this scan
    // AFTER this cycle started is left 'applied' for its own later cycle.
    const verifiedFixTypes = new Set<string>();
    const legacyFixTypes = new Set<string>();
    let verificationError: unknown = null;
    try {
      const { data: pending } = await supabase
        .from('verified_outcomes')
        .select('id, fix_type')
        .eq('scan_id_before', scan_id)
        .is('scan_id_after', null)
        .eq('is_verified', false);

      for (const row of (pending ?? []) as Array<{ id: string; fix_type: string | null }>) {
        // ax72: verify ONLY the fixes whose schedule is due — the old loop
        // verified every pending outcome on the scan (a 90-day fix on day 7).
        if (!isDue(row.fix_type)) continue;
        await verifyOutcome(row.id, newScanId);
        if (row.fix_type) verifiedFixTypes.add(row.fix_type);
      }

      // Backward-compat: legacy applied fixes (pre-canonical) with no outcome row
      // get a one-shot threshold check so older data still verifies.
      const { data: appliedFixes } = await supabase
        .from('fix_predictions')
        .select('fix_type, applied_at')
        .eq('scan_id', scan_id)
        .eq('status', 'applied');
      // Guard: a fix whose outcome was already confirmed in an earlier run must
      // not get a second legacy row (e.g. if a previous run verified it but the
      // fix_predictions transition below failed). The transition is the primary
      // dedupe; this is the backstop.
      const { data: alreadyVerified } = await supabase
        .from('verified_outcomes')
        .select('fix_type')
        .eq('scan_id_before', scan_id)
        .not('scan_id_after', 'is', null);
      const alreadyVerifiedTypes = new Set((alreadyVerified ?? []).map((r: any) => r.fix_type as string));
      const legacy = ((appliedFixes ?? []) as Array<{ fix_type: string; applied_at: string | null }>)
        .filter((f) => isDue(f.fix_type) && !verifiedFixTypes.has(f.fix_type) && !alreadyVerifiedTypes.has(f.fix_type));

      if (legacy.length) {
        const improvement = newCoverage - oldCoverage;
        const platformsImproved = newMentioned - oldMentioned;
        // ax72: same ladder as verifyOutcome (lib/verifiedOutcomes.ts).
        // The old legacy ladder gave confidence 'high' + is_verified=false
        // for improvement>=5 without a new platform, contradicting the
        // canonical path (which verifies on >=5 alone).
        const isVerified = (improvement >= 3 && platformsImproved >= 1) || improvement >= 5;
        const confidenceLevel = (improvement >= 3 && platformsImproved >= 1) ? 'verified' : isVerified ? 'high' : (improvement >= 1 ? 'medium' : 'low');
        const industry: string = originalScan.industry || '';
        const city: string = originalScan.location || '';
        const rows = legacy.map((fix) => ({
          user_id, scan_id_before: scan_id, scan_id_after: newScanId, fix_type: fix.fix_type,
          score_before: oldCoverage, score_after: newCoverage,
          platforms_before: oldMentioned, platforms_after: newMentioned,
          before_platforms_found: oldMentioned, after_platforms_found: newMentioned,
          days_to_improvement: fix.applied_at ? Math.round((Date.now() - new Date(fix.applied_at).getTime()) / (1000 * 60 * 60 * 24)) : 7,
          industry, business_industry: industry, city,
          confidence_level: confidenceLevel, is_verified: isVerified, verified: isVerified,
          verified_at: isVerified ? new Date().toISOString() : null,
          actual_impact: `+${improvement} points, ${platformsImproved >= 0 ? '+' : ''}${platformsImproved} platforms`,
          rescanned_at: new Date().toISOString(),
        }));
        await supabase.from('verified_outcomes').insert(rows);
        for (const fix of legacy) legacyFixTypes.add(fix.fix_type);
      }
    } catch (err) {
      // Verification is best-effort, but a failure must be visible (log) and
      // bounded (recordVerificationFailure below: retry once, then terminal
      // 'verification_error') — never silently re-queued forever, never dropped.
      verificationError = err;
      console.error('[rescan-weekly] verification error:', err);
    }

    // 5c. Close the loop on fix_predictions.
    if (verificationError === null) {
      // Verification cycle completed: move exactly the fixes verified in this
      // cycle out of 'applied'. The daily cron only selects 'applied', so this
      // is what stops the rescan + email + legacy-insert loop.
      // Runs before the email step on purpose: an email failure (207 below) must
      // NOT re-trigger another scan — verification already happened.
      const verifiedTypes = [...verifiedFixTypes, ...legacyFixTypes];
      if (verifiedTypes.length > 0) {
        try {
          await supabase.from('fix_predictions')
            .update({ status: 'verified', verified_at: new Date().toISOString(), auto_verified: true })
            .eq('scan_id', scan_id)
            .eq('status', 'applied')
            .in('fix_type', verifiedTypes);
        } catch (e) {
          console.error('[rescan-weekly] failed to close fix_predictions loop:', e);
        }
      }
    } else {
      await recordVerificationFailure(scan_id, verificationError, dueFixTypes);
    }

    // 5b. Fire milestone emails (non-blocking)
    const milestoneBase = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/api/milestone-email`;
    const milestoneAuth = { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' };
    const milestonePayload = { user_id, email: userEmail, business_name: originalScan.input, scan_id: newScanId };
    try {
      const milestones: Promise<void>[] = [];
      // Score crossed 50 for the first time
      if (oldCoverage < 50 && newCoverage >= 50) {
        milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'score_50', score: newCoverage }) }).then(() => {}));
      }
      // Score crossed 75 for the first time
      if (oldCoverage < 75 && newCoverage >= 75) {
        milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'score_75', score: newCoverage }) }).then(() => {}));
      }
      // Score decayed 10+ points
      if (newCoverage < oldCoverage - 10) {
        milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'decay_warning', score: newCoverage, prev_score: oldCoverage }) }).then(() => {}));
      }
      // New platform appeared (mentionedCount increased)
      if (newMentioned > oldMentioned) {
        const newPlatformResult = platformResults.find(r => r.status === 'success');
        milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'new_platform', score: newCoverage, new_platform: newPlatformResult?.platform }) }).then(() => {}));
      }
      // Big score jump this rescan (10+ points)
      if (newCoverage - oldCoverage >= 10) {
        milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'score_jump', score: newCoverage, prev_score: oldCoverage }) }).then(() => {}));
      }
      // Overtook a tracked competitor. ax74: the competitor score lives
      // in competitor_scans (written by /api/competitor-scan). The old
      // lookup read score_history.competitor_score, which the scan route
      // always writes as NULL — so compScore was always 0 and this
      // milestone could never fire.
      if (competitor) {
        try {
          const { data: sh } = await supabase
            .from('competitor_scans')
            .select('competitor_score')
            .eq('user_id', user_id)
            .eq('competitor_name', competitor)
            .order('scanned_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const compScore = Number(sh?.competitor_score) || 0;
          if (compScore > 0 && oldCoverage <= compScore && newCoverage > compScore) {
            milestones.push(fetch(milestoneBase, { method: 'POST', headers: milestoneAuth, body: JSON.stringify({ ...milestonePayload, milestone: 'competitor_overtaken', score: newCoverage, competitor_score: compScore, competitor_name: competitor }) }).then(() => {}));
          }
        } catch { /* non-fatal */ }
      }
      await Promise.allSettled(milestones);
    } catch { /* non-fatal */ }

    // Fetch remaining pending fixes for the original scan
    const { data: pendingFixes } = await supabase
      .from('fix_predictions')
      .select('fix_type')
      .eq('scan_id', scan_id)
      .eq('status', 'pending');

    // 6. Send email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const html = buildRescanEmail({
      businessInput: originalScan.input,
      email: userEmail,
      newScanId,
      oldTrust, newTrust,
      oldCoverage, newCoverage,
      oldMentioned, newMentioned,
      newResponded: platformResults.filter(r => r.status === 'success').length,
      remainingFixes: pendingFixes || [],
    });

    // CAN-SPAM: never mail an unsubscribed / bounced address, nor a user who
    // turned "Weekly report" off in Settings (lib/emailSuppression).
    // The rescan itself is saved above; only the email is skipped.
    if (await shouldSkipEmail({ email: userEmail, userId: user_id }, 'weekly_report')) {
      return NextResponse.json({ success: true, emailSkipped: 'suppressed', newScanId });
    }
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: [userEmail],
        subject: 'Your AI visibility rescan is ready — here\'s what changed',
        html,
      }),
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      // ax74: the 207 (scan saved, email failed) is now logged — before,
      // it was only a console.error and the missed email was invisible.
      console.error('Resend error:', emailData);
      await logCronRun(supabase, { job: 'rescan-weekly', status: 'partial', sent: 0, failed: 1, error: `Resend failed for ${userEmail}: ${JSON.stringify(emailData).slice(0, 300)}` });
      return NextResponse.json({ error: 'Email failed but scan saved', newScanId }, { status: 207 });
    }

    await logCronRun(supabase, { job: 'rescan-weekly', status: 'ok', sent: 1 });
    return NextResponse.json({
      success: true,
      newScanId,
      oldTrust, newTrust,
      oldCoverage, newCoverage,
      oldMentioned, newMentioned,
      emailId: emailData.id,
    });

  } catch (error) {
    console.error('Rescan weekly error:', error);
    await logCronRun(supabase, { job: 'rescan-weekly', status: 'failed', error: String(error).slice(0, 500) });
    return NextResponse.json({ error: 'Rescan failed' }, { status: 500 });
  }
}
