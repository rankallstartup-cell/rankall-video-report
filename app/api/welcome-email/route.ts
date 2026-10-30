import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSessionUser, isCronRequest } from '@/lib/apiAuth';
import { withCanonicalImpacts } from '@/lib/fixIntelligence';
import { generateUnsubscribeToken } from '@/lib/outreachGuard';
import { trackFunnelEvent, readSourceCookie } from '@/lib/funnel';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_HOT_LEADS;

async function notifySlack(email: string, businessName: string | null) {
  if (!SLACK_WEBHOOK) return;
  const time = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const text = `🔥 New signup: ${email} | ${businessName || '—'} | ${time} ET`;
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(err => console.error('Slack notify error:', err));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const businessName: string | null = typeof body.businessName === 'string' ? body.businessName.slice(0, 200) : null;

    // Auth: either the internal caller (auth/callback, server-side, with
    // Bearer CRON_SECRET — fails closed when unset) for the user it just
    // signed in, or the signed-in user themselves. The old route took
    // userId + email from the body: anyone could read another user's latest
    // scan numbers and have them emailed to any address (and spam Slack).
    let userId: string | null;
    let email: string | null;
    if (isCronRequest(req)) {
      userId = typeof body.userId === 'string' ? body.userId : null;
      email = typeof body.email === 'string' ? body.email : null;
    } else {
      const user = await getSessionUser(req);
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      userId = user.id;
      email = user.email;
    }
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    // CONV-00: funnel instrumentation — a signup with a business name is the
    // "profile claimed" stage (fire-and-forget, never throws).
    trackFunnelEvent({
      event: 'profile_claimed',
      userId,
      email,
      ...readSourceCookie(req),
      metadata: { business_name: businessName },
    });

    // Fire Slack alert immediately — non-blocking
    notifySlack(email, businessName ?? null);

    if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

    // Fetch most recent scan if user has one
    let scan: {
      overall_score: number;
      mentioned_count: number;
      competitor_name: string | null;
      trust_signals: { overall?: number } | null;
    } | null = null;

    let topFixes: Array<{ fix_title: string; predicted_impact: number | null }> = [];

    if (userId) {
      const { data: scanData } = await supabase
        .from('rankall_scans')
        .select('id, overall_score, mentioned_count, competitor_name, trust_signals')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (scanData) {
        scan = scanData;

        // ax81: read the user's generated fixes (the old query matched
        // fix_predictions.scan_id against the USER id, so it never hit) and
        // normalise each impact to the canonical per-fix number at read time
        // — the same number the fix queue shows — then rank by it.
        const { data: fixes } = await supabase
          .from('generated_fixes')
          .select('fix_title, fix_type')
          .eq('user_id', userId)
          .eq('status', 'pending_review')
          .order('created_at', { ascending: false })
          .limit(20);

        topFixes = withCanonicalImpacts((fixes ?? []) as Array<{ fix_title: string; fix_type: string | null }>).slice(0, 2);
      }
    }

    const html = buildWelcomeEmail(email, scan, topFixes);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: [email],
        subject: 'Welcome to Rankall.io — here\'s what AI says about your industry',
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend error:', data);
      return NextResponse.json({ error: data.message || 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Welcome email error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

function buildWelcomeEmail(
  email: string,
  scan: { overall_score: number; mentioned_count: number; competitor_name: string | null; trust_signals: { overall?: number } | null } | null,
  topFixes: Array<{ fix_title: string; predicted_impact: number | null }>
): string {
  const hasScan = !!scan;

  const scanSection = hasScan ? `
    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:14px;padding:24px 28px;margin:24px 0;">
      <p style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Your Latest Scan Results</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:32px;font-weight:900;color:#2563EB;margin:0 0 4px;line-height:1;">${scan!.overall_score}%</p>
          <p style="font-size:11px;color:#64748B;margin:0;">AI Platform Coverage</p>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:32px;font-weight:900;color:${scan!.overall_score >= 75 ? '#059669' : scan!.overall_score >= 50 ? '#D97706' : '#DC2626'};margin:0 0 4px;line-height:1;">${(scan!.trust_signals as any)?.overall ?? '—'}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">Trust Score</p>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:14px 16px;text-align:center;">
          <p style="font-size:32px;font-weight:900;color:#0F172A;margin:0 0 4px;line-height:1;">${scan!.mentioned_count}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">Platforms Mention You</p>
        </div>
      </div>
      ${scan!.competitor_name ? `
      <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
        <p style="font-size:13px;color:#DC2626;margin:0;font-weight:600;">⚠ Top competitor detected: <strong>${scan!.competitor_name}</strong></p>
      </div>` : ''}
      ${topFixes.length > 0 ? `
      <p style="font-size:12px;font-weight:700;color:#0F172A;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.06em;">Top Fixes for You</p>
      ${topFixes.map(f => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #E2E8F0;">
          <div style="width:8px;height:8px;border-radius:50%;background:#2563EB;flex-shrink:0;"></div>
          <span style="font-size:13px;color:#0F172A;flex:1;">${f.fix_title}</span>
          ${f.predicted_impact != null ? `<span style="font-size:12px;font-weight:700;color:#059669;">est. +${f.predicted_impact} pts</span>` : ''}
        </div>`).join('')}` : ''}
    </div>
  ` : `
    <div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:14px;padding:28px;margin:24px 0;text-align:center;">
      <p style="font-size:16px;font-weight:700;color:#0F172A;margin:0 0 8px;">Run your first scan to see your AI visibility score</p>
      <p style="font-size:13px;color:#64748B;margin:0 0 20px;line-height:1.6;">Find out if ChatGPT, Gemini, Perplexity, and 8 other AI platforms are recommending your business.</p>
      <a href="https://rankall.io" style="display:inline-block;background:#2563EB;border-radius:10px;padding:13px 28px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;box-shadow:0 4px 14px rgba(37,99,235,0.4);">Run your first scan →</a>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to Rankall.io</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="background:#0F172A;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;margin-bottom:0;">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:36px;height:36px;background:#2563EB;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="font-size:18px;font-weight:900;color:#fff;line-height:1;">R</span>
        </div>
        <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">rankall<span style="color:#60A5FA;">.io</span></span>
      </div>
      <p style="font-size:11px;font-weight:600;color:#94A3B8;margin:0;letter-spacing:0.08em;text-transform:uppercase;">AI Recommendation Intelligence</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border:1.5px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:36px 32px;">

      <h1 style="font-size:26px;font-weight:800;color:#0F172A;margin:0 0 10px;letter-spacing:-0.5px;">Welcome to Rankall.io 👋</h1>
      <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 6px;">
        You've just joined the only platform that shows you exactly how ChatGPT, Gemini, Perplexity, and 8 other AI platforms are recommending businesses in your industry.
      </p>
      <p style="font-size:15px;color:#64748B;line-height:1.7;margin:0 0 24px;">
        Every week, AI platforms are asked millions of questions like <em>"best dentist in Chicago"</em> or <em>"top rated plumber near me."</em> Rankall tracks whether they recommend <strong>you</strong> — or your competitors.
      </p>

      ${scanSection}

      <!-- What Rankall tracks -->
      <div style="margin:28px 0;">
        <p style="font-size:13px;font-weight:700;color:#0F172A;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">What Rankall tracks for you</p>
        ${[
          ['📊', 'AI Platform Coverage', 'How often ChatGPT, Gemini, Perplexity and 8 other AI platforms mention your business when customers ask for recommendations.'],
          ['🛡️', 'Trust Score', 'A composite score based on your technical setup, directory presence, review signals, and community mentions — the signals AI uses to decide who to recommend.'],
          ['🔄', 'Verification Rescans', 'When you mark a fix applied, we automatically rescan ~7 days later to verify it and send you the before/after comparison. How fast changes show depends on when each AI platform refreshes its data.'],
        ].map(([icon, title, desc]) => `
        <div style="display:flex;gap:14px;margin-bottom:18px;">
          <div style="font-size:22px;flex-shrink:0;margin-top:2px;">${icon}</div>
          <div>
            <p style="font-size:14px;font-weight:700;color:#0F172A;margin:0 0 3px;">${title}</p>
            <p style="font-size:13px;color:#64748B;line-height:1.6;margin:0;">${desc}</p>
          </div>
        </div>`).join('')}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0 8px;">
        <a href="https://rankall.io/dashboard" style="display:inline-block;background:#2563EB;border-radius:12px;padding:15px 36px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;box-shadow:0 4px 16px rgba(37,99,235,0.4);">
          View Your Dashboard →
        </a>
        <p style="font-size:12px;color:#94A3B8;margin:14px 0 0;">Or reply to this email — we read every message.</p>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 16px 8px;">
      <p style="font-size:12px;color:#94A3B8;margin:0 0 4px;">Rankall.io · AI Recommendation Intelligence</p>
      <p style="font-size:11px;color:#CBD5E1;margin:0;">You received this because you signed up at rankall.io · <a href="https://rankall.io/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${generateUnsubscribeToken(email)}" style="color:#CBD5E1;">Unsubscribe</a></p>
    </div>

  </div>
</body>
</html>`;
}
