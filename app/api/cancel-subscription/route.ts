import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getBillingAdminClient, getOwnSubscription, stripeRequest } from '@/lib/billingAuth';

export const dynamic = 'force-dynamic';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BASE_URL = 'https://rankall.io';

function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// POST /api/cancel-subscription — cancel the SESSION user's own subscription.
// Body ids (userId / subscription_id) are ignored: the old route took userId
// from the body with no session, so anyone could cancel any customer.
//
// Cancels at the END of the current period (cancel_at_period_end=true), as
// Terms §3 promises: the user keeps access until then, and a trialing user
// is simply never charged. customer.subscription.deleted fires at period end
// and the webhook downgrades the account to Free.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const feedback = typeof body.feedback === 'string' ? body.feedback : '';
    const businessName = typeof body.businessName === 'string' ? body.businessName : '';
    const acceptedOffer = body.acceptedOffer === true;
    const offeredDiscount = body.offeredDiscount === true;
    if (!reason) {
      return NextResponse.json({ error: 'reason required' }, { status: 400 });
    }
    const userId = user.id;
    const email = user.email || '';

    const supabase = getBillingAdminClient();
    const sub = await getOwnSubscription(supabase, user);
    if (!sub.stripeSubscriptionId || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'no_subscription', message: 'We could not find an active subscription on your account. If you are being charged, contact hello@rankall.io.' },
        { status: 404 },
      );
    }

    const cancelRes = await stripeRequest(
      `subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`,
      'POST',
      { cancel_at_period_end: 'true' },
    );
    if (!cancelRes.ok) {
      console.error('cancel-subscription Stripe error:', cancelRes.json?.error ?? cancelRes.status);
      return NextResponse.json(
        { error: 'cancel_failed', message: 'Cancellation failed. Your subscription was NOT cancelled. Please try again or contact hello@rankall.io.' },
        { status: 502 },
      );
    }
    const s = cancelRes.json ?? {};
    const endUnix: number | null =
      (typeof s.cancel_at === 'number' && s.cancel_at) ||
      (typeof s.current_period_end === 'number' && s.current_period_end) ||
      (typeof s.items?.data?.[0]?.current_period_end === 'number' && s.items.data[0].current_period_end) ||
      (typeof s.trial_end === 'number' && s.trial_end) ||
      null;
    const accessUntil = endUnix ? new Date(endUnix * 1000).toISOString() : null;
    const accessUntilLabel = accessUntil
      ? new Date(accessUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'the end of your current billing period';

    // Log to cancellation_requests (best-effort — the cancel already happened).
    try {
      const { error } = await supabase.from('cancellation_requests').insert({
        user_id: userId,
        reason,
        feedback: feedback || null,
        offered_discount: offeredDiscount,
        accepted_offer: acceptedOffer,
        cancelled_at: new Date().toISOString(),
      });
      if (error) console.error('cancellation_requests insert error:', error);
    } catch (err) {
      console.error('cancellation_requests insert error:', err);
    }

    if (!RESEND_API_KEY) {
      return NextResponse.json({ success: true, accessUntil, warning: 'emails skipped — no API key' });
    }

    const name = escapeHtml(businessName || email || 'there');

    // Send cancellation confirmation to user
    const userHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
    <span style="font-size:20px;font-weight:800;color:#fff;">rankall<span style="color:#60A5FA;">.io</span></span>
  </div>
  <div style="background:#fff;border:1.5px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:36px 32px;">
    <h1 style="font-size:22px;font-weight:800;color:#0F172A;margin:0 0 12px;">Your subscription is cancelled</h1>
    <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
      Hi ${name}, we've received your cancellation request. Your subscription is cancelled and will not renew. You keep full access until <strong>${accessUntilLabel}</strong>, and you won't be charged again. After that your account moves to the Free plan — your scans and data stay.
    </p>
    <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="font-size:13px;font-weight:700;color:#DC2626;margin:0 0 10px;">What you'll lose access to after ${accessUntilLabel}:</p>
      ${['Verification rescans 7 days after you apply a fix','Fix queue with generated content ready to paste','Score trend tracking and proof card generation','Competitor intelligence and gap analysis'].map(item =>
        `<div style="display:flex;gap:8px;margin-bottom:6px;"><span style="color:#DC2626;">✕</span><span style="font-size:13px;color:#7F1D1D;">${item}</span></div>`
      ).join('')}
    </div>
    <p style="font-size:14px;color:#64748B;line-height:1.7;margin:0 0 24px;">Changed your mind before then? You can keep your subscription from Manage Billing on your dashboard.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/dashboard/billing" style="display:inline-block;background:#2563EB;border-radius:10px;padding:13px 28px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">Manage billing →</a>
    </div>
  </div>
  <div style="text-align:center;padding:16px;">
    <p style="font-size:11px;color:#CBD5E1;margin:0;">Rankall.io · Questions? Reply to this email.</p>
  </div>
</div>
</body></html>`;

    // Send internal alert to hello@rankall.io
    const internalHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:#DC2626;border-radius:12px;padding:20px 28px;margin-bottom:0;">
    <h1 style="font-size:18px;font-weight:800;color:#fff;margin:0;">⚠ Cancellation Alert</h1>
  </div>
  <div style="background:#fff;border:1.5px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
    <table style="width:100%;border-collapse:collapse;">
      ${[
        ['User ID', userId],
        ['Email', email || '—'],
        ['Business', businessName || '—'],
        ['Reason', reason],
        ['Feedback', feedback || '—'],
        ['Offered discount', offeredDiscount ? 'Yes' : 'No'],
        ['Accepted offer', acceptedOffer ? 'Yes' : 'No'],
        ['Time', new Date().toLocaleString('en-US')],
      ].map(([k, v]) => [k, escapeHtml(v)]).map(([k, v]) => `
      <tr>
        <td style="font-size:12px;font-weight:700;color:#64748B;padding:8px 0;border-bottom:1px solid #F1F5F9;width:140px;">${k}</td>
        <td style="font-size:13px;color:#0F172A;padding:8px 0;border-bottom:1px solid #F1F5F9;">${v}</td>
      </tr>`).join('')}
    </table>
  </div>
</div>
</body></html>`;

    await Promise.all([
      email && fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: [email], subject: 'Your Rankall subscription is cancelled', html: userHtml }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Rankall.io <hello@rankall.io>', to: ['hello@rankall.io'], subject: `Cancellation: ${reason.slice(0, 60)} — ${email || userId}`, html: internalHtml }),
      }),
    ]);

    return NextResponse.json({ success: true, accessUntil });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
