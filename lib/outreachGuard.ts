// lib/outreachGuard.ts
// Every outreach send MUST pass checkOutreachAllowed() first. Protects sending
// domains (warming schedule + bounce/spam auto-pause) and never contacts
// unsubscribed/bounced leads. Server-side only (service-role key).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

// Domain warming schedule — ramp sending volume as reputation builds.
const WARMING_SCHEDULE = [
  { day: 1, limit: 20 },
  { day: 7, limit: 50 },
  { day: 14, limit: 100 },
  { day: 21, limit: 150 },
  { day: 30, limit: 200 },
];

function getDailyLimit(createdAt: Date): number {
  const days = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  for (let i = WARMING_SCHEDULE.length - 1; i >= 0; i--) {
    if (days >= WARMING_SCHEDULE[i].day) return WARMING_SCHEDULE[i].limit;
  }
  return 20;
}

export interface OutreachGuardResult {
  allowed: boolean;
  reason?: string;
  domain?: string;
  dailyLimit?: number;
  sentToday?: number;
  remaining?: number;
}

export async function checkOutreachAllowed(
  recipientEmail: string,
  senderDomain: string,
): Promise<OutreachGuardResult> {
  const email = (recipientEmail || '').toLowerCase().trim();
  const sb = admin();

  // 1. Do-not-contact list.
  const { data: dnc } = await sb.from('do_not_contact').select('email, reason').eq('email', email).maybeSingle();
  if (dnc) {
    return { allowed: false, reason: `On do-not-contact list: ${(dnc as { reason: string }).reason}`, domain: senderDomain };
  }

  // 2. Domain health — create on first use.
  const { data: health } = await sb.from('outreach_domain_health').select('*').eq('domain', senderDomain).maybeSingle();
  if (!health) {
    await sb.from('outreach_domain_health').insert({ domain: senderDomain, daily_limit: 20, sent_today: 0, status: 'warming' });
    return { allowed: true, domain: senderDomain, dailyLimit: 20, sentToday: 0, remaining: 20 };
  }
  const h = health as Record<string, unknown>;

  // 3. Paused domain.
  if (h.status === 'paused') {
    return { allowed: false, reason: `Domain paused: ${h.pause_reason ?? 'unknown'}`, domain: senderDomain };
  }

  // 4. Spam complaint → pause immediately.
  if ((h.spam_complaint_count as number) > 0) {
    await sb.from('outreach_domain_health').update({ status: 'paused', paused_at: new Date().toISOString(), pause_reason: 'Spam complaint received' }).eq('domain', senderDomain);
    return { allowed: false, reason: 'Domain paused due to spam complaint', domain: senderDomain };
  }

  // 5. Bounce rate > 5% → pause.
  if ((h.bounce_rate as number) > 5) {
    await sb.from('outreach_domain_health').update({ status: 'paused', paused_at: new Date().toISOString(), pause_reason: `Bounce rate too high: ${h.bounce_rate}%` }).eq('domain', senderDomain);
    return { allowed: false, reason: `Bounce rate exceeds 5%: ${h.bounce_rate}%`, domain: senderDomain };
  }

  // 6. Daily limit (warming schedule).
  const dailyLimit = getDailyLimit(new Date(h.created_at as string));
  const sentToday = (h.sent_today as number) ?? 0;
  if (sentToday >= dailyLimit) {
    return { allowed: false, reason: `Daily limit reached: ${sentToday}/${dailyLimit} sent today`, domain: senderDomain, dailyLimit, sentToday, remaining: 0 };
  }

  return { allowed: true, domain: senderDomain, dailyLimit, sentToday, remaining: dailyLimit - sentToday };
}

export async function recordEmailSent(targetId: string | null, email: string, domain: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const sb = admin();
  try {
    await sb.from('outreach_events').insert({ target_id: targetId, email: email.toLowerCase(), event_type: 'sent', domain, metadata, created_at: new Date().toISOString() });
    await sb.rpc('increment_domain_sent', { p_domain: domain });
  } catch (e) {
    console.error('recordEmailSent error:', e);
  }
}

export async function addToDoNotContact(email: string, reason: string, source = 'system'): Promise<void> {
  const sb = admin();
  const e = email.toLowerCase();
  try {
    await sb.from('do_not_contact').upsert({ email: e, reason, source, added_at: new Date().toISOString() }, { onConflict: 'email' });
    await sb.from('outreach_targets').update({ do_not_contact: true, unsubscribed_at: new Date().toISOString() }).eq('email', e);
  } catch (err) {
    console.error('addToDoNotContact error:', err);
  }
}

export async function recordBounce(email: string, domain: string): Promise<void> {
  const sb = admin();
  const e = email.toLowerCase();
  try {
    await sb.from('outreach_events').insert({ email: e, event_type: 'bounce', domain, created_at: new Date().toISOString() });
    const { data: health } = await sb.from('outreach_domain_health').select('bounce_count, sent_this_month').eq('domain', domain).maybeSingle();
    if (health) {
      const hh = health as Record<string, number>;
      const newBounceCount = (hh.bounce_count ?? 0) + 1;
      const bounceRate = (newBounceCount / Math.max(hh.sent_this_month ?? 0, 1)) * 100;
      await sb.from('outreach_domain_health').update({ bounce_count: newBounceCount, bounce_rate: bounceRate, updated_at: new Date().toISOString() }).eq('domain', domain);
    }
    await addToDoNotContact(e, 'Email bounced', 'bounce');
  } catch (err) {
    console.error('recordBounce error:', err);
  }
}

export async function recordSpamComplaint(email: string, domain: string): Promise<void> {
  const sb = admin();
  const e = email.toLowerCase();
  try {
    await sb.from('outreach_events').insert({ email: e, event_type: 'spam_complaint', domain, created_at: new Date().toISOString() });
    await sb.rpc('increment_spam_count', { p_domain: domain });
    await sb.from('outreach_domain_health').update({ status: 'paused', paused_at: new Date().toISOString(), pause_reason: 'Spam complaint', updated_at: new Date().toISOString() }).eq('domain', domain);
    await addToDoNotContact(e, 'Spam complaint', 'spam');
    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚨 SPAM COMPLAINT from ${e} on domain ${domain}. Domain paused immediately.` }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('recordSpamComplaint error:', err);
  }
}

// Unsubscribe-link HMAC key. No hardcoded fallback: the old literal was
// public (it shipped in client bundles), so anyone could mint tokens.
// Without a secret, tokens are empty and verification fails closed.
function unsubscribeSecret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}

export function generateUnsubscribeToken(email: string): string {
  const secret = unsubscribeSecret();
  if (!secret) {
    console.error('[outreachGuard] UNSUBSCRIBE_SECRET/CRON_SECRET unset — unsubscribe tokens disabled');
    return '';
  }
  return crypto
    .createHmac('sha256', secret)
    .update((email || '').toLowerCase())
    .digest('hex')
    .substring(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  if (!expected || !token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Standard unsubscribe footer for every outreach email.
export function unsubscribeFooter(email: string): string {
  const token = generateUnsubscribeToken(email);
  const e = encodeURIComponent(email);
  return `<p style="font-size:11px;color:#6b7280;margin-top:40px;border-top:1px solid #e5e7eb;padding-top:16px">You received this because your business matches our criteria for AI visibility improvement.<br/><a href="https://rankall.io/unsubscribe?email=${e}&token=${token}" style="color:#6b7280">Unsubscribe</a>&nbsp;·&nbsp;<a href="https://rankall.io" style="color:#6b7280">rankall.io</a></p>`;
}
