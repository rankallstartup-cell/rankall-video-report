import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkOutreachAllowed, recordEmailSent, unsubscribeFooter, generateUnsubscribeToken } from '@/lib/outreachGuard';
import { getConfiguredColdDomains, selectColdSendingDomain } from '@/lib/outreachSendingDomains';
import { wasEmailedRecently } from '@/lib/outreachTargeting';
import { selectTopFixTypes, fixTypeLabel, safeBusinessName, canonicalFixImpact, withCanonicalImpacts } from '@/lib/fixIntelligence';
import { generateFixForScan } from '@/lib/generateFix';
import { getAdminOrInternalActor } from '@/lib/apiAuth';
import { OUTREACH_INBOX_ADDRESS } from '@/lib/outreachReplies';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { escapeHtml } from '@/lib/escapeHtml';
import { resolvePublicReportUrl } from '@/lib/publicShare';
import { enrollDashboardSend } from '@/lib/enrollDashboardSend';
import {
  OUTREACH_REPLY_TO,
  resolveVerificationStatus,
  verificationAllowsSend,
  isCatchAllOptInSend,
  parseAllowCatchAll,
  type VerificationStatus,
} from '@/lib/outreachDeliverability';

export const dynamic = 'force-dynamic';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const BASE_URL       = 'https://rankall.io';

interface VerificationResult {
  status: VerificationStatus;
  raw?: Record<string, unknown>;
  creditsRemaining?: number;
}

async function verifyEmail(email: string, allowCatchAll: boolean): Promise<VerificationResult> {
  if (!INSTANTLY_API_KEY) {
    throw new Error('INSTANTLY_API_KEY not set — cannot verify emails. Aborting to protect sender domains.');
  }

  const res = await fetch('https://api.instantly.ai/api/v2/email-verification', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${INSTANTLY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Instantly API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const credits = typeof data.credits === 'number' ? data.credits : undefined;

  if (credits !== undefined) {
    console.log(`[email-verify] credits remaining: ${credits}`);
    if (credits < 100) {
      console.warn(`[email-verify] LOW CREDITS: only ${credits} remaining — refill soon`);
    }
  }

  // Catch-all + invalid/risky/pending mapping lives in
  // lib/outreachDeliverability.ts so the rule is unit-tested in one place.
  // allowCatchAll only overrides the catch-all skip — never invalid/risky.
  return { status: resolveVerificationStatus(data, allowCatchAll), raw: data, creditsRemaining: credits };
}

const FIX_GENERATION_TIMEOUT_MS = 10_000;

async function generateFixesForOutreach(
  scanId: string,
  businessName: string,
  industry: string,
  city: string,
  score: number,
): Promise<OutreachFix[]> {
  try {
    const fixTypes = selectTopFixTypes([], null, score, 0).slice(0, 3);
    console.log('[send-email] lazy fix generation for', scanId, fixTypes);

    const genPromises = fixTypes.map(fixType =>
      generateFixForScan({
        scanId,
        fixType,
        businessName: safeBusinessName(businessName),
        industry: industry || undefined,
        city: city || undefined,
        countryCode: 'US',
        score,
        source: 'outreach_lazy',
      })
    );

    const results = await Promise.race([
      Promise.allSettled(genPromises),
      new Promise<null>(resolve => setTimeout(() => resolve(null), FIX_GENERATION_TIMEOUT_MS)),
    ]);

    if (!results) {
      console.warn('[send-email] fix generation timed out after 10s, using hardcoded');
      return [];
    }

    // Re-fetch from DB to get the canonical data (predicted_impact, difficulty, etc.)
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: genFixes } = await sb
      .from('generated_fixes')
      .select('fix_title, fix_type, difficulty, time_to_implement')
      .eq('scan_id', scanId)
      .limit(20);

    if (genFixes && genFixes.length > 0) {
      return toOutreachFixes(genFixes as GenFixRow[]);
    }
    return [];
  } catch (err) {
    console.error('[send-email] lazy fix generation failed:', err);
    return [];
  }
}

// The 12 platforms we actually scan, including Meta AI (via the Meta Model API).
const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Google AI', 'Copilot', 'Perplexity', 'Grok',
  'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Meta AI',
];

type OutreachFix = { title: string; pts: number | null; effort: string };
type GenFixRow = { fix_title: string | null; fix_type: string | null; difficulty: string | null; time_to_implement: string | null };

// ax81: impact is the canonical per-fix number (metadata midpoint, same as
// the fix queue), normalised at read time and ranked by it — the stored
// predicted_impact on legacy rows and the old `?? 15` fallback are ignored.
// Unknown fix type → pts null → the number is omitted from the email.
function toOutreachFixes(rows: GenFixRow[]): OutreachFix[] {
  return withCanonicalImpacts(rows).slice(0, 3).map(f => ({
    title: f.fix_title || fixTypeLabel(f.fix_type || ''),
    pts: f.predicted_impact,
    effort: f.time_to_implement || f.difficulty || '1 hour',
  }));
}

// Static fallback fixes (no scan / generation timed out). Each carries a
// fix type so its number comes from the same metadata range as the queue
// — the old per-industry literals (15–20 pts) were invented.
const FIXES: Record<string, Array<{ title: string; fixType: string; effort: string }>> = {
  dentist:    [{ title: 'Add LocalBusiness + Dentist JSON-LD schema', fixType: 'jsonld', effort: '1 hour' }, { title: 'Add FAQ schema to your top service pages', fixType: 'faq_schema', effort: '1 hour' }, { title: 'Claim & complete Healthgrades profile', fixType: 'directory', effort: '20 min' }],
  plumber:    [{ title: 'Add LocalBusiness + Plumber JSON-LD schema', fixType: 'jsonld', effort: '1 hour' }, { title: 'Add FAQ schema with common plumbing questions', fixType: 'faq_schema', effort: '1 hour' }, { title: 'Claim Angi (Angie\'s List) profile', fixType: 'directory', effort: '20 min' }],
  electrician:[{ title: 'Add LocalBusiness + Electrician JSON-LD schema', fixType: 'jsonld', effort: '1 hour' }, { title: 'Add FAQ schema for common electrical questions', fixType: 'faq_schema', effort: '1 hour' }, { title: 'Claim HomeAdvisor profile', fixType: 'directory', effort: '20 min' }],
  attorney:   [{ title: 'Add LocalBusiness + Attorney JSON-LD schema', fixType: 'jsonld', effort: '1 hour' }, { title: 'Add FAQ schema for practice area questions', fixType: 'faq_schema', effort: '1 hour' }, { title: 'Claim Avvo & Justia profiles', fixType: 'directory', effort: '20 min' }],
  default:    [{ title: 'Add LocalBusiness JSON-LD schema', fixType: 'jsonld', effort: '1 hour' }, { title: 'Add FAQ schema to homepage', fixType: 'faq_schema', effort: '1 hour' }, { title: 'Claim top industry directory listing', fixType: 'directory', effort: '20 min' }],
};

function getFixes(industry: string): OutreachFix[] {
  const key = Object.keys(FIXES).find(k => industry.toLowerCase().includes(k));
  const list = key ? FIXES[key] : FIXES.default;
  return list
    .map(f => ({ title: f.title, pts: canonicalFixImpact(f.fixType), effort: f.effort }))
    .sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
}

// Back-office only: this sends cold mail from the configured sending
// domains (lib/outreachSendingDomains — OUTREACH_SENDING_DOMAINS), or from
// outreach@rankall.io when none are configured, so it was an open relay
// while unauthenticated. Admin session or internal automation
// (CRON_SECRET), plus a shared per-actor daily cap on top of the
// per-domain warming limit in checkOutreachAllowed.
const SEND_EMAIL_RATE_LIMIT = { limit: 300, windowMs: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const actor = await getAdminOrInternalActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await checkRateLimitDb('outreach:send-email', actor, SEND_EMAIL_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const {
      to, firstName, businessName, industry, city,
      scanId, appeared, mentionedCount, overallScore,
      competitorName, platformResults, targetId,
      allowCatchAll,
    } = await req.json();
    // Outreach #8: catch-all opt-in is explicit per send. Only a literal
    // boolean `true` opts in — the string "true", 1, or anything else does
    // not. Default (flag absent) = today's behaviour: catch-alls skipped.
    const allowCatchAllOptIn = parseAllowCatchAll(allowCatchAll);

    if (!to || !businessName || !city) {
      return NextResponse.json({ error: 'to, businessName, city required' }, { status: 400 });
    }
    if (!platformResults || typeof platformResults !== 'object' || Object.keys(platformResults).length === 0) {
      return NextResponse.json({ error: 'No scan data available. Run scan before sending email.' }, { status: 400 });
    }
    if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

    // Check unsubscribe list before sending
    const supabaseCheck = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: unsub } = await supabaseCheck.from('outreach_unsubscribes').select('email').eq('email', to).maybeSingle();
    if (unsub) {
      return NextResponse.json({ skipped: true, reason: 'unsubscribed' }, { status: 200 });
    }

    // #9 targeting quality: never re-mail a business emailed in the last
    // 90 days (dashboard sends + sequence sends, matched by business + city).
    // Runs before verification so we don't burn Instantly credits on a skip.
    // Fail-open: a history lookup failure logs and the send proceeds.
    const recentCheck = await wasEmailedRecently(supabaseCheck, businessName, city);
    if (recentCheck.blocked) {
      console.warn(`[send-email] skipping ${to}: recently emailed (${recentCheck.source}, ${recentCheck.lastSentAt})`);
      return NextResponse.json({ skipped: true, reason: 'recently_emailed', lastSentAt: recentCheck.lastSentAt, source: recentCheck.source }, { status: 200 });
    }

    // Skip unreliable scans — never email a score we don't trust.
    if (scanId) {
      const { data: scanRow } = await supabaseCheck.from('rankall_scans').select('scan_reliable').eq('id', scanId).maybeSingle();
      if (scanRow?.scan_reliable === false) {
        console.warn(`[send-email] skipping ${to}: scan ${scanId} is unreliable`);
        return NextResponse.json({ skipped: true, reason: 'skipped_unreliable_scan' }, { status: 200 });
      }
    }

    // Outreach hardening guard: do-not-contact, per-domain warming/pause,
    // daily limit. #4: the sending domain is picked from the configured
    // cold domains (rankall.io when none are configured). If every
    // configured domain is blocked, the send is blocked — it is never
    // silently sent from rankall.io.
    const selection = await selectColdSendingDomain(
      to,
      (domain) => checkOutreachAllowed(to, domain),
      getConfiguredColdDomains(),
    );
    if (!selection.allowed) {
      console.warn(`Outreach blocked for ${to}: ${selection.reason}`);
      // Best-effort: mark the target row blocked.
      try {
        const sbBlock = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const col = targetId ? 'id' : 'email';
        const val = targetId ?? to;
        await sbBlock.from('outreach_targets').update({ status: 'blocked' }).eq(col, val);
        // last_error column may not exist in all environments — apply separately, best-effort.
        await sbBlock.from('outreach_targets').update({ last_error: selection.reason }).eq(col, val).then(undefined, () => {});
      } catch (blockErr) {
        console.error('Failed to mark target blocked:', blockErr);
      }
      return NextResponse.json({ skipped: true, reason: selection.reason }, { status: 200 });
    }
    const senderDomain = selection.domain;

    // Email verification via Instantly — must pass before we build or send anything.
    // The guard (DNC / unsubscribe / domain pause / daily limit) already ran
    // above, so an opted-in catch-all that is also DNC/unsubscribed was
    // blocked before reaching here.
    let verificationResult: VerificationResult;
    try {
      verificationResult = await verifyEmail(to, allowCatchAllOptIn);
    } catch (verifyErr) {
      console.error(`[email-verify] ABORT: verification failed for ${to}:`, verifyErr);
      return NextResponse.json({
        error: 'email_verification_failed',
        message: `Email verification system error: ${(verifyErr as Error).message}. Batch aborted to protect sender domains.`,
      }, { status: 500 });
    }

    // Only 'valid' and the explicit catch-all opt-in ('catch_all_allowed')
    // proceed. invalid / risky / pending / catch-all-without-flag skip.
    const catchAllAllowed = isCatchAllOptInSend(verificationResult.status);
    if (catchAllAllowed) {
      console.warn(`[email-verify] catch-all opt-in: sending to ${to} as low-priority (explicit per-send flag)`);
    }
    if (!verificationAllowsSend(verificationResult.status)) {
      console.warn(`[email-verify] skipping ${to}: ${verificationResult.status}`);
      // Log the skip to outreach_log for audit trail
      try {
        const sbLog = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await sbLog.from('outreach_log').insert({
          business_name: businessName,
          email:         to,
          city,
          industry,
          scan_id:       scanId || null,
          score:         0,
          sent_at:       new Date().toISOString(),
          status:        verificationResult.status,
          verification_status: verificationResult.status,
          verification_checked_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error('Failed to log verification skip:', logErr);
      }
      return NextResponse.json({ skipped: true, reason: verificationResult.status }, { status: 200 });
    }

    const hi        = firstName ? `Hi ${firstName}` : 'Hi there';
    // HTML-escaped copies for the HTML body (names come from scraped /
    // caller data; the plain-text part keeps the raw values).
    const hHi = escapeHtml(hi);
    const hBiz = escapeHtml(businessName);
    const hCity = escapeHtml(city);
    const hIndustry = escapeHtml(industry);
    const hIndustryTitle = escapeHtml(industry ? industry.charAt(0).toUpperCase() + industry.slice(1) : 'Local Business');
    const hCompetitor = escapeHtml(competitorName);
    // Outreach fix #1: link the prospect's own free report page (/r/<id>),
    // never the paywalled /report/<id> and never the homepage as if it
    // were a report. Null when there is no scan or the scan is not
    // eligible for public share (e.g. a cached scan owned by a real user).
    const reportUrl = await resolvePublicReportUrl(scanId, BASE_URL);

    // Prefer AI-generated fixes so the email matches the report.
    // 1. Check if fixes already exist for this scan.
    // 2. If not, generate them lazily (parallel, 10s timeout).
    // 3. Fall back to hardcoded if anything fails or times out.
    let fixes = getFixes(industry || '');
    if (scanId) {
      try {
        const sbFixes = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: genFixes } = await sbFixes
          .from('generated_fixes')
          .select('fix_title, fix_type, difficulty, time_to_implement')
          .eq('scan_id', scanId)
          .limit(20);

        if (genFixes && genFixes.length > 0) {
          fixes = toOutreachFixes(genFixes as GenFixRow[]);
        } else {
          // Lazy generation: no fixes exist yet, generate in parallel with timeout.
          const genResult = await generateFixesForOutreach(scanId, businessName, industry, city, overallScore);
          if (genResult.length > 0) {
            fixes = genResult;
          }
        }
      } catch (fixErr) {
        console.error('[send-email] fix generation/fetch failed, using hardcoded:', fixErr);
      }
    }

    // Build platform grid — platformResults is an optional object mapping platform name -> appeared boolean
    const platformGrid = PLATFORMS.map(name => {
      const hit = platformResults ? !!platformResults[name] : false;
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;">
          <span style="width:18px;height:18px;border-radius:50%;background:${hit ? '#059669' : '#DC2626'};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#fff;font-weight:900;">${hit ? '✓' : '✗'}</span>
          <span style="font-size:13px;color:#334155;">${name}</span>
        </div>`;
    }).join('');

    const appearedCount = platformResults
      ? Object.values(platformResults).filter(Boolean).length
      : (mentionedCount ?? 0);

    // CTA box: the free-report button only renders when there is a real
    // public report URL. Otherwise the copy stays honest — no paywalled
    // link and no homepage link presented as a report, just a reply ask.
    const ctaBox = reportUrl
      ? `<div style="background:#0F172A;border-radius:14px;padding:28px 28px;text-align:center;margin-bottom:4px;">
      <p style="font-size:16px;font-weight:800;color:#fff;margin:0 0 8px;line-height:1.4;">Get your complete fix queue<br>with generated code ready to paste</p>
      <p style="font-size:13px;color:#94A3B8;margin:0 0 20px;">Schema markup, FAQ content, and directory listings — all pre-written for ${hBiz}. Free.</p>
      <a href="${escapeHtml(reportUrl)}" style="display:inline-block;background:#2563EB;border-radius:12px;padding:16px 40px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;box-shadow:0 4px 20px rgba(37,99,235,0.5);">
        View Full Report Free →
      </a>
    </div>`
      : `<div style="background:#0F172A;border-radius:14px;padding:28px 28px;text-align:center;margin-bottom:4px;">
      <p style="font-size:16px;font-weight:800;color:#fff;margin:0 0 8px;line-height:1.4;">Your summary is above</p>
      <p style="font-size:13px;color:#94A3B8;margin:0;">Want the full fix queue with generated code ready to paste? Just reply to this email and we'll send your complete report.</p>
    </div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:28px 36px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">rankall<span style="color:#60A5FA;">.io</span></span>
      <span style="font-size:12px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;">Free AI Visibility Report</span>
    </div>
    <p style="font-size:18px;font-weight:800;color:#fff;margin:16px 0 0;line-height:1.3;">AI Visibility Report for<br><span style="color:#60A5FA;">${hBiz}</span></p>
    <p style="font-size:13px;color:#94A3B8;margin:6px 0 0;">${hIndustryTitle} · ${hCity}</p>
  </div>

  <!-- Body -->
  <div style="background:#fff;border:1.5px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 28px;">

    <p style="font-size:15px;color:#0F172A;line-height:1.7;margin:0 0 24px;">${hHi},</p>

    <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 24px;">
      I searched <strong>"best ${hIndustry} in ${hCity}"</strong> across ChatGPT, Gemini, Perplexity, and 8 other AI platforms. Here's what I found:
    </p>

    <!-- Score comparison -->
    <div style="display:flex;gap:14px;margin-bottom:28px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;border-radius:12px;padding:18px 20px;background:${appeared ? '#ECFDF5' : '#FEF2F2'};border:1.5px solid ${appeared ? '#A7F3D0' : '#FECACA'};">
        <p style="font-size:11px;font-weight:700;color:${appeared ? '#065F46' : '#991B1B'};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Your Business</p>
        <p style="font-size:15px;font-weight:800;color:${appeared ? '#059669' : '#DC2626'};margin:0;line-height:1.4;">
          ${appeared
            ? `✓ Appearing on ${appearedCount} of 12 platforms`
            : `✗ Not appearing on any AI platform`}
        </p>
        <p style="font-size:13px;color:${appeared ? '#065F46' : '#991B1B'};margin:6px 0 0;">${hBiz}</p>
      </div>
      ${competitorName ? `
      <div style="flex:1;min-width:200px;border-radius:12px;padding:18px 20px;background:#ECFDF5;border:1.5px solid #A7F3D0;">
        <p style="font-size:11px;font-weight:700;color:#065F46;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Top Competitor</p>
        <p style="font-size:15px;font-weight:800;color:#059669;margin:0;line-height:1.4;">✓ Appearing on most platforms</p>
        <p style="font-size:13px;color:#065F46;margin:6px 0 0;">${hCompetitor}</p>
      </div>` : ''}
    </div>

    ${competitorName ? `
    <p style="font-size:14px;color:#64748B;line-height:1.7;margin:0 0 28px;padding:16px 18px;background:#FFFBEB;border:1.5px solid #FCD34D;border-radius:10px;">
      Every time someone asks AI <em>"best ${hIndustry} near me"</em> — they're being sent to <strong>${hCompetitor}</strong>, not to you.
    </p>` : ''}

    <!-- Platform grid -->
    <div style="margin-bottom:28px;">
      <p style="font-size:13px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px;">Platform-by-Platform Results</p>
      <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:16px 20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">
          ${platformGrid}
        </div>
      </div>
    </div>

    <!-- Top 3 fixes -->
    <div style="margin-bottom:28px;">
      <p style="font-size:13px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px;">Top 3 Fixes to Get Found</p>
      ${fixes.map((f, i) => `
      <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid #F1F5F9;">
        <div style="width:28px;height:28px;border-radius:8px;background:#EFF6FF;border:1.5px solid #BFDBFE;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:13px;font-weight:900;color:#2563EB;">${i + 1}</span>
        </div>
        <div style="flex:1;">
          <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 4px;">${escapeHtml(f.title)}</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${f.pts != null ? `<span style="font-size:12px;color:#059669;font-weight:700;">est. +${f.pts} pts</span>` : ''}
            <span style="font-size:12px;color:#64748B;">⏱ ${escapeHtml(f.effort)} effort</span>
          </div>
        </div>
      </div>`).join('')}
    </div>

    <!-- CTA box -->
    ${ctaBox}

  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0 8px;">
    <p style="font-size:11px;color:#94A3B8;margin:0;line-height:1.8;">
      This report was generated by Rankall.io · AI Recommendation Intelligence<br>
      <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}&amp;token=${generateUnsubscribeToken(to)}" style="color:#94A3B8;">Unsubscribe</a>
    </p>
  </div>

</div>
</body></html>`;

    // Every outreach email must carry the unsubscribe footer.
    const htmlWithFooter = html + unsubscribeFooter(to);

    // Plain-text alternative — built from the same data, not stripped from HTML.
    const platformLines = PLATFORMS.map(name => {
      const hit = platformResults ? !!platformResults[name] : false;
      return `  ${hit ? '✓' : '✗'} ${name}`;
    }).join('\n');
    const fixLines = fixes.map((f, i) => `  ${i + 1}. ${f.title} (${f.pts != null ? `est. +${f.pts} pts, ` : ''}${f.effort})`).join('\n');
    const plainText = [
      `${hi},`,
      '',
      `I searched "best ${industry} in ${city}" across ChatGPT, Gemini, Perplexity, and 8 other AI platforms.`,
      '',
      appeared
        ? `Your business (${businessName}) is appearing on ${appearedCount} of 12 platforms.`
        : `Your business (${businessName}) isn't appearing on any AI platform.`,
      competitorName ? `\nYour top competitor (${competitorName}) is appearing on most platforms.` : '',
      competitorName ? `Every time someone asks AI "best ${industry} near me" — they're being sent to ${competitorName}, not to you.` : '',
      '',
      'Platform-by-Platform Results:',
      platformLines,
      '',
      'Top 3 Fixes to Get Found:',
      fixLines,
      '',
      reportUrl ? `View your full report: ${reportUrl}` : `Want the full fix queue with generated code? Just reply to this email and we'll send your complete report.`,
      '',
      '---',
      `This report was generated by Rankall.io`,
      `Unsubscribe: ${BASE_URL}/unsubscribe?email=${encodeURIComponent(to)}&token=${generateUnsubscribeToken(to)}`,
    ].filter(Boolean).join('\n');

    const subject = appeared
      ? `${businessName} is barely showing up when people ask AI for ${industry} in ${city}`
      : `${businessName} isn't showing up when people ask AI for ${industry} in ${city}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    selection.from,
        to:      [to],
        // reply_to: human replies go to the outreach inbox, where Resend
        // Inbound (email.received) picks them up for reply detection
        // (lib/outreachReplies.ts).
        reply_to: OUTREACH_INBOX_ADDRESS,
        subject,
        html:    htmlWithFooter,
        text:    plainText,
      }),
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      console.error('Resend error:', emailData);
      return NextResponse.json({ error: emailData.message || 'Send failed' }, { status: 500 });
    }

    // Record the send for domain health (atomic increment) + event log.
    // Catch-all opt-ins are marked low-priority in the event metadata so
    // they can be counted separately (metadata->>'catch_all_allowed') and
    // never poison deliverability stats.
    await recordEmailSent(targetId ?? null, to, senderDomain, {
      subject,
      ...(catchAllAllowed ? { catch_all_allowed: true, priority: 'low' } : {}),
    });

    // Log to outreach_log
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase.from('outreach_log').insert({
        business_name: businessName,
        email:         to,
        city,
        industry,
        scan_id:       scanId || null,
        score:         appearedCount ?? 0,
        overall_score: overallScore ?? null,
        sent_at:       new Date().toISOString(),
        status:        'sent',
        subject,
        body_html:     htmlWithFooter,
        body_text:     plainText,
        competitor_name: competitorName || null,
        template_version: 'v1',
        // Catch-all opt-ins are logged under their own verification status
        // so they are countable separately from normal sends.
        verification_status: catchAllAllowed ? 'catch_all_allowed' : 'valid',
        verification_checked_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error('Failed to log outreach:', logErr);
    }

    // Outreach fix #2: enroll into the follow-up sequence — the dashboard send
    // counts as the Day-1 touch, so the next touch (Day 3) is scheduled.
    // Best-effort: enrollment failures are logged inside enrollDashboardSend
    // and must never fail the send. Belt-and-braces try/catch here too.
    try {
      await enrollDashboardSend({
        email: to,
        businessName,
        firstName,
        industry,
        city,
        scanId,
        overallScore,
        competitorName,
      });
    } catch (enrollErr) {
      console.error('[send-email] sequence enrollment failed (send stands):', enrollErr);
    }

    return NextResponse.json({ success: true, id: emailData.id });
  } catch (err) {
    console.error('send-email error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
