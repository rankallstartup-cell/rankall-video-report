import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadLiveSubscriptions, planForAuthUser } from '@/lib/planAudience';
import { cronAuthFailure } from '@/lib/cronAuth';
import { emailDedupeKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAID_PLANS = ['personal_pro', 'business', 'agency', 'enterprise'];

const RE_ENGAGEMENT_SUBJECT = "We miss you — your competitor hasn't stopped";

function reEngagementHtml(name: string, score: number | null): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 16px;">We miss you — your competitor hasn't stopped</h2>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${name},</p>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">You haven't logged into Rankall in 14 days. While you were away:</p>
      <ul style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 16px;padding-left:20px;">
        <li>AI platforms continued updating their recommendation data</li>
        <li>Your competitor may have improved their score</li>
        <li>New fix opportunities may have appeared</li>
      </ul>
      ${score != null ? `<p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;">Your last score: <strong>${score}/100</strong></p>` : ''}
      <a href="https://www.rankall.io/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;padding:13px 28px;font-weight:700;font-size:14px;">Check what changed →</a>
      <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">Don't let your competitor get further ahead. Your dashboard is waiting.</p>
    </div>`;
}

async function sendResend(to: string, subject: string, html: string) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to, subject, html }),
  });
}

// Re-engagement — a paid user who hasn't signed in for 14–16 days. Runs daily;
// the [14d,16d) window + a 30-day dedup on email_sequence_log means each dormant
// spell triggers at most one email, but the user can re-qualify months later.
export async function GET(req: NextRequest) {
  // Bearer CRON_SECRET only, fail closed (lib/cronAuth).
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, message: 'RESEND_API_KEY not set' });
  }

  // Test mode: send one representative email only to the given address and
  // return, without touching real users, dedup, or logging.
  const testEmail = new URL(req.url).searchParams.get('test_email');
  if (testEmail) {
    await sendResend(testEmail, RE_ENGAGEMENT_SUBJECT, reEngagementHtml('there', 42));
    return NextResponse.json({ ok: true, test: true, sent_to: testEmail });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  // Plan = subscriptions → app_metadata → free; never user_metadata.
  const liveSubs = await loadLiveSubscriptions(supabase);
  const now = Date.now();
  const windowStart = now - 16 * 86400000;
  const windowEnd = now - 14 * 86400000;
  const dedupeSince = new Date(now - 30 * 86400000).toISOString();

  let sent = 0;
  for (const u of usersData?.users ?? []) {
    const plan = planForAuthUser(u, liveSubs);
    if (!PAID_PLANS.includes(plan)) continue;

    const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null;
    if (lastSignIn === null || lastSignIn < windowStart || lastSignIn >= windowEnd) continue;
    if (!u.email) continue;

    // Dedup — already re-engaged in the last 30 days?
    const { data: existing } = await supabase.from('email_sequence_log')
      .select('id').eq('user_id', u.id).eq('trigger_event', 're_engagement')
      .gte('sent_at', dedupeSince).maybeSingle();
    if (existing) continue;

    // Respect opt-outs.
    // CAN-SPAM: never mail an unsubscribed / bounced address (lib/emailSuppression).
    // Covers do_not_contact (the signed unsubscribe link) AND the legacy
    // outreach_unsubscribes list; fails closed.
    if (await shouldSkipEmail({ email: u.email, userId: u.id }, 'marketing_emails')) continue;

    const name = (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email.split('@')[0];
    const { data: lastScan } = await supabase.from('rankall_scans')
      .select('overall_score').eq('user_id', u.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    // No scan → no score line (the old `|| 0` printed a fabricated 0/100).
    const score = typeof lastScan?.overall_score === 'number' ? lastScan.overall_score : null;

    // ax74: one email per dormant spell — keyed by the sign-in that started
    // it. Claim first (upsert ignoreDuplicates, error checked), then send;
    // a failed send releases the claim for the next run.
    const key = emailDedupeKey('re_engagement', new Date(lastSignIn).toISOString().slice(0, 10));
    const claim = await claimEmailSend(supabase, { userId: u.id, email: u.email, triggerEvent: key });
    if (claim !== 'claimed') continue;
    const res = await sendResend(u.email, RE_ENGAGEMENT_SUBJECT, reEngagementHtml(name, score)).catch(() => null);
    if (!res || !res.ok) {
      console.error('[re-engagement] send failed:', u.id);
      await releaseEmailClaim(supabase, u.id, key);
      continue;
    }

    sent++;
    await new Promise((r) => setTimeout(r, 400));
  }

  return NextResponse.json({ ok: true, sent });
}
