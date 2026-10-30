// lib/outreachReplies.ts
// Outreach improvement #3: reply detection + conversion tracking.
//
// REPLY DETECTION — mechanism: Resend Inbound ("email.received" webhook events).
// Resend receives mail sent to the outreach inbox (outreach@rankall.io) and
// POSTs an `email.received` event to the existing Resend webhook endpoint
// (app/api/webhooks/resend/route.ts), which already verifies the Svix
// signature. There is NO other inbound mechanism in the stack: no IMAP
// polling, no Gmail/Outlook integration, no separate reply mailbox.
//
// REQUIRED CONFIG before this is live (nothing in code can do it):
//   1. In the Resend dashboard, enable Inbound (Receiving) for the sending
//      domain and point it at https://rankall.io/api/webhooks/resend.
//   2. Point the domain's MX records at Resend (per Resend's inbound setup).
//   3. RESEND_WEBHOOK_SECRET must be set (already required by the webhook).
// Until then `email.received` never arrives and this module is dormant —
// safe by construction: it only runs when Resend delivers a reply.
//
// MATCHING — a reply is matched to a prospect by the SENDER's email address
// (the prospect replying from the address we emailed). We do NOT rely on
// In-Reply-To / References threading, because neither send path stores the
// Resend message-id of the outbound mail, so there is nothing to thread
// against. If a reply arrives from an address with no outreach target, it
// is ignored — nobody is ever marked replied on a guess.
//
// CONVERSIONS — wired only where a reliable signal already exists:
//   * Stripe checkout.session.completed (trialing or active, after the
//     duplicate backstop) → markOutreachConverted(email, 'stripe_checkout').
//     A checkout is a signup with payment: the strongest conversion signal.
//   * NOT wired: free signup (no server-side signup hook exists in the
//     stack — Supabase Auth writes no row we can observe), and Cal.com
//     booking (no Cal.com webhook exists — only a demo booking link).
//     Both are documented follow-ups, not half-built code.
//   * Domain matching is deliberately NOT done: a signup from
//     someone-else@company.com must not mark the prospect person@company.com
//     converted. Exact email match only.
//
// SAFETY — open/click NEVER marks replied/converted (they are engagement,
// not a reply). Auto-responders / out-of-office mail NEVER marks replied
// (see isAutoReply). Every function here is fail-open: on any error it
// logs and returns a safe result, never throws into a webhook.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The outreach inbox. Outbound sends set reply_to to this address so human
// replies land in the mailbox Resend Inbound watches.
export const OUTREACH_INBOX_ADDRESS = 'outreach@rankall.io';

// Statuses on outreach_targets that mean "do not touch again".
const TERMINAL_STATUSES = ['converted', 'unsubscribed', 'stopped'];

// A reply may still upgrade to converted (prospect replied, then bought).
// Everything else terminal blocks a later mark.
const CONVERT_BLOCKERS = ['converted', 'unsubscribed', 'stopped'];

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}

// ── Address helpers ──────────────────────────────────────────────────────

function addressFrom(value: unknown): string {
  if (typeof value === 'string') {
    const m = value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0].toLowerCase() : '';
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.address === 'string') return addressFrom(v.address);
    if (typeof v.email === 'string') return addressFrom(v.email);
  }
  return '';
}

function addressesFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(addressFrom).filter(Boolean);
  }
  const single = addressFrom(value);
  return single ? [single] : [];
}

// ── Auto-responder detection (pure) ──────────────────────────────────────
//
// A human reply must mark replied. An auto-responder must NOT. Layered
// checks: headers first (most reliable), then subject, then sender.
// Body text is deliberately NOT inspected: a human quoting an out-of-office
// notice ("see below — I'm out of office...") must not be misclassified.

export interface AutoReplyInput {
  headers?: unknown;
  subject?: unknown;
  from?: unknown;
}

function headersToMap(headers: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === 'object') {
        const name = String((h as Record<string, unknown>).name ?? (h as Record<string, unknown>).key ?? '');
        const val = String((h as Record<string, unknown>).value ?? '');
        if (name) map.set(name.toLowerCase(), val);
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      map.set(k.toLowerCase(), String(v ?? ''));
    }
  }
  return map;
}

const AUTO_SUBJECT_RE =
  /out of (the )?office|automatic(ally)? (reply|response|generated)|auto[-\s]?reply|auto[-\s]?response|auto[-\s]?responder|vacation (reply|response|responder)|away from (the )?office|on (annual )?leave|delivery (status|failure|report)|undeliverable|non[-\s]?delivery|mail delivery|returned mail|postmaster|delivery notification|failure notice|message (not )?deliver|mailer[-\s]?daemon/i;

const AUTO_FROM_LOCALPARTS = new Set([
  'mailer-daemon', 'postmaster', 'donotreply', 'do-not-reply', 'noreply', 'no-reply',
  'bounce', 'bounces', 'auto-reply', 'autoreply', 'auto-replies', 'auto-responder',
  'autoresponder', 'vacation', 'out-of-office', 'ooo',
]);

export function isAutoReply(input: AutoReplyInput): boolean {
  const headers = headersToMap(input.headers);
  const subject = typeof input.subject === 'string' ? input.subject : '';

  // 1. Headers — the strongest signal.
  const autoSubmitted = headers.get('auto-submitted');
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== 'no') return true;
  const precedence = headers.get('precedence');
  if (precedence && ['auto_reply', 'bulk', 'junk'].includes(precedence.trim().toLowerCase())) return true;
  if (headers.has('x-autoreply') || headers.has('x-autorespond') || headers.has('x-auto-response')) return true;

  // 2. Subject line.
  if (subject && AUTO_SUBJECT_RE.test(subject)) return true;

  // 3. Sender local-part (mailer-daemon@, noreply@, ...).
  const from = addressFrom(input.from);
  const local = from.split('@')[0] ?? '';
  if (local && AUTO_FROM_LOCALPARTS.has(local)) return true;

  return false;
}

// ── Inbound reply parsing (pure) ─────────────────────────────────────────

export interface ParsedInboundReply {
  fromEmail: string;
  toEmails: string[];
  subject: string;
  headers: unknown;
}

export function parseInboundReply(data: unknown): ParsedInboundReply | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const fromEmail = addressFrom(d.from);
  if (!fromEmail) return null;
  return {
    fromEmail,
    toEmails: addressesFrom(d.to),
    subject: typeof d.subject === 'string' ? d.subject : '',
    headers: d.headers ?? d.header ?? null,
  };
}

// ── Sequence stop (shared by reply + conversion) ─────────────────────────

async function stopSequenceForTarget(
  sb: SupabaseClient,
  targetId: string,
  reason: string,
): Promise<void> {
  try {
    await sb
      .from('outreach_sequence_log')
      .update({ status: 'stopped', error: reason })
      .eq('target_id', targetId)
      .eq('status', 'pending');
  } catch (e) {
    console.error('[outreachReplies] stopSequence error:', e);
  }
}

// ── Reply handling ───────────────────────────────────────────────────────

export type ReplyOutcome =
  | { marked: true; targetId: string }
  | { marked: false; reason: 'malformed' | 'not_outreach_inbox' | 'auto_reply' | 'unknown_sender' | 'already_terminal' | 'error' };

export async function handleInboundReply(
  data: unknown,
  sb: SupabaseClient = admin(),
): Promise<ReplyOutcome> {
  try {
    const parsed = parseInboundReply(data);
    if (!parsed) return { marked: false, reason: 'malformed' };

    // The webhook serves all Resend mail. Only process mail actually sent
    // to the outreach inbox. (If Resend omits `to`, process by sender
    // match — the webhook is dedicated to outreach events.)
    if (parsed.toEmails.length > 0 && !parsed.toEmails.includes(OUTREACH_INBOX_ADDRESS)) {
      return { marked: false, reason: 'not_outreach_inbox' };
    }

    // Auto-responders / out-of-office must NEVER mark replied.
    if (isAutoReply({ headers: parsed.headers, subject: parsed.subject, from: parsed.fromEmail })) {
      return { marked: false, reason: 'auto_reply' };
    }

    // Match the prospect by sender email. No target → ignore, never guess.
    const { data: target } = await sb
      .from('outreach_targets')
      .select('id, email, status')
      .eq('email', parsed.fromEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!target) return { marked: false, reason: 'unknown_sender' };

    const t = target as { id: string; email: string; status?: string | null };
    const status = (t.status || '').toLowerCase();
    // Already replied (or further along) → nothing left to do. A second
    // reply needs no action: the sequence is already stopped.
    if (status === 'replied' || TERMINAL_STATUSES.includes(status)) {
      return { marked: false, reason: 'already_terminal' };
    }

    await sb.from('outreach_targets').update({ status: 'replied' }).eq('id', t.id);
    await stopSequenceForTarget(sb, t.id, 'prospect_replied');
    try {
      await sb.from('outreach_events').insert({
        target_id: t.id,
        email: parsed.fromEmail,
        event_type: 'reply',
        domain: 'rankall.io',
        metadata: { subject: parsed.subject },
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[outreachReplies] reply event insert error:', e);
    }
    return { marked: true, targetId: t.id };
  } catch (e) {
    console.error('[outreachReplies] handleInboundReply error:', e);
    return { marked: false, reason: 'error' };
  }
}

// ── Conversion handling ──────────────────────────────────────────────────
//
// Exact email match only (see header: domain matching misattributes).
// Called as a fail-open side effect from the Stripe billing webhook on
// checkout.session.completed (trialing or active, after the duplicate
// backstop). Never throws into billing.

export async function markOutreachConverted(
  email: string,
  source: string,
  sb: SupabaseClient = admin(),
): Promise<boolean> {
  try {
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return false;
    const { data: target } = await sb
      .from('outreach_targets')
      .select('id, email, status')
      .eq('email', normalized)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!target) return false;
    const t = target as { id: string; email: string; status?: string | null };
    const status = (t.status || '').toLowerCase();
    if (CONVERT_BLOCKERS.includes(status)) return false;

    await sb.from('outreach_targets').update({ status: 'converted' }).eq('id', t.id);
    await stopSequenceForTarget(sb, t.id, 'prospect_converted');
    try {
      await sb.from('outreach_events').insert({
        target_id: t.id,
        email: normalized,
        event_type: 'converted',
        domain: 'rankall.io',
        metadata: { source },
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[outreachReplies] converted event insert error:', e);
    }
    return true;
  } catch (e) {
    console.error('[outreachReplies] markOutreachConverted error:', e);
    return false;
  }
}
