// lib/authNext.ts — the ?next= helpers the login and signup pages use.
// Both delegate to lib/safeRedirect.safeNextPath (resolve + same-origin +
// control-char/backslash + dot-segment checks). The old lib/safeNext.ts
// let `/.//evil.com`, `/a/..//evil.com` and `/%2e//evil.com` resolve to a
// `//evil.com` path, and /login used ?next= with no validation at all.
import { safeNextPath } from './safeRedirect';

/** Post-login destination: a safe same-origin path, else /dashboard. */
export function loginNextFromSearch(search: string, origin: string): string {
  return safeNextPath(new URLSearchParams(search).get('next'), origin, '/dashboard');
}

/** Signup's optional ?next=: a safe same-origin path, else null. */
export function signupNextFromSearch(search: string, origin: string): string | null {
  return safeNextPath(new URLSearchParams(search).get('next'), origin, '') || null;
}
