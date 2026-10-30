// lib/ssrf.ts — SSRF guard for fetches of user-supplied URLs.
//
// ax89: the trust engine fetched a business's website and the crawler
// check fetched ${origin}/robots.txt with no private-IP block and
// `redirect: 'follow'` — a scan input like http://169.254.169.254
// (cloud metadata) or http://127.0.0.1 was fetched server-side, and a
// public URL could redirect to one.
//
// This module is PURE (no Node imports) on purpose: lib/trust.ts is
// imported by client components (report page), so anything it imports
// must be client-bundle-safe. The DNS-resolution half of the guard
// lives in lib/ssrf-server.ts (server-only); server fetch paths use
// fetchPublicUrlWithDns from there. This module's fetchPublicUrl
// validates scheme + localhost + literal private IPs per hop — the
// direct-SSRF hole — without DNS.
//
// (DNS-check-then-fetch does not close DNS-rebinding TOCTOU; it closes
// the direct-SSRF hole, which is the attack this code faced.)

/** Own IP parser — no 'net' import (client-bundle-safe). Returns the
 *  version (4/6) or 0 when the host is not a literal IP. */
function ipVersion(host: string): 4 | 6 | 0 {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255)) return 4;
    return 0;
  }
  if (!host.includes(':')) return 0;
  if (host.includes(':::')) return 0;
  const lower = host.toLowerCase();
  // '::' alone is the unspecified address.
  if (lower === '::') return 6;
  const groups = lower.split(':');
  // IPv4-embedded tail (e.g. ::ffff:127.0.0.1) — checked separately.
  const last = groups[groups.length - 1];
  if (last.includes('.')) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(last)) return 0;
    const v4 = last.split('.').map(Number);
    if (!v4.every(p => p >= 0 && p <= 255)) return 0;
    // The non-tail groups must be hex (or empty from '::').
    const head = groups.slice(0, -1);
    if (head.every(g => g === '' || /^[0-9a-f]{1,4}$/.test(g))) return 6;
    return 0;
  }
  const parts = lower.split('::');
  if (parts.length > 2) return 0;
  const flat = lower.replace('::', ':').split(':').filter(Boolean);
  if (flat.length > 8) return 0;
  if (flat.every(g => /^[0-9a-f]{1,4}$/.test(g))) return 6;
  return 0;
}

/** Expand an IPv6 literal (compressed or not, optional dotted-v4 tail) to
 *  eight 16-bit groups. Null when it is not a valid IPv6 literal. */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const pct = s.indexOf('%'); // zone id (fe80::1%eth0)
  if (pct >= 0) s = s.slice(0, pct);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(last)) return null;
    const p = last.split('.').map(Number);
    if (!p.every(n => n >= 0 && n <= 255)) return null;
    tail = [(p[0] << 8) | p[1], (p[2] << 8) | p[3]];
    // Drop the dotted tail, keeping a '::' that directly precedes it.
    let prefix = s.slice(0, lastColon);
    if (prefix.endsWith(':')) prefix = s.slice(0, lastColon + 1);
    s = prefix;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const grp of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(grp)) return null;
      out.push(parseInt(grp, 16));
    }
    return out;
  };
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !rest) return null;
  const explicit = head.length + rest.length + tail.length;
  if (halves.length === 1) {
    if (explicit !== 8) return null;
    return [...head, ...tail];
  }
  if (explicit > 7) return null;
  return [...head, ...new Array(8 - explicit).fill(0), ...rest, ...tail];
}

export function isPrivateIp(ip: string): boolean {
  const v = ipVersion(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 10) return true; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 127) return true; // 127/8 loopback
    if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
    if (a === 0) return true; // 0/8 "this network"
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0/24, 192.0.2/24 (TEST-NET-1)
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100/24 (TEST-NET-2)
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113/24 (TEST-NET-3)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
    if (a >= 224) return true; // 224/4 multicast + 240/4 reserved
    return false;
  }
  if (v === 6) {
    const g = expandIPv6(ip);
    if (!g) return true; // unparseable as v6 but looked like one → block
    const v4At = (hi: number, lo: number) =>
      `${(hi >>> 8) & 255}.${hi & 255}.${(lo >>> 8) & 255}.${lo & 255}`;
    const zero = (from: number, to: number) => g.slice(from, to).every(x => x === 0);
    if (zero(0, 8)) return true; // :: unspecified
    if (zero(0, 7) && g[7] === 1) return true; // ::1 loopback
    // ::a.b.c.d — deprecated IPv4-compatible (e.g. [::127.0.0.1] which the
    // URL parser normalises to [::7f00:1]). Check the embedded v4.
    if (zero(0, 6)) return isPrivateIp(v4At(g[6], g[7]));
    // ::ffff:a.b.c.d — IPv4-mapped.
    if (zero(0, 5) && g[5] === 0xffff) return isPrivateIp(v4At(g[6], g[7]));
    // ::ffff:0:a.b.c.d — IPv4-translated (SIIT).
    if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return isPrivateIp(v4At(g[6], g[7]));
    // 64:ff9b::/96 — NAT64 well-known prefix embeds a v4 in the low 32 bits.
    if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isPrivateIp(v4At(g[6], g[7]));
    // 64:ff9b:1::/48 — local-use NAT64 (RFC 8215): never a public target.
    if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
    // 2002::/16 — 6to4 embeds a v4 in bits 16..47.
    if (g[0] === 0x2002) return isPrivateIp(v4At(g[1], g[2]));
    // 2001:0::/32 — Teredo (tunnels to an obfuscated v4); never a web origin.
    if (g[0] === 0x2001 && g[1] === 0) return true;
    // 2001:db8::/32 — documentation.
    if (g[0] === 0x2001 && g[1] === 0xdb8) return true;
    // 100::/64 — discard-only.
    if (g[0] === 0x100 && zero(1, 4)) return true;
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  return false;
}

/** Validate a URL for a server-side fetch: http(s) only, no localhost,
 *  no literal private IP. (DNS answers are checked by
 *  assertPublicUrlWithDns in lib/ssrf-server.ts — this module stays
 *  client-bundle-safe, so it cannot import dns.) */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('[ssrf] Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('[ssrf] Only http(s) URLs may be fetched');
  }
  // URL.hostname keeps IPv6 brackets ('[::1]') — strip them.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('[ssrf] localhost is not fetchable');
  }
  if (ipVersion(host) !== 0 && isPrivateIp(host)) {
    throw new Error('[ssrf] Private IP is not fetchable');
  }
  // Only the default web ports: an arbitrary port turns the fetcher into an
  // internal port scanner (e.g. a public host's :6379/:22) even for public IPs.
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new Error('[ssrf] Only ports 80/443 may be fetched');
  }
  if (url.username || url.password) {
    throw new Error('[ssrf] Credentials in URL are not allowed');
  }
  return url;
}

/** fetch() for user-controlled URLs: validates the target and every
 *  redirect hop with assertPublicUrl (redirects are followed manually
 *  so a public URL cannot bounce the fetch to a private address).
 *  Server paths should use fetchPublicUrlWithDns (DNS-checked). */
export async function fetchPublicUrl(
  rawUrl: string,
  init?: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
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
