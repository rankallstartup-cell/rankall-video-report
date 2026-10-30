import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Win-back email — sent ~7 days after a cancellation. Runs daily; picks up
// cancellations whose cancelled_at falls in the [7d, 8d) window so each one is
// caught exactly once. Best-effort winback_sent flag guards against re-sends if
// the schedule overlaps.
export async function GET(req: NextRequest) {
  // Fail closed: no secret → no run (an unset secret used to match
  // "Bearer undefined"), and the spoofable x-vercel-cron header alone is
  // not accepted.
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

  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: cancels } = await supabase
    .from('cancellation_requests')
    .select('user_id, cancelled_at, winback_sent')
    .gte('cancelled_at', eightDaysAgo)
    .lt('cancelled_at', sevenDaysAgo)
    .limit(200);

  if (!cancels || cancels.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  let sent = 0;
  const seen = new Set<string>();
  for (const c of cancels) {
    const uid = c.user_id as string;
    if (!uid || seen.has(uid) || c.winback_sent) continue;
    seen.add(uid);

    // Resolve email + display name.
    const { data: userData } = await supabase.auth.admin.getUserById(uid);
    const email = userData?.user?.email;
    if (!email) continue;
    const name =
      (userData?.user?.user_metadata?.full_name as string) ||
      (userData?.user?.user_metadata?.name as string) ||
      email.split('@')[0];

    // Their last known score.
    const { data: lastScan } = await supabase
      .from('rankall_scans')
      .select('overall_score')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastScore = Number(lastScan?.overall_score) || 0;

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
  <h2 style="color:#0F172A;font-size:20px;margin:0 0 16px;">Your AI score has changed since you left Rankall</h2>
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${name},</p>
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">It's been 7 days since you cancelled. While you were away:</p>
  <ul style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 16px;padding-left:20px;">
    <li>Competitors may have improved their AI visibility</li>
    <li>AI assistants may be recommending them instead of you</li>
  </ul>
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;">Your last score was <strong>${lastScore}/100</strong>. We'd love to have you back.</p>
  <a href="https://www.rankall.io/pricing" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;padding:13px 28px;font-weight:700;font-size:14px;">Reactivate my account →</a>
  <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">Reactivating starts your paid plan right away — the free trial is one per customer. Cancel anytime; new payments are covered by our 14-day money-back guarantee if you haven't used it before.</p>
</div>`;

    // CAN-SPAM: never mail an unsubscribed / bounced address (lib/emailSuppression).
    if (await shouldSkipEmail({ email, userId: uid }, 'marketing_emails')) continue;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Nandish at Rankall <nandish@rankall.io>',
        to: email,
        subject: 'Your AI score has changed since you left Rankall',
        html,
      }),
    }).catch(() => {});

    // Best-effort: mark as sent so overlapping runs don't re-send (column may not exist).
    try {
      await supabase.from('cancellation_requests').update({ winback_sent: true }).eq('user_id', uid).gte('cancelled_at', eightDaysAgo).lt('cancelled_at', sevenDaysAgo);
    } catch { /* column optional */ }

    sent++;
    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({ ok: true, sent });
}
