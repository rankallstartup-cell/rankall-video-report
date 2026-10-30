import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadLiveSubscriptions, planForAuthUser } from '@/lib/planAudience';
import { cronAuthFailure } from '@/lib/cronAuth';
import { emailDedupeKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { generateReferralCode } from '@/lib/referralCode';
import { getCountryConfig, type CountryConfig } from '@/lib/countryConfig';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PAID_PLANS = ['personal_pro', 'business', 'agency', 'enterprise'];

const REFERRAL_SUBJECT = 'Earn money for every business you refer to Rankall';

// The referral program pays 25% of the referred plan's monthly price
// (lib/referralTracking). Checkout charges USD everywhere, so the example
// uses the US Local Pro price in '$'. The old copy claimed "$30/month per
// referral" and "$300/month for 10" — 25% of $39 is $9.75.
const REFERRAL_RATE = 0.25;
function referralHtml(name: string, refLink: string, cfg: CountryConfig): string {
  const perReferral = (Math.round(cfg.monthly * REFERRAL_RATE * 100) / 100).toFixed(2);
  const tenReferrals = (Math.round(cfg.monthly * REFERRAL_RATE * 10 * 100) / 100).toFixed(2);
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <h2 style="color:#0F172A;font-size:22px;margin:0 0 16px;">Earn 25% every month for every business you refer</h2>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${name},</p>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">You've been using Rankall for over a month. If you know other local businesses who struggle with AI visibility, you can earn money introducing them to Rankall.</p>
      <div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
        <p style="font-size:13px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Our referral program</p>
        <ul style="color:#334155;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
          <li>Share your unique link</li>
          <li>Your friend signs up and pays</li>
          <li>You earn 25% every month they stay subscribed</li>
          <li>That's ${cfg.symbol}${perReferral}/month per referral on the ${cfg.symbol}${cfg.monthly}/month Local Pro plan</li>
        </ul>
      </div>
      <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;"><strong>Refer 10 Local Pro businesses: ${cfg.symbol}${tenReferrals}/month while they stay subscribed.</strong></p>
      <a href="${refLink}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;padding:13px 28px;font-weight:700;font-size:14px;">Get your referral link →</a>
      <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">Your link: ${refLink}</p>
    </div>`;
}

// Referral invitation — sent once, ever, to established (>30-day) paid customers.
// Runs weekly (Mondays) and dedupes on email_sequence_log so nobody gets it twice.
export async function GET(req: NextRequest) {
  // Bearer CRON_SECRET only, fail closed (lib/cronAuth).
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, message: 'RESEND_API_KEY not set' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Test mode: send one representative email only to the given address.
  const testEmail = new URL(req.url).searchParams.get('test_email');
  if (testEmail) {
    const html = referralHtml('there', 'https://www.rankall.io/?ref=TESTCODE', getCountryConfig('US'));
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: testEmail, subject: REFERRAL_SUBJECT, html }),
    }).catch(() => {});
    return NextResponse.json({ ok: true, test: true, sent_to: testEmail });
  }

  const thirtyDaysAgo = Date.now() - 30 * 86400000;

  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  // Plan = subscriptions → app_metadata → free; never user_metadata.
  const liveSubs = await loadLiveSubscriptions(supabase);
  const referralKey = emailDedupeKey('referral_invite');

  let sent = 0;
  for (const u of usersData?.users ?? []) {
    const plan = planForAuthUser(u, liveSubs);
    if (!PAID_PLANS.includes(plan) || !u.email) continue;

    // Established customers only (account older than 30 days).
    const createdAt = u.created_at ? new Date(u.created_at).getTime() : Date.now();
    if (createdAt > thirtyDaysAgo) continue;

    // Dedup — one referral invite per customer, ever.
    const { data: existing } = await supabase.from('email_sequence_log')
      .select('id').eq('user_id', u.id).eq('trigger_event', 'referral_invite').maybeSingle();
    if (existing) continue;

    // CAN-SPAM: never mail an unsubscribed / bounced address (lib/emailSuppression).
    // Covers do_not_contact (the signed unsubscribe link) AND the legacy
    // outreach_unsubscribes list; fails closed.
    if (await shouldSkipEmail({ email: u.email, userId: u.id }, 'marketing_emails')) continue;

    // Payouts are 25% of a USD charge — the US tier is the price source.
    const cfg = getCountryConfig('US');

    const name = (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email.split('@')[0];
    const refCode = generateReferralCode(u.id);
    const refLink = `https://www.rankall.io/?ref=${refCode}`;

    // ax74: claim first (error checked), send only on a fresh claim; a
    // failed send releases the claim so the next run retries.
    const claim = await claimEmailSend(supabase, { userId: u.id, email: u.email, triggerEvent: referralKey });
    if (claim !== 'claimed') continue;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: u.email, subject: REFERRAL_SUBJECT, html: referralHtml(name, refLink, cfg) }),
    }).catch(() => null);
    if (!res || !res.ok) {
      console.error('[referral-invite] send failed:', u.id);
      await releaseEmailClaim(supabase, u.id, referralKey);
      continue;
    }

    sent++;
    await new Promise((r) => setTimeout(r, 400));
  }

  return NextResponse.json({ ok: true, sent });
}
