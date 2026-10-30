import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { recordBounce, recordSpamComplaint } from '@/lib/outreachGuard';
import { handleInboundReply } from '@/lib/outreachReplies';
import { verifySvixSignature } from '@/lib/svixVerify';

export const dynamic = 'force-dynamic';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _admin;
}

function domainFromAddress(from: unknown): string {
  if (typeof from === 'string') {
    const m = from.match(/@([^>\s]+)/);
    if (m) return m[1].toLowerCase();
  }
  return 'rankall.io';
}

// Flag a lead as hot if it has >=2 open/click events in the last 48h, then ping Slack.
async function checkHotLead(email: string): Promise<void> {
  try {
    const sb = admin();
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: events } = await sb
      .from('outreach_events')
      .select('event_type')
      .eq('email', email.toLowerCase())
      .in('event_type', ['open', 'click'])
      .gte('created_at', since);

    const count = events?.length ?? 0;
    if (count < 2) return;

    const { data: target } = await sb
      .from('outreach_targets')
      .select('business_name, city, rankall_score')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    const t = (target as { business_name?: string; city?: string; rankall_score?: number } | null) ?? null;
    const name = t?.business_name || email;
    const city = t?.city || 'unknown';
    const score = t?.rankall_score ?? 0;

    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🔥 HOT LEAD: ${name} in ${city} — Score ${score}/100, ${count} interactions in 48h, ${email}`,
        }),
      }).catch(() => {});
    }
  } catch (e) {
    console.error('checkHotLead error:', e);
  }
}

export async function POST(req: NextRequest) {
  // Resend signs webhooks with Svix. Unsigned, anyone could POST a fake
  // 'email.complained' and pause our sending domain, or a fake bounce to put
  // any address on do-not-contact. Fails CLOSED when the secret is unset.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend webhook] RESEND_WEBHOOK_SECRET unset — rejecting');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  const rawBody = await req.text();
  const valid = verifySvixSignature({
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
    body: rawBody,
    secret,
  });
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  try {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { body = {}; }
    const type = (body as { type?: string }).type;
    const data = (body as { data?: Record<string, unknown> }).data ?? {};

    const toArr = (data as { to?: unknown }).to;
    const email = String(
      (Array.isArray(toArr) ? toArr[0] : undefined) ??
      (data as { email?: unknown }).email ??
      ''
    ).toLowerCase().trim();

    const domain = domainFromAddress((data as { from?: unknown }).from);

    if (!email) {
      return NextResponse.json({ received: true });
    }

    switch (type) {
      case 'email.bounced':
        await recordBounce(email, domain);
        break;
      case 'email.complained':
        await recordSpamComplaint(email, domain);
        break;
      case 'email.opened':
        try {
          await admin().from('outreach_events').insert({ email, event_type: 'open', domain, created_at: new Date().toISOString() });
        } catch (e) { console.error('open insert error:', e); }
        await checkHotLead(email);
        break;
      case 'email.clicked':
        try {
          await admin().from('outreach_events').insert({ email, event_type: 'click', domain, created_at: new Date().toISOString() });
        } catch (e) { console.error('click insert error:', e); }
        await checkHotLead(email);
        break;
      case 'email.received':
        // Outreach reply detection (fix #3): a prospect replying to the
        // outreach inbox marks the target replied and stops the sequence.
        // Opens/clicks NEVER mark replied — only a real inbound reply does.
        // handleInboundReply is fail-open: malformed payloads and
        // auto-responders are ignored, never crash, never mark anyone.
        // Requires Resend Inbound configured for the sending domain
        // (see lib/outreachReplies.ts header) — until then this never fires.
        // NOTE: `data.to` here is OUR inbox, not the prospect; the handler
        // matches on `data.from` (the prospect's address), never on `email`.
        await handleInboundReply(data);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error('resend webhook error:', e);
  }
  return NextResponse.json({ received: true });
}
