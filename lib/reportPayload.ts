// ── Report payload: server-side, viewer-filtered ─────────────────────────
// b0fm + ax8b: the report page used to load `rankall_scans.select('*')`
// (full trust_signals JSON) and `rankall_platform_results.select('*')`
// (full AI response text) in the browser with the anon key, and RLS let
// the anon key read every ownerless scan. Whatever the UI "locked" was
// readable from the network tab or straight from PostgREST.
//
// The report data is now loaded server-side (service role) by
// app/api/report/[id]/route.ts and filtered HERE, by viewer tier, before
// it leaves the server:
//   * anon   — logged-out viewer. Gets only what the free report renders:
//              score, per-platform mentioned / responded flags (NO response
//              text), the first ANON_VISIBLE_TRUST_SIGNALS trust signals +
//              the overall trust score + a locked-signal COUNT, the two
//              schema statuses the You-vs-Competitor table shows, the
//              competitor name, counts. Never the locked signal details.
//   * member — signed-in viewer (free plan). The report shows them every
//              trust signal and the full platform responses ("free with an
//              account"), so they get those.
//   * paid   — paid plan or admin. Same scan payload as member (locked
//              FIX content is gated separately by /api/fixes/for-scan).
// Access: an OWNED scan is readable only by its owner (anyone else gets
// the same 404 as a missing id). An ownerless scan (outreach / logged-out
// homepage scan) is readable by anyone holding its unguessable id, at the
// tier above — that is what outreach links and the free-scan funnel need.
//
// The pure functions below are unit-tested (lib/__tests__/report-payload).
import { getTrustedStoredGoogle, type EnrichmentData } from './enrichment';

export type ReportViewerTier = 'anon' | 'member' | 'paid';

export const ANON_VISIBLE_TRUST_SIGNALS = 3;

// Category order MUST match the report page's allSignals order — the
// "first 3 signals" a logged-out viewer sees are taken in this order.
const TRUST_CATEGORIES = ['technical', 'directory', 'reviews', 'community', 'aiPlatforms'] as const;

type TrustCategory = typeof TRUST_CATEGORIES[number];

export interface PayloadTrustSignal {
  name: string;
  status: string;
  value: string;
  impact?: string;
  fixAvailable?: boolean;
  consequence?: string;
  pointsImpact?: number;
  /** anon only: precomputed trustFixGainPoints over the FULL signal set. */
  gainPoints?: number;
}

export interface PayloadTrustSignals {
  technical: PayloadTrustSignal[];
  directory: PayloadTrustSignal[];
  reviews: PayloadTrustSignal[];
  community: PayloadTrustSignal[];
  aiPlatforms?: PayloadTrustSignal[];
  overall: number;
  /** anon only: how many signals were withheld (rendered as skeletons). */
  lockedCount?: number;
  /** anon only: the statuses the free You-vs-Competitor table reads. */
  summary?: { faqSchema: string | null; localBusinessSchema: string | null };
}

export interface PayloadPlatformResult {
  id: string;
  platform: string;
  weight: number;
  score: number;
  mentioned: boolean;
  mention_rate?: number;
  /** '' for anon viewers — the free report never shows response text. */
  response_text: string;
  error: string;
  /** Whether the platform answered (true even when response_text is withheld). */
  responded: boolean;
}

export interface ReportPayload {
  scan: Record<string, unknown>;
  results: PayloadPlatformResult[];
  resultsError: boolean;
  shareSlug: string | null;
  viewer: { tier: ReportViewerTier; isOwner: boolean };
}

// Scan columns the report page reads. Everything else on the row (user_id,
// scoring internals, basket hashes, …) stays on the server.
const REPORT_SCAN_FIELDS = [
  'id', 'input', 'user_business_name', 'intent_type', 'industry', 'location',
  'country_code', 'overall_score', 'competitor_name', 'mentioned_count',
  'citation_sources', 'trust_signals', 'enrichment', 'knowledge_panel_data',
  'created_at', 'partial', 'is_public',
] as const;

// Enrichment sources the report renders (GBP card, SERP + Reddit lines).
const REPORT_ENRICHMENT_KEYS = ['google', 'serpData', 'reddit'] as const;

/** Mirror of lib/trust.trustFixGainPoints (kept dependency-free here). */
function gainPointsFor(signal: { status: string }, all: Array<{ status: string }>): number {
  if (signal.status === 'not_checked') return 0;
  const measured = all.filter(s => s.status !== 'not_checked').length;
  if (measured <= 0) return 0;
  const credit = signal.status === 'good' ? 1 : signal.status === 'warning' ? 0.5 : 0;
  return Math.round(((1 - credit) / measured) * 100);
}

function asSignalArray(v: unknown): PayloadTrustSignal[] {
  return Array.isArray(v) ? (v as PayloadTrustSignal[]) : [];
}

/**
 * Logged-out view of trust_signals: the first N signals (in the report's
 * category order), the overall score, the locked count and the two schema
 * statuses the free comparison table shows. Locked signals' names, values
 * and consequences never leave the server.
 */
export function filterTrustSignalsForAnon(raw: unknown): PayloadTrustSignals | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const all = TRUST_CATEGORIES.flatMap(c => asSignalArray(src[c]));
  const out: PayloadTrustSignals = {
    technical: [], directory: [], reviews: [], community: [],
    overall: typeof src.overall === 'number' ? src.overall : 0,
  };
  if (Array.isArray(src.aiPlatforms)) out.aiPlatforms = [];
  let taken = 0;
  for (const cat of TRUST_CATEGORIES) {
    for (const s of asSignalArray(src[cat])) {
      if (taken >= ANON_VISIBLE_TRUST_SIGNALS) break;
      const bucket = (out[cat as TrustCategory] ?? (out[cat as TrustCategory] = [])) as PayloadTrustSignal[];
      bucket.push({ ...s, gainPoints: gainPointsFor(s, all) });
      taken++;
    }
  }
  out.lockedCount = Math.max(0, all.length - taken);
  const tech = asSignalArray(src.technical);
  out.summary = {
    faqSchema: tech.find(s => s.name === 'FAQ Schema')?.status ?? null,
    localBusinessSchema: tech.find(s => s.name === 'LocalBusiness JSON-LD')?.status ?? null,
  };
  return out;
}

function pickEnrichment(raw: unknown, input?: unknown, location?: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of REPORT_ENRICHMENT_KEYS) if (src[k] !== undefined) out[k] = src[k];
  // b87d: never send another business's stored Google data to the browser.
  // The page already hides it after re-validating; now the API drops it too.
  if (out.google !== undefined) {
    const trusted = getTrustedStoredGoogle(
      typeof input === 'string' ? input : null,
      typeof location === 'string' ? location : null,
      out.google as EnrichmentData['google'],
    );
    if (!trusted) delete out.google;
  }
  return out;
}

export function filterReportScan(row: Record<string, unknown>, tier: ReportViewerTier): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of REPORT_SCAN_FIELDS) if (row[f] !== undefined) out[f] = row[f];
  out.enrichment = pickEnrichment(row.enrichment, row.input, row.location);
  out.trust_signals = tier === 'anon'
    ? filterTrustSignalsForAnon(row.trust_signals)
    : (row.trust_signals ?? null);
  return out;
}

export function filterPlatformResults(
  rows: Array<Record<string, unknown>>,
  tier: ReportViewerTier,
): PayloadPlatformResult[] {
  return rows.map(r => {
    const text = typeof r.response_text === 'string' ? r.response_text : '';
    return {
      id: String(r.id ?? ''),
      platform: String(r.platform ?? ''),
      weight: typeof r.weight === 'number' ? r.weight : Number(r.weight) || 0,
      score: typeof r.score === 'number' ? r.score : Number(r.score) || 0,
      mentioned: !!r.mentioned,
      ...(typeof r.mention_rate === 'number' ? { mention_rate: r.mention_rate } : {}),
      response_text: tier === 'anon' ? '' : text,
      error: typeof r.error === 'string' ? r.error : '',
      responded: text.length > 0,
    };
  });
}

/** Owned scans: owner only. Ownerless scans: anyone with the id. */
export function canViewReport(ownerId: string | null | undefined, viewerId: string | null | undefined): boolean {
  if (!ownerId) return true;
  return !!viewerId && viewerId === ownerId;
}

/**
 * Public share surfaces (/r/[id], its OG image, /score/[slug]): ownerless
 * (outreach) scans — the same free data any id-holder sees on /report — or
 * owned scans the owner explicitly published (is_public = true). Missing
 * column (migration not applied) => undefined => owned scans stay private.
 */
export function canServePublicShare(ownerId: string | null | undefined, isPublic: unknown): boolean {
  if (!ownerId) return true;
  return isPublic === true;
}

/**
 * Embeddable badge: only for an OWNED scan the owner published, or the
 * owner previewing their own badge. Ownerless scans get the generic badge.
 */
export function canServeBadge(
  ownerId: string | null | undefined,
  isPublic: unknown,
  viewerId: string | null | undefined,
): boolean {
  if (!ownerId) return false;
  return isPublic === true || (!!viewerId && viewerId === ownerId);
}

export function tierFor(viewerId: string | null | undefined, isPaidOrAdmin: boolean): ReportViewerTier {
  if (!viewerId) return 'anon';
  return isPaidOrAdmin ? 'paid' : 'member';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isScanId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function buildReportPayload(args: {
  scanRow: Record<string, unknown>;
  resultRows: Array<Record<string, unknown>> | null;
  resultsError: boolean;
  shareSlug: string | null;
  viewerId: string | null;
  isPaidOrAdmin: boolean;
}): ReportPayload {
  const tier = tierFor(args.viewerId, args.isPaidOrAdmin);
  const ownerId = (args.scanRow.user_id as string | null | undefined) ?? null;
  return {
    scan: filterReportScan(args.scanRow, tier),
    results: filterPlatformResults(args.resultRows ?? [], tier),
    resultsError: args.resultsError,
    shareSlug: args.shareSlug,
    viewer: { tier, isOwner: !!ownerId && ownerId === args.viewerId },
  };
}
