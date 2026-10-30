import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Spam / abuse guards for public unauthenticated endpoints (/api/contact,
// /api/chat). Two layers:
//   1. Honeypot: a hidden form field humans never fill. Bots that fill
//      every input are dropped silently.
//   2. Durable per-IP limit in public_form_events (migration
//      20261016000500_public_form_rate_limits.sql) — the in-memory limiter
//      resets per serverless instance. Best-effort: if the table is
//      missing or the DB errors, the check FAILS OPEN (the in-memory
//      limiter still applies) and logs, so a missing migration never
//      blocks real customers from contacting us.

import { HONEYPOT_FIELD } from './publicFormGuardShared';
export { HONEYPOT_FIELD };

export function isHoneypotTripped(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const v = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof v === 'string' ? v.trim().length > 0 : v != null && v !== false;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`rankall-public-form:${ip}`).digest('hex').slice(0, 32);
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Returns false when `ip` already made `limit` requests of `kind` within
 * `windowMs`; otherwise records this request and returns true.
 */
export async function allowByDbLimit(
  admin: SupabaseClient,
  // 'waitlist' added when /api/waitlist merged (b8bh) — the union was
  // not widened with it, so staging HEAD failed tsc on the caller.
  // 'unsubscribe' added for /api/unsubscribe rate limiting (b8be).
  kind: 'contact' | 'chat' | 'waitlist' | 'unsubscribe',
  ip: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  const ipHash = hashIp(ip);
  try {
    const since = new Date(now.getTime() - windowMs).toISOString();
    const { count, error } = await admin
      .from('public_form_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', kind)
      .eq('ip_hash', ipHash)
      .gte('created_at', since);
    if (error) throw error;
    if ((count ?? 0) >= limit) return false;
    const { error: insErr } = await admin.from('public_form_events').insert({ kind, ip_hash: ipHash });
    if (insErr) console.error('[publicFormGuard] insert failed', insErr.message);
    return true;
  } catch (err) {
    console.error('[publicFormGuard] DB rate limit unavailable — failing open', err instanceof Error ? err.message : err);
    return true;
  }
}
