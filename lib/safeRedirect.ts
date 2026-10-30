// lib/safeRedirect.ts — validate a user-supplied post-auth `next` path.
//
// String checks alone are not enough: browsers strip TAB/LF/CR from URLs,
// so `/\t/evil.com` becomes `//evil.com` (protocol-relative, off-site);
// `\` is normalised to `/`; and dot-segments like `/.//evil.com` resolve to
// a `//evil.com` path, which new URL(next, origin) then reads as a HOST.
// So: reject control chars/backslashes (raw and percent-decoded), require a
// single leading '/', RESOLVE against our origin, require the same origin,
// and require the resolved path to not start with '//'.
const BAD_CHARS = /[\u0000-\u001F\u007F\\]/;

export function safeNextPath(raw: string | null | undefined, origin: string, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (BAD_CHARS.test(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (BAD_CHARS.test(decoded)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback;
  let base: URL;
  let u: URL;
  try {
    base = new URL(origin);
    u = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (u.origin !== base.origin) return fallback;
  if (u.pathname.startsWith('//')) return fallback;
  return `${u.pathname}${u.search}${u.hash}`;
}

/** App pages a password-recovery session may not open until it has set a
 *  new password (proxy.ts gate; see app/reset-password/state). */
export function isRecoveryGatedPath(pathname: string): boolean {
  return ['/dashboard', '/settings', '/onboarding', '/admin', '/agency', '/billing']
    .some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** App pages that need a signed-in user. proxy.ts sends a logged-out
 *  visitor to /login?next=<path> instead of rendering an empty app shell
 *  (b89a-b89g, b8ae, b8af). Public marketing pages such as /agency stay open. */
export function isAuthRequiredPath(pathname: string): boolean {
  return ['/dashboard', '/settings', '/admin', '/agency/dashboard']
    .some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The /login URL that brings the visitor back to `pathname + search`
 *  after signing in (login and auth/callback validate it with safeNextPath). */
export function loginRedirectPath(pathname: string, search = ''): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** Hosts an email click-tracking redirect may send a recipient to. Every
 *  outreach link points at rankall.io (report, video page, homepage). */
export const TRACK_REDIRECT_HOSTS = ['rankall.io', 'www.rankall.io'];
export const TRACK_REDIRECT_FALLBACK = 'https://rankall.io/';

/** Validate the `redirect` target of /api/outreach/track. Absolute https
 *  URLs on an allow-listed host only (no credentials, no other ports);
 *  anything else — another host, javascript:, protocol-relative, control
 *  chars — returns the fallback. Prevents the tracker from being an open
 *  redirect on our domain (phishing that "starts at rankall.io"). */
export function safeTrackRedirect(
  raw: string | null | undefined,
  allowedHosts: string[] = TRACK_REDIRECT_HOSTS,
  fallback: string = TRACK_REDIRECT_FALLBACK,
): string {
  if (!raw) return fallback;
  if (BAD_CHARS.test(raw)) return fallback;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fallback;
  }
  if (u.protocol !== 'https:') return fallback;
  if (u.username || u.password) return fallback;
  if (u.port && u.port !== '443') return fallback;
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) return fallback;
  return u.toString();
}
