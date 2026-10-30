import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/emailTemplates';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isHoneypotTripped, clientIp, allowByDbLimit } from '@/lib/publicFormGuard';

// Contact form delivery. Previously the /contact page never sent anything —
// the submit button just flipped local state to "Message received" while
// discarding the message. This route delivers the message to the team inbox
// via the shared Resend sender (lib/emailTemplates.ts).

const CONTACT_INBOX = 'hello@rankall.io';
// Durable limit (DB): 5 messages per IP per hour.
const DB_LIMIT = 5;
const DB_WINDOW_MS = 60 * 60 * 1000;

const TYPE_LABELS: Record<string, string> = {
  demo: 'Book a product demo',
  agency_demo: 'Agency demo request',
  agency: 'Agency white-label enquiry',
  enterprise: 'Enterprise or Compliance',
  support: 'Technical support',
  other: 'Something else',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Honeypot: the hidden field is never filled by a human. Answer like a
    // success so the bot learns nothing, but send nothing.
    if (isHoneypotTripped(body)) {
      return NextResponse.json({ success: true });
    }

    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const company = String(body.company ?? '').trim();
    const message = String(body.message ?? '').trim();
    const type = typeof body.type === 'string' && body.type in TYPE_LABELS ? body.type : 'other';

    if (!name || name.length > 200) {
      return NextResponse.json({ error: 'Name is required (max 200 characters)' }, { status: 400 });
    }
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (!message || message.length > 5000) {
      return NextResponse.json({ error: 'Message is required (max 5000 characters)' }, { status: 400 });
    }
    if (company.length > 300) {
      return NextResponse.json({ error: 'Company/website must be at most 300 characters' }, { status: 400 });
    }

    // Edge spam protection. The in-memory bucket is namespaced so contact
    // messages no longer share the anonymous SCAN bucket (same limit +
    // window = same key before — 3 scans blocked the contact form). The
    // DB limit survives cold starts / multiple instances.
    const ip = clientIp(req.headers);
    const rl = checkRateLimit(`contact:${ip}`, null);
    let dbAllowed = true;
    if (rl.allowed) {
      try {
        dbAllowed = await allowByDbLimit(getSupabaseAdmin(), 'contact', ip, DB_LIMIT, DB_WINDOW_MS);
      } catch (err) {
        // getSupabaseAdmin throws when env is missing — fail open, logged.
        console.error('[contact] DB limiter unavailable', err instanceof Error ? err.message : err);
      }
    }
    if (!rl.allowed || !dbAllowed) {
      return NextResponse.json(
        { error: 'Too many messages sent from this address. Please try again later or email hello@rankall.io directly.' },
        { status: 429 },
      );
    }

    const typeLabel = TYPE_LABELS[type];
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#1B17FF;padding:28px 32px">
      <span style="color:#fff;font-weight:800;font-size:16px">rankall.io</span>
      <h1 style="color:#fff;font-size:20px;font-weight:800;margin:12px 0 0">New contact form message</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Topic:</strong> ${escapeHtml(typeLabel)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 16px"><strong>Company / Website:</strong> ${escapeHtml(company || '—')}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 8px"><strong>Message:</strong></p>
      <p style="font-size:14px;color:#334155;margin:0;white-space:pre-wrap;line-height:1.6">${escapeHtml(message)}</p>
    </div>
  </div>
</body>
</html>`;

    const sent = await sendEmail({
      to: CONTACT_INBOX,
      subject: `New contact form: ${typeLabel} — ${name}`,
      html,
      from: 'Rankall.io <hello@rankall.io>',
      replyTo: email,
    });

    if (!sent) {
      // sendEmail already logs the underlying cause server-side.
      return NextResponse.json(
        { error: 'We could not send your message. Please try again or email hello@rankall.io directly.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return NextResponse.json(
      { error: 'We could not send your message. Please try again or email hello@rankall.io directly.' },
      { status: 500 },
    );
  }
}
