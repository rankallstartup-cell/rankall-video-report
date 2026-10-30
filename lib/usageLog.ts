// lib/usageLog.ts
// Phase 2: lightweight structured logging for expensive requests. Server-only.
// Logs to stdout (picked up by Vercel logs) and best-effort persists to an
// optional usage_events table for later analytics. Never throws — logging must
// not affect the request it describes.

import { createClient } from '@supabase/supabase-js';

export interface ExpensiveRequestLog {
  userId?: string | null;
  plan?: string | null;
  feature: string;
  success: boolean;
  cacheHit?: boolean;
  durationMs?: number;
  platformCount?: number;
  error?: string | null;
}

export function logExpensiveRequest(entry: ExpensiveRequestLog): void {
  const record = {
    ts: new Date().toISOString(),
    user_id: entry.userId ?? null,
    plan: entry.plan ?? null,
    feature: entry.feature,
    success: entry.success,
    cache_hit: !!entry.cacheHit,
    duration_ms: entry.durationMs ?? null,
    platform_count: entry.platformCount ?? null,
    error: entry.error ?? null,
  };

  // Structured stdout line — cheap, always available.
  try { console.log('EXPENSIVE_REQUEST', JSON.stringify(record)); } catch { /* noop */ }

  // Best-effort persistence (fire-and-forget). Table may not exist yet.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    void sb.from('usage_events').insert(record).then(
      () => {},
      () => {},
    );
  } catch { /* analytics is non-critical */ }
}
