import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getBillingAdminClient, pauseOwnSubscription } from '@/lib/billingAuth';
import { sendEmail } from '@/lib/emailTemplates';
import { escapeHtml } from '@/lib/escapeHtml';

export const dynamic = 'force-dynamic';

// Minimal self-contained email shell (the layout()/cta() helpers in
// email-sequence are module-local and not exported). Dark theme to match the
// pause confirmation copy.
function pauseEmailHtml(name: string, resumeDate: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px;">
    <h2 style="color:#ffffff;font-size:22px;margin:0 0 16px;">⏸️ Account Paused</h2>
    <p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 12px;">Hi ${escapeHtml(name)},</p>
    <p style="color:#9ca3af;font-size:15px;line-height:1.7;margin:0 0 16px;">Your Rankall account is paused for 30 days. No charges will be made until ${escapeHtml(resumeDate)}.</p>
    <ul style="color:#9ca3af;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:20px;">
      <li>Your data is safe</li>
      <li>Paid features (scans, exports, reports) are paused while billing is paused</li>
      <li>Resume anytime from your dashboard — if a renewal fell inside the pause, resuming early starts a new billing period that day</li>
      <li>Auto-resumes in 30 days</li>
      <li>Pausing is available once every 6 months</li>
    </ul>
    <a href="https://www.rankall.io/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:10px;padding:14px 28px;font-weight:700;font-size:14px;">Resume My Account</a>
    <p style="color:#6b7280;font-size:12px;margin:16px 0 0;">To resume early, visit your dashboard and click "Resume Account".</p>
  </div>
</div></body></html>`;
}

// Pause the authenticated user's own subscription for 30 days (session-derived
// — no body ids). Stripe billing pauses with resumes_at = now + 30 days, the
// trusted pause flags go on app_metadata (enforced by the scan route), and a
// confirmation email is sent. Refused while trialing / past_due (see
// lib/billingAuth.pauseOwnSubscription).
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await pauseOwnSubscription(getBillingAdminClient(), user);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
    }

    // Pause confirmation email (best-effort — never blocks the pause).
    if (user.email) {
      const name = (user.user_metadata?.full_name as string) || 'there';
      const resumeDate = new Date(result.pauseUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      try {
        await sendEmail({
          to: user.email,
          subject: 'Your Rankall account is paused for 30 days',
          html: pauseEmailHtml(name, resumeDate),
          from: 'Rankall.io <hello@rankall.io>',
        });
      } catch (err) {
        console.error('pause email error:', err);
      }
    }

    return NextResponse.json({ success: true, pause_until: result.pauseUntil });
  } catch (err) {
    console.error('pause-subscription error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
