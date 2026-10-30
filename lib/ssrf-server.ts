// lib/ssrf-server.ts — server-only SSRF guard (DNS-checked).
//
// SERVER-ONLY: imports 'dns/promises', which cannot resolve in a
// client bundle. Never import this from a client component or from a
// module client components import (lib/trust.ts). Server fetch paths
// (lib/trustServer.ts, lib/crawlerCheck.ts) use fetchPublicUrlWithDns;
// the pure (no-DNS) guard lives in lib/ssrf.ts.
//
// DNS-rebinding TOCTOU (documented, not closed): we resolve and check the
// name, then fetch() resolves it again. A hostile resolver with TTL 0 can
// answer public-then-private. Closing it needs connection-level IP pinning
// (an undici Agent with a custom connect.lookup that returns the vetted
// address, keeping the hostname for SNI/Host). undici is not a direct
// dependency here and Node's global fetch exposes no lookup hook, so we do
// not pin. Mitigations in place: every hop is re-checked, only ports 80/443,
// redirects are manual, and the callers only read the response body as
// text for analysis (no response is proxied back verbatim to the caller).
import { lookup } from 'dns/promises';
import { isPrivateIp, assertPublicUrl } from './ssrf';

/** assertPublicUrl + a DNS check: EVERY resolved address must be
 *  public (a hostname may resolve to both public and private
 *  addresses; ANY private answer blocks the fetch). */
export async function assertPublicUrlWithDns(rawUrl: string): Promise<URL> {
  const url = await assertPublicUrl(rawUrl);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // Literal IPs were already checked by assertPublicUrl.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return url;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error('[ssrf] DNS resolution failed');
  }
  if (addrs.length === 0) throw new Error('[ssrf] DNS resolution failed');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error('[ssrf] Hostname resolves to a private IP');
  }
  return url;
}

/** fetchPublicUrl + DNS validation of the target and every redirect
 *  hop. This is the guard server-side fetches of user-controlled URLs
 *  must use. */
export async function fetchPublicUrlWithDns(
  rawUrl: string,
  init?: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrlWithDns(current);
    const res = await fetch(url.toString(), { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('[ssrf] Too many redirects');
}
