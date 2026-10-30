// lib/scanCache.ts
// Scan result cache. Server-side only (service-role key). Keeps repeated queries
// from re-hitting every AI platform — the main cost driver.
//
// TTL: anonymous + free scans cache 24h; paid scans cache 1h (fresher data).
// Add ?fresh=true to the scan request to bypass the cache.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}

// P0a: the key is tenant-scoped. A logged-in user's cache entries live under
// `<query>_<COUNTRY>@<userId>`; anonymous scans keep the legacy bare key so
// existing 2-arg callers (and their QA assertions) stay byte-identical. A hit
// can therefore only ever serve the same tenant's own payload + scanId.
export function normalizeCacheKey(query: string, countryCode: string, tenantId = 'anon'): string {
  return (
    (query || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100) +
    '_' +
    (countryCode || 'US').toUpperCase() +
    (tenantId && tenantId !== 'anon' ? `@${tenantId}` : '')
  );
}

export interface CachedScan {
  hit: boolean;
  scanId?: string;
  results?: unknown;
  score?: number;
  cachedAt?: string;
}

export async function getCachedScan(query: string, countryCode: string, tenantId = 'anon'): Promise<CachedScan> {
  try {
    const cacheKey = normalizeCacheKey(query, countryCode, tenantId);
    const { data } = await admin()
      .from('scan_cache')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data) return { hit: false };
    return {
      hit: true,
      scanId: (data as Record<string, unknown>).scan_id as string,
      results: (data as Record<string, unknown>).results,
      score: (data as Record<string, unknown>).score as number,
      cachedAt: (data as Record<string, unknown>).created_at as string,
    };
  } catch {
    // Cache miss on any error — never block a scan because the cache is down.
    return { hit: false };
  }
}

export async function cacheScan(
  query: string,
  countryCode: string,
  scanId: string,
  results: unknown,
  score: number,
  ttlHours = 24,
  tenantId = 'anon',
): Promise<void> {
  try {
    const cacheKey = normalizeCacheKey(query, countryCode, tenantId);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);
    await admin().from('scan_cache').upsert(
      {
        cache_key: cacheKey,
        scan_id: scanId,
        results,
        score,
        country_code: countryCode,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'cache_key' },
    );
  } catch {
    /* non-fatal — caching is best-effort */
  }
}

export async function invalidateScanCache(query: string, countryCode: string, tenantId = 'anon'): Promise<void> {
  try {
    const cacheKey = normalizeCacheKey(query, countryCode, tenantId);
    await admin().from('scan_cache').delete().eq('cache_key', cacheKey);
  } catch {
    /* non-fatal */
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    await admin().from('scan_cache').delete().lt('expires_at', new Date().toISOString());
  } catch {
    /* non-fatal */
  }
}
