import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Server-safe client — lazy singleton so module evaluation doesn't throw at build time
let _serverClient: SupabaseClient | null = null;
function getServerClient(): SupabaseClient {
  if (!_serverClient) {
    _serverClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _serverClient;
}
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getServerClient() as any)[prop];
  },
});

// Service-role client for SERVER-SIDE code only — bypasses RLS. Never import
// this into a client component. Used for cron jobs and API routes that act
// without a user session (or need guaranteed writes regardless of RLS).
let _adminClient: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _adminClient;
}

// Browser client — singleton for client components; uses cookie-based session
let _browserClient: SupabaseClient | null = null;
export function getBrowserClient(): SupabaseClient {
  if (!_browserClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      // Return a no-op proxy during SSR/build when env vars are absent
      return new Proxy({} as SupabaseClient, { get: () => () => ({ data: null, error: null }) });
    }
    _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserClient;
}

export interface SaveScanInput {
  input: string;
  intentType: string;
  industry: string;
  location: string;
  overallScore: number;
  results: Array<{ platform: string; weight: number; response: string | null; error: string | null; status: string; mentionRate?: number; queriesUsed?: string[]; sentiment?: 'positive' | 'neutral' | 'negative' | null }>;
  userId?: string;
  trustSignals?: object;
  competitorName?: string | null;
  mentionedCount?: number;
  citationSources?: string[];
  enrichment?: object;
  countryCode?: string;
  kpExists?: boolean;
  kpClaimed?: boolean;
  kpCompleteness?: number;
  kpData?: object | null;
  businessId?: string | null;
  businessName?: string | null;
  city?: string | null;
  competitorScore?: number | null;
  scoringVersion?: number;
  queriesUsed?: string[] | null;
  basketHash?: string | null;
  resolvedCategory?: string | null;
  categoryConfidence?: string | null;
  recommendationShare?: number | null;
  failedPlatforms?: string[] | null;
  scanReliable?: boolean;
}

export async function saveScan(p: SaveScanInput): Promise<string | null> {
  const admin = getSupabaseAdmin();
  try {
    // 1. Insert scan row
    const { data: scan, error: scanError } = await admin
      .from('rankall_scans')
      .insert({
        user_id:        p.userId || null,
        input:          p.input,
        intent_type:    p.intentType,
        industry:       p.industry,
        location:       p.location,
        overall_score:  p.overallScore,
        trust_signals:  p.trustSignals || null,
        enrichment:     p.enrichment || null,
        competitor_name: p.competitorName || null,
        // ax9c: trust_score is a real column but was never written — the scan
        // only stored the trust_signals JSON. trust_score now mirrors
        // trust_signals.overall so readers don't need the JSON fallback.
        trust_score: typeof (p.trustSignals as { overall?: unknown } | undefined)?.overall === 'number'
          ? (p.trustSignals as { overall: number }).overall
          : null,
        mentioned_count: p.mentionedCount || 0,
        citation_sources: p.citationSources || [],
        country_code:   p.countryCode || null,
        knowledge_panel_exists: p.kpExists ?? false,
        knowledge_panel_claimed: p.kpClaimed ?? false,
        knowledge_panel_completeness: p.kpCompleteness ?? 0,
        knowledge_panel_data: p.kpData ?? null,
        business_id:        p.businessId || null,
        user_business_name: p.businessName || null,
        business_city:      p.city || null,
        competitor_score:   p.competitorScore ?? null,
        scoring_version:    p.scoringVersion ?? 2,
        queries_used:       p.queriesUsed || null,
        basket_hash:        p.basketHash || null,
        resolved_category:  p.resolvedCategory || null,
        category_confidence: p.categoryConfidence || null,
        recommendation_share: p.recommendationShare ?? null,
        failed_platforms: p.failedPlatforms?.length ? p.failedPlatforms : null,
        scan_reliable: p.scanReliable ?? true,
        created_at:     new Date().toISOString(),
      })
      .select()
      .single();

    if (scanError || !scan) {
      console.error('Scan insert error FULL:', JSON.stringify(scanError));
      return null;
    }

    const scanId = scan.id;

    // 2. Insert platform results
    // ax9c: per-platform score + query_used were never written (both NULL
    // for every row). score = the platform's mention rate on a 0-100 scale,
    // the same basis the headline score uses. query_used records which
    // basket queries produced this row. query_index stays NULL on purpose:
    // one row aggregates several queries, so no single index is meaningful
    // — per-query granularity would need one row per (platform, query).
    const platformRows = p.results.map(r => ({
      scan_id:       scanId,
      platform:      r.platform,
      weight:        r.weight,
      score:         Math.round((r.mentionRate ?? 0) * 100),
      query_used:    (r.queriesUsed ?? p.queriesUsed ?? []).join(' | ') || null,
      response_text: r.response || null,
      error:         r.error || null,
      mentioned:     (r.mentionRate ?? 0) > 0,
      mention_rate:  r.mentionRate ?? null,
      // STD-08 Phase 1: persist the analyser's sentiment — was computed but
      // never written, leaving 38% of mentioned rows NULL.
      sentiment:     r.sentiment ?? null,
      created_at:    new Date().toISOString(),
    }));

    const { error: platformError } = await admin
      .from('rankall_platform_results')
      .insert(platformRows);

    if (platformError) {
      console.error('Platform results insert error:', platformError);
    }

    // 3. Generate report slug and save
    const slug = `${scanId.slice(0, 8)}-${Date.now()}`;
    const { error: slugError } = await admin
      .from('rankall_report_links')
      .insert({
        scan_id:    scanId,
        slug,
        expires_at: null,
      });

    if (slugError) {
      console.error('Report link insert error:', slugError);
    }

    return scanId;
  } catch (err) {
    console.error('saveScan CATCH error:', JSON.stringify(err));
    return null;
  }
}
