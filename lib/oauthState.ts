// lib/oauthState.ts — CSRF protection for the Google integration OAuth
// flows (GSC / GA4 / GBP). The connect step issues a random nonce, sends it
// as `state` and stores it in a short-lived httpOnly cookie; the callback
// only accepts a `state` that matches the cookie. The previous static
// states ('ga4', 'gbp') — and GSC's state=user.id, which the callback then
// TRUSTED as the user id — let an attacker complete the flow into someone
// else's account or plant their own Google tokens on a victim.
import { randomBytes } from 'crypto';
import type { NextResponse } from 'next/server';
import { safeEqual } from './apiAuth';

export type OAuthKind = 'gsc' | 'ga4' | 'gbp';

const cookieName = (kind: OAuthKind) => `rk_oauth_${kind}`;

export function issueOAuthState(kind: OAuthKind): { state: string; nonce: string } {
  const nonce = randomBytes(24).toString('hex');
  return { state: `${kind}.${nonce}`, nonce };
}

export function setOAuthStateCookie(res: NextResponse, kind: OAuthKind, nonce: string): NextResponse {
  res.cookies.set(cookieName(kind), nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax: the callback is a top-level GET navigation from Google.
    sameSite: 'lax',
    path: '/api/integrations',
    maxAge: 600,
  });
  return res;
}

export function clearOAuthStateCookie(res: NextResponse, kind: OAuthKind): NextResponse {
  res.cookies.set(cookieName(kind), '', { path: '/api/integrations', maxAge: 0 });
  return res;
}

/** Pure check: state must be `${kind}.${nonce}` with nonce === cookie. */
export function checkOAuthState(kind: OAuthKind, stateParam: string | null, cookieNonce: string | null | undefined): boolean {
  if (!stateParam || !cookieNonce) return false;
  const prefix = `${kind}.`;
  if (!stateParam.startsWith(prefix)) return false;
  return safeEqual(stateParam.slice(prefix.length), cookieNonce);
}

export function readOAuthStateCookie(req: { cookies: { get: (n: string) => { value: string } | undefined } }, kind: OAuthKind): string | null {
  return req.cookies.get(cookieName(kind))?.value ?? null;
}
