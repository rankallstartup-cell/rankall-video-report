// lib/funnel.ts
// CONV-00: server-side funnel instrumentation. One row per funnel stage
// transition in the funnel_events table.
//
// Design: fire-and-forget, NEVER throws — tracking must not affect the
// request it describes. Source attribution comes from the rk_src cookie
// (set client-side from UTM params on first landing) or an explicit
// override passed by the caller.
//
// Stages: scan_started -> scan_completed -> report_viewed ->
//         report_shared -> profile_claimed -> trial_started -> paid

import { createClient } from '@supabase/supabase-js';

export type FunnelEventName =
  | 'scan_started'
  | 'scan_completed'
  | 'report_viewed'
  | 'report_shared'
  | 'profile_claimed'
  | 'trial_started'
  | 'paid';

export type FunnelSource = 'cold' | 'influencer' | 'agency' | 'outbound' | 'unknown';

export interface FunnelEvent {
  event: FunnelEventName;
  userId?: string | null;
  email?: string | null;
  scanId?: string | null;
  /** Explicit source override. When omitted, resolved from the rk_src cookie. */
  source?: FunnelSource;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Map a raw UTM source / referrer to a funnel segment.
 * - influencer: utm_source contains 'influencer' or a referral code (?ref=) is present
 * - agency: utm_source contains 'agency' or the path came from an agency portal
 * - outbound: utm_source is 'outbound'/'instantly'/'cold-email' etc.
 * - cold: direct / organic / everything else
 */
export function resolveFunnelSource(opts: {
  utmSource?: string | null;
  referrer?: string | null;
  hasRefCode?: boolean;
}): FunnelSource {
  const s = (opts.utmSource || '').toLowerCase();
  if (opts.hasRefCode || s.includes('influencer') || s.includes('affiliate')) return 'influencer';
  if (s.includes('agency')) return 'agency';
  if (s.includes('outbound') || s.includes('instantly') || s.includes('cold')) return 'outbound';
  if (!s && !opts.referrer) return 'cold';
  return 'cold';
}

/** Read the rk_src cookie value (JSON) from a NextRequest. */
export function readSourceCookie(req: { cookies: { get(name: string): { value: string } | undefined } }): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  hasRefCode: boolean;
} {
  try {
    const raw = req.cookies.get('rk_src')?.value;
    if (!raw) return { utmSource: null, utmMedium: null, utmCampaign: null, hasRefCode: false };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      utmSource: typeof p.us === 'string' ? p.us : null,
      utmMedium: typeof p.um === 'string' ? p.um : null,
      utmCampaign: typeof p.uc === 'string' ? p.uc : null,
      hasRefCode: p.ref === true,
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null, hasRefCode: false };
  }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export function trackFunnelEvent(e: FunnelEvent): void {
  // Fire-and-forget: do not await, do not throw.
  void (async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      const source: FunnelSource =
        e.source ??
        resolveFunnelSource({
          utmSource: e.utmSource,
          referrer: e.referrer,
          hasRefCode: false,
        });
      await admin()
        .from('funnel_events')
        .insert({
          event_name: e.event,
          user_id: e.userId ?? null,
          email: e.email ?? null,
          scan_id: e.scanId ?? null,
          source,
          utm_source: e.utmSource ?? null,
          utm_medium: e.utmMedium ?? null,
          utm_campaign: e.utmCampaign ?? null,
          referrer: e.referrer ?? null,
          metadata: e.metadata ?? {},
        });
    } catch {
      /* tracking must never break the request */
    }
  })();
}
