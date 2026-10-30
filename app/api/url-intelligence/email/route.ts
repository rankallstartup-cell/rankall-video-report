import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/apiAuth';
import { escapeHtml } from '@/lib/escapeHtml';
import { checkRateLimit } from '@/lib/rateLimit';

// Security: was an unauthenticated relay that put caller-supplied HTML
// (url, signal names/values) into mail from hello@rankall.io to any address.
// Now: signed-in users only, per-user daily cap, one recipient, every
// interpolated value escaped, auditId URL-encoded.

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: 'Sign in to email reports' }, { status: 401 });
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const rawUrl = typeof body.url === 'string' ? body.url.slice(0, 500) : '';
    if (!email || !rawUrl) return NextResponse.json({ error: 'email and url required' }, { status: 400 });
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    const rl = checkRateLimit(`urlintel-email:${user.id}`, user.id, { limit: 10 });
    if (!rl.allowed) return NextResponse.json({ error: 'Daily email limit reached' }, { status: 429 });
    const url = escapeHtml(rawUrl);
    const score = Math.max(0, Math.min(100, Math.round(Number(body.score) || 0)));
    const signals: Array<{ status?: string; name?: string; value?: string }> = Array.isArray(body.signals) ? body.signals.slice(0, 100) : [];
    const auditId = typeof body.auditId === 'string' ? body.auditId : '';

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 });

    const failing = signals.filter((s) => s?.status === 'fail');
    const passing = signals.filter((s) => s?.status === 'pass');

    const scoreColor = score >= 75 ? '#059669' : score >= 50 ? '#D97706' : '#DC2626';
    const shareUrl = auditId ? `https://rankall.io/dashboard/url-intelligence?audit=${encodeURIComponent(auditId)}` : '';

    const failingRows = failing.slice(0, 5).map((s: { name?: string; value?: string }) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;font-weight:600">${escapeHtml(s.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#64748B">${escapeHtml(s.value)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">

    <div style="background:#2563EB;padding:32px 36px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center">
          <span style="color:#fff;font-weight:900;font-size:16px">R</span>
        </div>
        <span style="color:#fff;font-weight:800;font-size:16px">rankall.io</span>
      </div>
      <h1 style="color:#fff;font-size:22px;font-weight:800;margin:16px 0 6px">Your AI Readiness Audit</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:0">${url}</p>
    </div>

    <div style="padding:32px 36px">
      <div style="text-align:center;background:#F8FAFC;border-radius:14px;padding:24px;margin-bottom:28px;border:1.5px solid #E2E8F0">
        <p style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">AI Readiness Score</p>
        <p style="font-size:64px;font-weight:900;color:${scoreColor};margin:0;line-height:1">${score}</p>
        <p style="font-size:13px;color:#64748B;margin:4px 0 0">/100</p>
        <div style="display:flex;justify-content:center;gap:24px;margin-top:16px">
          <div style="text-align:center">
            <p style="font-size:20px;font-weight:800;color:#059669;margin:0">${passing.length}</p>
            <p style="font-size:11px;color:#64748B;margin:2px 0 0">Passing</p>
          </div>
          <div style="text-align:center">
            <p style="font-size:20px;font-weight:800;color:#DC2626;margin:0">${failing.length}</p>
            <p style="font-size:11px;color:#64748B;margin:2px 0 0">Failing</p>
          </div>
        </div>
      </div>

      ${failing.length > 0 ? `
      <h2 style="font-size:15px;font-weight:800;color:#0F172A;margin:0 0 14px">Top Issues to Fix</h2>
      <table style="width:100%;border-collapse:collapse;border:1.5px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:28px">
        <thead>
          <tr style="background:#F8FAFC">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em">Signal</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.06em">Status</th>
          </tr>
        </thead>
        <tbody>${failingRows}</tbody>
      </table>` : ''}

      ${shareUrl ? `
      <div style="text-align:center;margin-bottom:28px">
        <a href="${shareUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:14px">
          View Full Audit Report →
        </a>
      </div>` : ''}

      <p style="font-size:12px;color:#94A3B8;text-align:center;margin:0">
        Sent by rankall.io · <a href="https://rankall.io" style="color:#2563EB;text-decoration:none">rankall.io</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'hello@rankall.io',
        to: email,
        subject: `AI Readiness Audit: ${rawUrl.replace(/[\r\n]+/g, ' ').slice(0, 120)} scored ${score}/100`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('[url-intelligence/email] Resend error:', err);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[url-intelligence/email] error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
