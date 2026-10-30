// lib/aiRouteGuard.ts — auth + shared rate limit for routes that spend paid
// AI / search credits (Anthropic, SerpAPI, Firecrawl) on a caller's behalf.
//
// SERVER-ONLY. These routes were unauthenticated: anyone could loop them and
// burn our API budget (and generate-fixes let anyone overwrite another
// customer's stored fix queue by passing their scanId).
//
// Rule:
//   - Signed-in users: allowed, metered per user in the DB-backed limiter.
//     A body scanId must be one they can access (owner or admin).
//   - Anonymous callers: refused, EXCEPT routes that are part of the public
//     funnel (allowAnonymous). An anonymous call that names a scan only
//     works on an OWNERLESS scan (homepage scan, user_id null) — never on a
//     customer's scan — and is metered per trusted client IP.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canAccessScan, getSessionUser, type SessionUser } from './apiAuth';
import { checkRateLimitDb, clientIpFromHeaders } from './rateLimit';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiGuardOptions {
  /** Rate-limit bucket name, e.g. 'ai:generate-fixes'. */
  bucket: string;
  /** Per-user daily limit for signed-in callers. */
  userLimit: number;
  /** When set, anonymous callers are allowed with this per-IP daily limit
   *  (and only on ownerless scans when a scan is named). */
  anonIpLimit?: number;
  /** Scan the call acts on (ownership-checked). */
  scanId?: string | null;
  /** Refuse the call when no scanId is given. */
  requireScan?: boolean;
}

export type ScanRow = Record<string, unknown> & { user_id?: string | null };

export type AiAccess = 'ok' | 'unauthenticated' | 'forbidden';

/** Pure access decision (unit-tested). */
export function aiScanAccess(
  scan: { user_id?: string | null } | null,
  user: { id: string; email?: string | null } | null,
  allowAnonymous: boolean,
): AiAccess {
  if (!scan) return user || allowAnonymous ? 'ok' : 'unauthenticated';
  const ownerless = !scan.user_id;
  if (user) {
    if (canAccessScan(scan, user)) return 'ok';
    // A signed-in user may run the public free-report features on an
    // ownerless scan (same as an anonymous visitor could).
    return ownerless && allowAnonymous ? 'ok' : 'forbidden';
  }
  if (!allowAnonymous) return 'unauthenticated';
  return ownerless ? 'ok' : 'unauthenticated';
}

export type AiGuardResult =
  | { ok: true; user: SessionUser | null; scan: ScanRow | null }
  | { ok: false; response: NextResponse };

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function guardAiRoute(req: NextRequest, opts: AiGuardOptions): Promise<AiGuardResult> {
  const allowAnonymous = typeof opts.anonIpLimit === 'number' && opts.anonIpLimit > 0;
  const user = await getSessionUser(req);

  if (!user && !allowAnonymous) {
    return { ok: false, response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) };
  }

  let scan: ScanRow | null = null;
  const scanId = typeof opts.scanId === 'string' && opts.scanId ? opts.scanId : null;
  if (opts.requireScan && !scanId) {
    return { ok: false, response: NextResponse.json({ error: 'scanId required' }, { status: 400 }) };
  }
  if (scanId) {
    try {
      const { data, error } = await adminClient().from('rankall_scans').select('*').eq('id', scanId).maybeSingle();
      if (error) {
        // Fail closed: we cannot prove the caller may act on this scan.
        return { ok: false, response: NextResponse.json({ error: 'Scan lookup failed' }, { status: 503 }) };
      }
      scan = (data as ScanRow | null) ?? null;
    } catch {
      return { ok: false, response: NextResponse.json({ error: 'Scan lookup failed' }, { status: 503 }) };
    }
    if (!scan) return { ok: false, response: NextResponse.json({ error: 'Scan not found' }, { status: 404 }) };
  }

  const access = aiScanAccess(scan, user, allowAnonymous);
  if (access === 'unauthenticated') {
    return { ok: false, response: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) };
  }
  if (access === 'forbidden') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const rl = user
    ? await checkRateLimitDb(`${opts.bucket}:user`, user.id, { limit: opts.userLimit, windowMs: DAY_MS })
    : await checkRateLimitDb(`${opts.bucket}:ip`, clientIpFromHeaders(req.headers), { limit: opts.anonIpLimit!, windowMs: DAY_MS });
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'rate_limited', message: 'Daily limit reached for this feature. Please try again tomorrow.' },
        { status: 429 },
      ),
    };
  }
  return { ok: true, user, scan };
}
