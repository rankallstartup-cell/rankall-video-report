/**
 * Phase 1 auto-labeling (ticket b7x5, labeling program umbrella b7x4).
 *
 * When a scan completes, this fills in the labeling layer for that scan:
 *   (a) one data_labels row with ALL fields, derived from the saved scan row;
 *   (b) a sentiment label on every platform answer that has response text;
 *   (c) a trust_signals backstop — if the saved scan row somehow lacks
 *       trust signals, the caller-passed computed value is stored.
 *
 * Guarantees:
 * - NEVER overwrites: an existing data_labels row is left alone, and a
 *   platform row whose sentiment is already set is never re-labeled.
 * - NEVER blocks the scan: every step is fail-open (log + continue), and
 *   the whole function never throws. Callers run it in next/server
 *   `after()` so it executes post-response.
 * - NEVER invents: no response text → sentiment stays NULL (unknown).
 *   No platform rows at all → platforms_mentioned [] + 'low' confidence.
 * - No new tables, no migration, no vendor API calls. Sentiment uses the
 *   existing deterministic keyword heuristic (lib/analyser-ml
 *   detectSentiment), the same function behind the analysis the report
 *   already shows. No Intelligence Graph quality gate here — labeling
 *   covers EVERY completed scan (dirty scans get honest labels too).
 */
import { detectSentiment } from '@/lib/analyser-ml';
import { getSupabaseAdmin } from '@/lib/supabase';

// ── Classifiers (moved verbatim from the old /api/label-scan route) ──

const LOCAL_SERVICE_INDUSTRIES = [
  'plumber', 'electrician', 'hvac', 'roofing', 'landscaping', 'cleaning', 'pest control',
  'painting', 'flooring', 'remodeling', 'moving', 'auto repair', 'mechanic',
];
const MEDICAL_INDUSTRIES = ['dentist', 'doctor', 'chiropractor', 'optometrist', 'physical therapy', 'veterinarian'];
const LEGAL_INDUSTRIES = ['attorney', 'lawyer', 'accountant', 'financial advisor'];
const RESTAURANT_INDUSTRIES = ['restaurant', 'cafe', 'coffee', 'pizza', 'sushi', 'bar', 'bakery', 'food'];

export function classifyBusinessType(industry: string): string {
  const i = (industry || '').toLowerCase();
  if (MEDICAL_INDUSTRIES.some((k) => i.includes(k))) return 'medical';
  if (LEGAL_INDUSTRIES.some((k) => i.includes(k))) return 'legal';
  if (RESTAURANT_INDUSTRIES.some((k) => i.includes(k))) return 'restaurant';
  if (LOCAL_SERVICE_INDUSTRIES.some((k) => i.includes(k))) return 'local_service';
  if (i.includes('shop') || i.includes('store') || i.includes('retail')) return 'retail';
  if (i.includes('software') || i.includes('saas') || i.includes('app')) return 'saas';
  return 'other';
}

export function classifyQueryType(input: string): string {
  const i = (input || '').toLowerCase();
  if (/\b(best|top|near me|in [a-z]+|where|who)\b/.test(i)) return 'local';
  if (/\b(how|what|why|explain|guide|tips)\b/.test(i)) return 'informational';
  if (/\b(buy|price|cost|hire|book|schedule|get)\b/.test(i)) return 'transactional';
  return 'navigational';
}

export function extractCityState(location: string): { city: string; state: string } {
  // Handle "City, State" or "City State" patterns
  const parts = (location || '').split(/,\s*|\s{2,}/);
  if (parts.length >= 2) {
    return { city: parts[0].trim(), state: parts[1].trim() };
  }
  // Try to detect US state abbreviations at end
  const stateMatch = (location || '').match(/\b([A-Z]{2})$/);
  if (stateMatch) {
    return { city: (location || '').replace(stateMatch[0], '').trim(), state: stateMatch[1] };
  }
  return { city: (location || '').trim(), state: '' };
}

export function confidenceFor(mentionedCount: number, totalPlatforms: number): 'high' | 'medium' | 'low' {
  const ratio = totalPlatforms > 0 ? mentionedCount / totalPlatforms : 0;
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.25) return 'medium';
  return 'low';
}

// ── Minimal structural DB shape (the real Supabase client satisfies this at
// runtime; tests inject a fake). Kept narrow on purpose so tests don't need
// the full supabase-js builder types. ──

type QueryResult<T> = { data: T | null; error: unknown };
interface QueryBuilder<T = any> {
  eq(column: string, value: unknown): QueryBuilder<T>;
  is(column: string, value: null): QueryBuilder<T>;
  maybeSingle(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export interface AutoLabelDb {
  from(table: string): {
    select(columns: string): QueryBuilder;
    insert(row: Record<string, unknown>): Promise<QueryResult<unknown>>;
    update(row: Record<string, unknown>): QueryBuilder;
  };
}

export interface AutoLabelInput {
  scanId: string;
  /** Per-platform sentiment already computed by the caller (the analyser's
   *  analysis). When absent for a platform, sentiment is recomputed from
   *  the stored response text with the same deterministic heuristic. */
  platformSentiments?: Array<{
    platform: string;
    sentiment: 'positive' | 'neutral' | 'negative' | null;
  }>;
  /** Computed trust signals from the scan path. Used ONLY as a backstop:
   *  stored only when the saved scan row has trust_signals NULL. */
  trustSignals?: { overall?: unknown } | null;
  /** Injected for tests. Defaults to the service-role admin client. */
  admin?: unknown;
}

export interface AutoLabelResult {
  labeled: boolean;
  sentimentsUpdated: number;
  trustBackfilled: boolean;
  /** Set when the data_labels insert threw (fail-open: the scan still
   *  succeeded). Lets callers (e.g. the backfill) tell a genuine insert
   *  failure apart from "label already existed". */
  labelError?: string;
}

export async function autoLabelScan(args: AutoLabelInput): Promise<AutoLabelResult> {
  const empty: AutoLabelResult = { labeled: false, sentimentsUpdated: 0, trustBackfilled: false };
  const { scanId } = args;
  if (!scanId || typeof scanId !== 'string') return empty;

  // The whole function is fail-open: labeling must never break the scan.
  try {
    const db = (args.admin ?? getSupabaseAdmin()) as unknown as AutoLabelDb;

    // 1. Read the saved scan row — the single source of truth for the label.
    let scan: Record<string, any> | null = null;
    try {
      const { data, error } = await db
        .from('rankall_scans')
        .select('id, input, industry, intent_type, location, country_code, overall_score, trust_score, mentioned_count, competitor_name, user_business_name, trust_signals')
        .eq('id', scanId)
        .maybeSingle();
      if (error) throw error;
      scan = data;
    } catch (err) {
      console.error('[autoLabel] could not read scan row, skipping labeling:', scanId, err);
      return empty;
    }
    if (!scan) {
      console.error('[autoLabel] no scan row found, skipping labeling:', scanId);
      return empty;
    }

    // 2. Read this scan's platform rows (for platforms_mentioned + sentiment).
    let platformRows: Array<Record<string, any>> = [];
    try {
      const { data, error } = await db
        .from('rankall_platform_results')
        .select('id, platform, response_text, sentiment, mentioned')
        .eq('scan_id', scanId);
      if (error) throw error;
      platformRows = Array.isArray(data) ? data : [];
    } catch (err) {
      // Sentiment + platforms_mentioned are best-effort; the label row below
      // is still written with honest empty values.
      console.error('[autoLabel] could not read platform rows, continuing with empty set:', scanId, err);
      platformRows = [];
    }

    // 3. (a) data_labels — idempotent: never create a second row, never
    // overwrite an existing one.
    let labeled = false;
    let labelError: string | undefined;
    try {
      const { data: existing, error: existingError } = await db
        .from('data_labels')
        .select('id')
        .eq('scan_id', scanId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        const location = typeof scan.location === 'string' ? scan.location : '';
        const industry = typeof scan.industry === 'string' ? scan.industry : '';
        const input = typeof scan.input === 'string' ? scan.input : '';
        const { city, state } = extractCityState(location);
        const totalPlatforms = platformRows.length > 0 ? platformRows.length : 11;
        const { error: insertError } = await db.from('data_labels').insert({
          scan_id: scanId,
          business_name: (typeof scan.user_business_name === 'string' && scan.user_business_name) || input,
          industry,
          intent_type: typeof scan.intent_type === 'string' ? scan.intent_type : '',
          location,
          city,
          state,
          country: typeof scan.country_code === 'string' ? scan.country_code : '',
          query_type: classifyQueryType(input),
          business_type: classifyBusinessType(industry),
          competitor_category: scan.competitor_name ? 'direct' : 'none',
          ai_recommendation_confidence: confidenceFor(
            typeof scan.mentioned_count === 'number' ? scan.mentioned_count : 0,
            totalPlatforms,
          ),
          platforms_mentioned: platformRows.filter((r) => r.mentioned === true).map((r) => r.platform),
          trust_score: typeof scan.trust_score === 'number' ? scan.trust_score : 0,
          overall_score: typeof scan.overall_score === 'number' ? scan.overall_score : 0,
          labeled_by: 'system',
          labeled_at: new Date().toISOString(),
        });
        if (insertError) throw insertError;
        labeled = true;
      }
    } catch (err) {
      labelError = err instanceof Error ? err.message : String(err);
      console.error('[autoLabel] data_labels insert failed (non-fatal):', scanId, err);
    }

    // 4. (b) Sentiment — fill blanks only. A row with sentiment already set
    // is never touched; a row with no response text has no answer to label,
    // so its sentiment stays NULL (honest unknown, never invented).
    let sentimentsUpdated = 0;
    const passed = new Map(
      (args.platformSentiments ?? []).map((p) => [p.platform, p.sentiment]),
    );
    for (const row of platformRows) {
      try {
        if (row.sentiment != null) continue;
        if (!row.response_text || typeof row.response_text !== 'string') continue;
        const sentiment = passed.has(row.platform)
          ? passed.get(row.platform)
          : detectSentiment(row.response_text, typeof scan.input === 'string' ? scan.input : '');
        if (sentiment == null) continue;
        const { error: updateError } = await db
          .from('rankall_platform_results')
          .update({ sentiment })
          .eq('id', row.id)
          .is('sentiment', null);
        if (updateError) throw updateError;
        sentimentsUpdated += 1;
      } catch (err) {
        console.error('[autoLabel] sentiment update failed for platform row (non-fatal):', row?.id, err);
      }
    }

    // 5. (c) Trust backstop — only when the saved row lacks trust_signals
    // AND the caller passed the computed value. Never invents signals.
    let trustBackfilled = false;
    try {
      const trustSignals = args.trustSignals as { overall?: unknown } | null | undefined;
      if (scan.trust_signals == null && trustSignals != null && typeof trustSignals === 'object') {
        const { error: trustError } = await db
          .from('rankall_scans')
          .update({
            trust_signals: trustSignals,
            trust_score: typeof trustSignals.overall === 'number' ? trustSignals.overall : null,
          })
          .eq('id', scanId);
        if (trustError) throw trustError;
        trustBackfilled = true;
      }
    } catch (err) {
      console.error('[autoLabel] trust backstop failed (non-fatal):', scanId, err);
    }

    return { labeled, sentimentsUpdated, trustBackfilled, ...(labelError ? { labelError } : {}) };
  } catch (err) {
    console.error('[autoLabel] unexpected failure (non-fatal):', scanId, err);
    return empty;
  }
}
