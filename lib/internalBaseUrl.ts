// lib/internalBaseUrl.ts
// Base URL for server-to-server calls that carry CRON_SECRET.
//
// NEVER derive it from the incoming request (req.url / Host /
// X-Forwarded-Host): a caller who controls the Host header would receive the
// CRON_SECRET bearer on their own server. Configured env first
// (NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_BASE_URL — the same vars the other
// internal callers use), else the production origin. Only an absolute
// http(s) origin is accepted; anything else falls back to production.

const PRODUCTION_ORIGIN = 'https://rankall.io';

export function internalBaseUrl(env: Record<string, string | undefined> = process.env): string {
  for (const candidate of [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_BASE_URL]) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate.trim());
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
    } catch { /* malformed — try the next one */ }
  }
  return PRODUCTION_ORIGIN;
}
