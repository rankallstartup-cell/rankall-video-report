// lib/apiAuth.ts — shared server-side auth helpers for API routes.
//
// SERVER-ONLY (imports node:crypto). Every route that acts on a user's
// data derives the user from the SESSION cookie, never from a body or
// query userId/email, and ownership-checks any body/query id before it
// touches the service-role client.
import { timingSafeEqual } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { isAdminUser } from './planConfig';

export interface SessionUser {
  id: string;
  email: string | null;
  app_metadata?: Record<string, unknown>;
}

/** The logged-in user from the request's Supabase session cookies, or
 *  null. Uses auth.getUser() (server-verified), never getSession(). */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      app_metadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** Constant-time string compare. False when either side is empty. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True only when `Authorization: Bearer <secret>` matches a SET secret.
 *  Fails CLOSED when the secret env var is unset/empty — the old
 *  `auth === \`Bearer ${process.env.CRON_SECRET}\`` pattern accepted the
 *  literal header "Bearer undefined" whenever the env var was missing. */
export function hasBearerSecret(req: Request, secret: string | null | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  return safeEqual(m[1].trim(), secret);
}

export function isCronRequest(req: Request): boolean {
  return hasBearerSecret(req, process.env.CRON_SECRET);
}

/** Internal automation auth: `Authorization: Bearer <CRON_SECRET>` or the
 *  legacy `x-cron-secret: <CRON_SECRET>` header (external n8n jobs). Fails
 *  CLOSED when CRON_SECRET is unset — the secret used to be hardcoded in
 *  source and shipped to the browser, so there is no fallback value. */
export function isInternalAutomationRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (hasBearerSecret(req, secret)) return true;
  const legacy = req.headers.get('x-cron-secret');
  return !!legacy && safeEqual(legacy.trim(), secret);
}

/** Session user if they are an admin, else null. */
export async function getAdminUser(req: NextRequest): Promise<SessionUser | null> {
  const user = await getSessionUser(req);
  return user && isAdminUser(user.email) ? user : null;
}

/** Ownership rule for a scan row: the owner may act on it; admins may act
 *  on any scan. Ownerless scans (user_id null — anonymous homepage scans)
 *  are NOT owned by whoever happens to be logged in. */
export function canAccessScan(
  scan: { user_id?: string | null } | null | undefined,
  user: { id: string; email?: string | null } | null | undefined,
): boolean {
  if (!scan || !user) return false;
  if (isAdminUser(user.email ?? null)) return true;
  return !!scan.user_id && scan.user_id === user.id;
}

/** Minimal structural view of the Supabase client used for the owner read. */
export interface ScanOwnerReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): PromiseLike<{ data?: unknown; error?: unknown }>;
      };
    };
  };
}

/** Load a scan's owner via the given (service-role) client and apply
 *  canAccessScan. Fails CLOSED on any DB error. */
export async function userOwnsScan(
  sb: ScanOwnerReader,
  scanId: string | null | undefined,
  user: { id: string; email?: string | null } | null | undefined,
): Promise<boolean> {
  if (!scanId || !user) return false;
  try {
    const { data, error } = await sb
      .from('rankall_scans')
      .select('user_id')
      .eq('id', scanId)
      .maybeSingle();
    if (error) return false;
    return canAccessScan(data as { user_id?: string | null } | null, user);
  } catch {
    return false;
  }
}

/** Back-office (outreach / ops) auth: internal automation (CRON_SECRET bearer
 *  or legacy x-cron-secret — fails closed when unset) OR an admin session.
 *  Returns a stable actor key for rate limiting, or null when neither. */
export async function getAdminOrInternalActor(req: NextRequest): Promise<string | null> {
  if (isInternalAutomationRequest(req)) return 'internal';
  const admin = await getAdminUser(req);
  return admin ? `admin:${admin.id}` : null;
}
