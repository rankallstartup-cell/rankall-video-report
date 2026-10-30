import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getCountryConfig } from '@/lib/countryConfig';
import { impactRangeForFix } from '@/lib/fixIntelligence';
import { cronAuthFailure } from '@/lib/cronAuth';
import { emailDedupeKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { shouldSkipEmail } from '@/lib/emailSuppression';
import { generateUnsubscribeToken } from '@/lib/outreachGuard';

export const dynamic = 'force-dynamic';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BASE_URL = 'https://rankall.io';

type TriggerEvent = 'day1_followup' | 'day3_nudge' | 'day7_rescan' | 'day14_urgency' | 'day30_report' | 'day2' | 'day60';

interface SequencePayload {
  userId: string;
  email: string;
  businessName: string;
  scanId?: string;
  currentScore?: number;
  trustScore?: number;
  competitorName?: string;
  industry?: string;
  topFix?: string;
  scoreHistory?: Array<{ overall_score: number; created_at: string }>;
  fixesPending?: number;
  fixesApplied?: number;
  lastQuery?: string;
  countryCode?: string;
  triggerEvent: TriggerEvent;
}

export async function POST(req: NextRequest) {
  // This route emails any address it is given with caller-supplied content,
  // so it is internal-only: Bearer CRON_SECRET (trigger-sequence, admin
  // test-email proxy), fail closed.
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;
  try {
    const payload: SequencePayload = await req.json();
    const { userId, email, triggerEvent } = payload;

    if (!userId || !email || !triggerEvent) {
      return NextResponse.json({ error: 'userId, email, triggerEvent required' }, { status: 400 });
    }
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    // Item 17: service role only. The old anon-key fallback could not write
    // email_sequence_log under RLS, so the claim failed and the email was
    // never sent (silently). Missing key → logged error, nothing sent.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('[email-sequence] SUPABASE_SERVICE_ROLE_KEY is not set — cannot record the send, email not sent');
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Each sequence step is sent once per user — the step name is the key.
    const dedupeKey = emailDedupeKey(triggerEvent);
    const { data: existing } = await supabase
      .from('email_sequence_log')
      .select('id')
      .eq('user_id', userId)
      .eq('trigger_event', dedupeKey)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ skipped: true, reason: 'already_sent' });
    }

    // Check unsubscribe list
    // CAN-SPAM: do_not_contact (signed unsubscribe link, bounces, spam) +
    // legacy outreach_unsubscribes, fail closed (lib/emailSuppression) +
    // the user's "Marketing emails" toggle in Settings (user_preferences).
    if (await shouldSkipEmail({ email, userId }, 'marketing_emails')) {
      return NextResponse.json({ skipped: true, reason: 'unsubscribed' });
    }

    // Gate: user must have at least 1 scan
    const { count: scanCount } = await supabase
      .from('rankall_scans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (!scanCount || scanCount < 1) {
      return NextResponse.json({ skipped: true, reason: 'no_scans' });
    }

    // Resolve the user's market from their latest scan so localized emails
    // (day60 agency pricing) use the right currency symbol.
    if (!payload.countryCode) {
      const { data: latestScan } = await supabase
        .from('rankall_scans')
        .select('country_code')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      payload.countryCode = (latestScan?.country_code as string) || 'US';
    }

    // Gate: the day60 agency upsell only goes to BUSINESS-plan customers
    // (not agency, not free/personal). Resolve plan from user_metadata →
    // subscriptions, same order usePlan uses.
    if (triggerEvent === 'day60') {
      let plan = 'free';
      try {
        const resolved = await resolvePlanServer(userId, supabase);
        plan = resolved.plan;
      } catch { /* treat as non-business → skip below */ }
      if (plan !== 'business') {
        return NextResponse.json({ skipped: true, reason: 'not_business_plan' });
      }
    }

    const { subject, html } = buildEmail(payload);

    // ax74: claim the log row FIRST (upsert ignoreDuplicates, error checked)
    // and send only when this call created it — the old insert-after-send
    // ignored its {error}, so a concurrent/repeat call could double-send.
    const claim = await claimEmailSend(supabase, { userId, email, triggerEvent: dedupeKey, scanId: payload.scanId || null });
    if (claim === 'duplicate') return NextResponse.json({ skipped: true, reason: 'already_sent' });
    if (claim === 'error') return NextResponse.json({ error: 'Could not record the email (not sent, to avoid duplicates)' }, { status: 500 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: [email],
        subject,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Resend error:', data);
      await releaseEmailClaim(supabase, userId, dedupeKey);
      return NextResponse.json({ error: data.message || 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Email sequence error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// ── Email builder ──────────────────────────────────────────────────────

function buildEmail(p: SequencePayload): { subject: string; html: string } {
  switch (p.triggerEvent) {
    case 'day1_followup': return day1(p);
    case 'day3_nudge':    return day3(p);
    case 'day7_rescan':   return day7(p);
    case 'day14_urgency': return day14(p);
    case 'day30_report':  return day30(p);
    case 'day2':          return day2(p);
    case 'day60':         return day60(p);
  }
}

// ── Day 2 — onboarding checklist ─────────────────────────────────────────

function day2(p: SequencePayload): { subject: string; html: string } {
  const score = measured(p.currentScore);
  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">Your Rankall setup checklist (3 quick wins)</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      Hi${p.businessName ? ` <strong>${p.businessName}</strong>` : ''} — you're 24 hours in. Here's how to get the most from Rankall in three quick steps.
    </p>

    <div style="border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:14px;">
      <p style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 4px;">✅ Step 1 · Check your score</p>
      <p style="font-size:13px;color:#64748B;margin:0 0 12px;line-height:1.6;">See exactly which of the 12 AI platforms recommend you today.${score != null ? ` Your current score is ${score}/100.` : ''}</p>
      ${cta('View your score →', `${BASE_URL}/dashboard`)}
    </div>

    <div style="border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:14px;">
      <p style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 4px;">✅ Step 2 · Apply Fix #1 (free)</p>
      <p style="font-size:13px;color:#64748B;margin:0 0 12px;line-height:1.6;">Your top fix is ready to paste, and your queue shows its estimated impact range.</p>
      ${cta('Apply Fix #1 →', `${BASE_URL}/dashboard/fix`)}
    </div>

    <div style="border:1.5px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
      <p style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 4px;">✅ Step 3 · Connect Google Analytics</p>
      <p style="font-size:13px;color:#64748B;margin:0 0 12px;line-height:1.6;">See how your AI visibility improvements affect real website traffic.</p>
      ${cta('Connect GA4 →', `${BASE_URL}/dashboard/social-content`)}
    </div>

    <p style="font-size:13px;color:#94A3B8;text-align:center;margin:0;line-height:1.6;">Mark a fix applied and we'll run a verification rescan to measure the real change.</p>
  `;
  return { subject: 'Your Rankall setup checklist (3 quick wins)', html: layout(body, p.email) };
}

// ── Day 60 — agency upsell (business plan only; gated in the POST handler) ──

function day60(p: SequencePayload): { subject: string; html: string } {
  // Checkout charges USD everywhere: the US tier is the single price source.
  const us = getCountryConfig('US');
  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">Are you managing multiple locations or clients?</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 20px;">
      Hi${p.businessName ? ` <strong>${p.businessName}</strong>` : ''} — you've been using Rankall for two months. If you manage multiple business locations, or have clients who need AI visibility, our Agency plan might be a perfect fit.
    </p>

    <div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:14px;padding:22px 24px;margin-bottom:24px;">
      <p style="font-size:13px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Agency plan includes</p>
      ${['Unlimited client accounts', 'White-label reports', 'Proposal builder', 'Bulk scanning', `${us.symbol}${us.tiers.agency.monthly}/month (USD)`].map(f => `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
        <span style="color:#7C3AED;font-weight:700;">✓</span>
        <span style="font-size:14px;color:#0F172A;">${f}</span>
      </div>`).join('')}
    </div>

    <p style="font-size:14px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      If you look after several businesses, the Agency plan lets you run and report on all of them from one account.
    </p>

    ${cta('Learn about the Agency plan →', `${BASE_URL}/pricing`)}
  `;
  return { subject: 'Are you managing multiple locations or clients?', html: layout(body, p.email) };
}

// ── Shared layout ──────────────────────────────────────────────────────

function layout(body: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
    <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">rankall<span style="color:#60A5FA;">.io</span></span>
  </div>
  <div style="background:#fff;border:1.5px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:36px 32px;">
    ${body}
  </div>
  <div style="text-align:center;padding:20px 0 8px;">
    <p style="font-size:11px;color:#CBD5E1;margin:0;">Rankall.io · AI Recommendation Intelligence · <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${generateUnsubscribeToken(email)}" style="color:#CBD5E1;">Unsubscribe</a></p>
  </div>
</div>
</body></html>`;
}

function cta(text: string, href: string): string {
  return `<div style="text-align:center;margin:28px 0 8px;">
    <a href="${href}" style="display:inline-block;background:#2563EB;border-radius:12px;padding:15px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;box-shadow:0 4px 16px rgba(37,99,235,0.4);">${text}</a>
  </div>`;
}

function scoreCard(label: string, value: string | number, color: string): string {
  return `<div style="flex:1;min-width:120px;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:16px;text-align:center;">
    <p style="font-size:34px;font-weight:900;color:${color};margin:0 0 4px;line-height:1;">${value}</p>
    <p style="font-size:11px;color:#64748B;margin:0;">${label}</p>
  </div>`;
}

// ax6u: a missing score is "not measured", never 0.
function measured(n: number | undefined | null): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Canonical fix impact range (lib/fixQuality metadata), labelled an estimate.
function estRange(fixType: string): string {
  const r = impactRangeForFix(fixType);
  return `est. +${r.min}–${r.max} pts`;
}

function scoreColor(s: number) {
  return s >= 75 ? '#059669' : s >= 50 ? '#D97706' : '#DC2626';
}

// ── Day 1 ──────────────────────────────────────────────────────────────

function day1(p: SequencePayload): { subject: string; html: string } {
  // No invented benchmark: the old 'industry average trust 52' was a
  // constant, and missing scores printed as 0.
  const score = measured(p.currentScore);
  const trust = measured(p.trustScore);

  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">Here's why AI skips your business (and how to fix it)</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      Hi${p.businessName ? ` — we looked at <strong>${p.businessName}</strong>` : ''} and found some clear gaps that explain why AI platforms aren't recommending you as often as they should.
    </p>

    ${score != null || trust != null ? `
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      ${score != null ? scoreCard('Your AI Visibility Score', score + '/100', scoreColor(score)) : ''}
      ${trust != null ? scoreCard('Your Trust Score', trust + '/100', scoreColor(trust)) : ''}
    </div>` : ''}

    <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.08em;">The 2 biggest missing signals</p>

    <div style="margin-bottom:20px;">
      <div style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #E2E8F0;align-items:flex-start;">
        <div style="width:32px;height:32px;background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;">1</div>
        <div>
          <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 3px;">Structured Data (JSON-LD Schema)</p>
          <p style="font-size:13px;color:#64748B;margin:0;line-height:1.6;">AI models read structured data first when deciding who to recommend. Without LocalBusiness schema, you're invisible to the first check.</p>
        </div>
      </div>
      <div style="display:flex;gap:12px;padding:14px 0;align-items:flex-start;">
        <div style="width:32px;height:32px;background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;">2</div>
        <div>
          <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 3px;">Directory Presence (BBB, Yelp, Industry-Specific)</p>
          <p style="font-size:13px;color:#64748B;margin:0;line-height:1.6;">AI platforms cross-reference directory listings to verify legitimacy. Missing from key directories = lower recommendation confidence.</p>
        </div>
      </div>
    </div>

    ${cta('See your full fix queue →', `${BASE_URL}/dashboard/fix`)}
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:8px 0 0;">Takes 5 minutes to review. Some fixes take less than an hour.</p>
  `;

  return {
    subject: "Here's why AI skips your business (and how to fix it)",
    html: layout(body, p.email),
  };
}

// ── Day 3 ──────────────────────────────────────────────────────────────

function day3(p: SequencePayload): { subject: string; html: string } {
  const scanHref = p.scanId ? `${BASE_URL}/report/${p.scanId}` : `${BASE_URL}/dashboard/fix`;

  const faqExample = `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "What services do you offer?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "We offer [your services here]."
    }
  }]
}`;

  // ax81: the canonical FAQ-schema range, not an invented "+18 points".
  const faq = impactRangeForFix('faq_schema');
  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">This 1-hour fix could add an estimated ${faq.min}–${faq.max} points to your score</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      Of all the fixes in your queue, one stands out as the highest-impact change you can make this week — and it takes under an hour.
    </p>

    <div style="background:#0F172A;border-radius:14px;padding:24px 28px;margin-bottom:24px;">
      <p style="font-size:11px;font-weight:700;color:#60A5FA;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">#1 Highest Impact Fix</p>
      <p style="font-size:20px;font-weight:800;color:#fff;margin:0 0 6px;">FAQ Schema Markup</p>
      <p style="font-size:13px;color:#94A3B8;margin:0 0 16px;line-height:1.6;">Adding FAQ schema to your website tells AI platforms exactly what questions your business answers. This is one of the top signals AI uses when deciding who to surface for "best [service] near me" queries.</p>
      <div style="background:#1E293B;border-radius:8px;padding:4px 10px;display:inline-block;">
        <span style="font-size:18px;font-weight:900;color:#F59E0B;">+${faq.min}–${faq.max} points</span>
        <span style="font-size:12px;color:#94A3B8;margin-left:6px;">estimated score impact</span>
      </div>
    </div>

    <p style="font-size:13px;font-weight:700;color:#0F172A;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.08em;">Your generated FAQ schema — ready to paste</p>
    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:16px;margin-bottom:24px;overflow:auto;">
      <pre style="font-size:11px;color:#334155;margin:0;white-space:pre-wrap;line-height:1.6;">${faqExample}</pre>
    </div>
    <p style="font-size:13px;color:#64748B;margin:0 0 24px;line-height:1.6;">
      Paste this into your website's <code style="background:#F1F5F9;border-radius:4px;padding:1px 5px;font-size:12px;">&lt;head&gt;</code> tag or use your CMS's schema plugin. Your full personalized schema with your actual services is in your fix queue.
    </p>

    ${cta('Get your generated fix content →', scanHref)}
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:8px 0 0;">Personalized to your business, ready to copy and paste.</p>
  `;

  return {
    subject: `This 1-hour fix could add an estimated ${faq.min}–${faq.max} points to your score`,
    html: layout(body, p.email),
  };
}

// ── Day 7 ──────────────────────────────────────────────────────────────

function day7(p: SequencePayload): { subject: string; html: string } {
  const score = measured(p.currentScore);
  const query = p.lastQuery || p.businessName || 'your business';
  const rescanUrl = `${BASE_URL}/?q=${encodeURIComponent(query)}`;

  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">Your fixes are being indexed — here's what to expect</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      ${p.businessName ? `<strong>${p.businessName}</strong> was` : 'You were'} scanned a week ago. When AI platforms reflect a fix depends on each platform's refresh cycle — Rankall verifies the real change with a rescan after you mark a fix applied (7 days by default, or the date you choose).
    </p>

    ${score != null ? `
    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="font-size:13px;font-weight:700;color:#64748B;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.08em;">Your baseline score</p>
      <p style="font-size:52px;font-weight:900;color:${scoreColor(score)};margin:0 0 4px;line-height:1;">${score}</p>
      <p style="font-size:13px;color:#94A3B8;margin:0;">out of 100 — a verification rescan runs on the date set when you mark a fix applied (7 days by default)</p>
    </div>` : ''}

    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:20px;margin-bottom:24px;">
      <p style="font-size:13px;font-weight:700;color:#0F172A;margin:0 0 14px;">Week by week — what's happening:</p>
      ${[
        ['Now',        '#ECFDF5', '#A7F3D0', '#059669', 'Apply a fix and mark it applied in your report'],
        ['Day 7',      '#EFF6FF', '#BFDBFE', '#2563EB', 'Verification rescan (or the date you chose) measures the real before/after'],
        ['Varies',     '#FFFBEB', '#FDE68A', '#D97706', 'Each AI platform reflects changes on its own refresh cycle — some sooner, some later'],
      ].map(([range, bg, border, color, desc]) => `
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
          <span style="font-size:11px;font-weight:700;color:${color};background:${bg};border:1px solid ${border};border-radius:100px;padding:3px 10px;white-space:nowrap;flex-shrink:0;">${range}</span>
          <span style="font-size:13px;color:#64748B;line-height:1.5;">${desc}</span>
        </div>
      `).join('')}
    </div>

    <div style="background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;font-weight:700;color:#059669;margin:0 0 4px;">💡 Haven't applied fixes yet?</p>
      <p style="font-size:13px;color:#166534;margin:0;line-height:1.6;">Each fix in your queue shows an estimated impact range; the verification rescan measures the real change. The sooner you start, the sooner you see results.</p>
    </div>

    ${cta('View your fix queue →', rescanUrl)}
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:8px 0 0;">Mark a fix applied and we'll verify it with an automatic rescan (7 days later by default) — we'll email you the results.</p>
  `;

  return {
    subject: "Your fixes are being indexed — here's what to expect week by week",
    html: layout(body, p.email),
  };
}

// ── Day 14 ──────────────────────────────────────────────────────────────

function day14(p: SequencePayload): { subject: string; html: string } {
  const competitor = p.competitorName || 'your top competitor';
  // ax6u: no invented competitor score. The old `~${score + 22}` "estimate"
  // and the resulting 22-point "gap detected" were fabricated.
  const score = measured(p.currentScore);

  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">${competitor} is pulling ahead — here's the gap</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      While you've been building, AI platforms have been recommending <strong>${competitor}</strong> to customers searching for your services. Here's what the gap looks like right now.
    </p>

    ${score != null ? `
    <div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:12px;padding:18px;text-align:center;margin-bottom:24px;">
      <p style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your AI Visibility Score</p>
      <p style="font-size:42px;font-weight:900;color:${scoreColor(score)};margin:0;line-height:1;">${score}<span style="font-size:18px;color:#64748B;">/100</span></p>
    </div>` : ''}

    <div style="background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:13px;color:#7F1D1D;margin:0;line-height:1.6;">
        Run a competitor scan from your dashboard to measure exactly how far ahead ${competitor} is. The fixes in your queue are the fastest way to close the gap.
      </p>
    </div>

    <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 12px;">3 fixes that close the gap fastest:</p>
    ${[`Add LocalBusiness JSON-LD schema (${estRange('jsonld')})`, `Complete Google Business Profile (${estRange('gbp_optimizer')})`, `Add BBB listing and 3 industry directories (${estRange('directory')})`].map(f => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #E2E8F0;">
      <span style="color:#2563EB;font-weight:700;">→</span>
      <span style="font-size:13px;color:#0F172A;">${f}</span>
    </div>`).join('')}

    ${cta('Close the gap now →', `${BASE_URL}/dashboard/fix`)}
  `;

  return {
    subject: `${competitor} is pulling ahead — here's the gap`,
    html: layout(body, p.email),
  };
}

// ── Day 30 ──────────────────────────────────────────────────────────────

function day30(p: SequencePayload): { subject: string; html: string } {
  const name = p.businessName || 'Your business';
  const score = measured(p.currentScore);
  const history = p.scoreHistory ?? [];
  const firstScore = measured(history[0]?.overall_score);
  const hasProgress = history.length >= 2 && score != null && firstScore != null;
  const delta = hasProgress ? (score as number) - (firstScore as number) : 0;
  const fixesApplied = p.fixesApplied ?? 0;
  const fixesPending = p.fixesPending ?? 0;

  const trendSection = hasProgress ? `
    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
      <p style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 14px;">30-Day Score Trend</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div style="text-align:center;flex:1;">
          <p style="font-size:32px;font-weight:900;color:#64748B;margin:0;line-height:1;">${firstScore}</p>
          <p style="font-size:11px;color:#94A3B8;margin:4px 0 0;">Day 0</p>
        </div>
        <div style="display:flex;align-items:center;font-size:22px;color:#2563EB;">→</div>
        <div style="text-align:center;flex:1;">
          <p style="font-size:32px;font-weight:900;color:${scoreColor(score ?? 0)};margin:0;line-height:1;">${score}</p>
          <p style="font-size:11px;color:#94A3B8;margin:4px 0 0;">Today</p>
        </div>
        <div style="text-align:center;flex:1;">
          <p style="font-size:32px;font-weight:900;color:${delta >= 0 ? '#059669' : '#DC2626'};margin:0;line-height:1;">${delta >= 0 ? '+' : ''}${delta}</p>
          <p style="font-size:11px;color:#94A3B8;margin:4px 0 0;">Change</p>
        </div>
      </div>
    </div>` : `
    <div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:14px;padding:18px 22px;margin-bottom:20px;">
      <p style="font-size:14px;font-weight:700;color:#2563EB;margin:0 0 4px;">Run a rescan to track your progress</p>
      <p style="font-size:13px;color:#1E40AF;margin:0;line-height:1.6;">You haven't rescanned yet this month. A quick rescan will show how your score has changed and what to focus on next.</p>
    </div>`;

  const body = `
    <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 10px;line-height:1.3;">30-day AI visibility summary for ${name}</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      It's been 30 days since you joined Rankall. Here's where you stand — and what's still left to capture.
    </p>

    ${trendSection}

    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      ${score != null ? scoreCard('Current Score', score + '/100', scoreColor(score)) : ''}
      ${scoreCard('Fixes Applied', fixesApplied, '#059669')}
      ${scoreCard('Fixes Pending', fixesPending, fixesPending > 0 ? '#D97706' : '#64748B')}
    </div>

    ${fixesPending > 0 ? `
    <div style="background:#FFFBEB;border:1.5px solid #FCD34D;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;font-weight:700;color:#92400E;margin:0 0 4px;">⏳ ${fixesPending} fix${fixesPending > 1 ? 'es' : ''} still pending</p>
      <p style="font-size:13px;color:#78350F;margin:0;line-height:1.6;">
        Each one shows its estimated impact range in your queue, and its verification rescan measures the real change. AI platforms update their recommendations regularly — every fix matters.
      </p>
    </div>` : ''}

    ${cta('View full dashboard →', `${BASE_URL}/dashboard`)}
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin:8px 0 0;">See your live score, competitor gaps, and full fix queue.</p>
  `;

  return {
    subject: `30-day AI visibility summary for ${name}`,
    html: layout(body, p.email),
  };
}
