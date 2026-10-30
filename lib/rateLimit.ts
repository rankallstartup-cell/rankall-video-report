// Rate limiting.
//
// checkRateLimit (sync, in-memory) is kept for existing callers, but it is
// per-instance: on serverless every cold instance starts with empty buckets,
// so it is a soft speed bump only. Money / trial entry points use
// checkRateLimitDb, which counts in the shared `rate_limits` table
// (supabase/migrations/20261016000300_billing_hardening.sql) via an atomic SQL
// function, and falls back to the in-memory bucket if the table/function is
// not installed yet.
//
// IP derivation: the FIRST x-forwarded-for entry is client-supplied (any
// caller can send `X-Forwarded-For: 1.2.3.4` and get a fresh bucket per
// request). clientIpFromHeaders prefers the platform-set headers (x-real-ip,
// x-vercel-forwarded-for) and otherwise uses the LAST x-forwarded-for hop —
// the one appended by our own edge, not the client.
import { createClient } from '@supabase/supabase-js';

const buckets = new Map<string, { count: number; reset: number }>();

const ANON_LIMIT = 3;
const AUTH_LIMIT = 50;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function checkRateLimit(
  ip: string,
  userId?: string | null,
  opts?: { limit?: number; windowMs?: number },
): { allowed: boolean; remaining: number; limit: number } {
  const now = Date.now();
  const limit = opts?.limit ?? (userId ? AUTH_LIMIT : ANON_LIMIT);
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const key = `${limit}:${windowMs}:${userId || ip}`;

  let entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count <= limit, remaining, limit };
}

type HeaderLike = { get(name: string): string | null };

// Trusted client IP. Never the first (client-controlled) XFF entry.
export function clientIpFromHeaders(headers: HeaderLike): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) {
    const first = vercel.split(',')[0]?.trim();
    if (first) return first;
  }
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return 'unknown';
}

// Fixed-window key: bucket + subject + window start. Pure (unit-tested).
export function rateLimitWindowKey(
  bucket: string,
  subject: string,
  windowMs: number,
  nowMs: number = Date.now(),
): { key: string; windowStart: string } {
  const startMs = Math.floor(nowMs / windowMs) * windowMs;
  return { key: `${bucket}:${subject}:${startMs}`, windowStart: new Date(startMs).toISOString() };
}

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}

// Shared (DB-backed) fixed-window limiter. `bucket` names the action
// (e.g. 'checkout:user'), `subject` is the user id or trusted IP.
export async function checkRateLimitDb(
  bucket: string,
  subject: string,
  opts: { limit: number; windowMs: number },
  client: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> } = admin() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  },
): Promise<{ allowed: boolean; remaining: number; limit: number; source: 'db' | 'memory' }> {
  const { key, windowStart } = rateLimitWindowKey(bucket, subject, opts.windowMs);
  try {
    const { data, error } = await client.rpc('rate_limit_hit', {
      p_key: key,
      p_window_start: windowStart,
      p_window_seconds: Math.ceil(opts.windowMs / 1000),
    });
    if (error) throw error;
    const count = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(count)) throw new Error('rate_limit_hit returned no count');
    return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count), limit: opts.limit, source: 'db' };
  } catch (err) {
    console.error('[rateLimit] DB limiter unavailable, using in-memory fallback:', (err as Error)?.message ?? err);
    const r = checkRateLimit(subject, `${bucket}:${subject}`, opts);
    return { ...r, source: 'memory' };
  }
}
