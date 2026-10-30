/**
 * Labeling Phase 2a — gold-set tooling (ticket b7x6 follow-up, labeling
 * program umbrella b7x4).
 *
 * Phase 1 (PR #58/#59) labels EVERY scan automatically. Phase 2 checks
 * those system labels with human eyes: two independent reviewers judge a
 * representative sample, and a scan becomes "gold" only when the reviewers
 * agree on every field. Gold verdicts NEVER overwrite the system labels in
 * data_labels — they live in gold_label_reviews (see
 * supabase/migrations/20261017_gold_label_reviews.sql).
 *
 * This file is pure logic (no DB, no fetch) so it is fully unit-testable.
 * The API routes in app/api/admin/gold-label/ own the DB access.
 */

// ── Fields under review ────────────────────────────────────────────────────
// data_labels fields that are human JUDGMENT. Measured numbers
// (trust_score, overall_score, platforms_mentioned) are not judged — they
// come from scan data, and a reviewer cannot "agree" with a measurement.
export const GOLD_REVIEW_FIELDS = [
  'business_name',
  'industry',
  'intent_type',
  'query_type',
  'business_type',
  'competitor_category',
  'ai_recommendation_confidence',
  'city',
  'state',
  'country',
] as const;
export type GoldReviewField = (typeof GOLD_REVIEW_FIELDS)[number];

export function isGoldReviewField(value: unknown): value is GoldReviewField {
  return typeof value === 'string' && (GOLD_REVIEW_FIELDS as readonly string[]).includes(value);
}

// ── Test / demo exclusion ─────────────────────────────────────────────────
// The gold set must contain REAL businesses only. A scan is test data when:
//   - its data_quality_status is test / demo / quarantine, OR
//   - its business name or scan input contains a whole-word test marker
//     (test, demo, example, acme, foo, bar, sample, localhost, asdf,
//     qwerty, lorem, xxx), OR
//   - its input is blank (nothing real was scanned).
// Word boundaries matter: "Testa's Bakery" is a real business and is NOT
// excluded; "test business" is.
const TEST_STATUSES = new Set(['test', 'demo', 'quarantine']);
const TEST_PATTERN =
  /\b(test|demo|example|acme|foo|bar|sample|localhost|asdf|qwerty|lorem|xxx)\b/i;

export interface TestScanInput {
  business_name?: string | null;
  input?: string | null;
  data_quality_status?: string | null;
}

export function isTestScan(scan: TestScanInput): boolean {
  const status = (scan.data_quality_status ?? '').toLowerCase().trim();
  if (status && TEST_STATUSES.has(status)) return true;
  const input = (scan.input ?? '').trim();
  if (!input) return true;
  if (TEST_PATTERN.test(input)) return true;
  if (scan.business_name && TEST_PATTERN.test(scan.business_name)) return true;
  return false;
}

// ── Deterministic sampling ─────────────────────────────────────────────────
// Same seed + same candidate set → SAME sample, so two reviewers always get
// the same set. Stratified by industry + intent_type so the sample mirrors
// the population instead of over-representing the biggest industry.
// Candidates are de-duplicated by scan_id and sorted before sampling, so
// the result does not depend on DB row order.

export interface GoldSampleCandidate {
  scan_id: string;
  industry?: string | null;
  intent_type?: string | null;
  business_name?: string | null;
  input?: string | null;
  data_quality_status?: string | null;
}

export interface SampleOptions {
  /** Number of scans to pick (default 150). */
  size?: number;
  /** Seed for the shuffle. Fixed default so every reviewer gets the same set. */
  seed?: number;
}

// mulberry32 — small deterministic PRNG. No Math.random anywhere: the
// sample must be reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stratumKey(c: GoldSampleCandidate): string {
  return `${(c.industry ?? '').trim().toLowerCase() || 'unknown'}||${(c.intent_type ?? '').trim().toLowerCase() || 'unknown'}`;
}

export function sampleGoldScans(
  candidates: GoldSampleCandidate[],
  options: SampleOptions = {},
): GoldSampleCandidate[] {
  const size = Math.max(0, Math.floor(options.size ?? 150));
  const seed = options.seed ?? 20261017;
  if (size === 0) return [];

  // De-duplicate by scan_id (first occurrence wins) + drop test scans.
  const byId = new Map<string, GoldSampleCandidate>();
  for (const c of candidates) {
    if (!c.scan_id) continue;
    if (!byId.has(c.scan_id)) byId.set(c.scan_id, c);
  }
  const real = [...byId.values()]
    .filter((c) => !isTestScan(c))
    .sort((a, b) => (a.scan_id < b.scan_id ? -1 : a.scan_id > b.scan_id ? 1 : 0));
  if (real.length <= size) return real;

  // Stratify.
  const strata = new Map<string, GoldSampleCandidate[]>();
  for (const c of real) {
    const key = stratumKey(c);
    const list = strata.get(key) ?? [];
    list.push(c);
    strata.set(key, list);
  }

  // Proportional allocation with largest remainder.
  const total = real.length;
  const allocation = new Map<string, number>();
  const remainders: Array<{ key: string; frac: number }> = [];
  let assigned = 0;
  for (const [key, list] of strata) {
    const exact = (list.length / total) * size;
    const base = Math.floor(exact);
    allocation.set(key, base);
    assigned += base;
    remainders.push({ key, frac: exact - base });
  }
  remainders.sort((a, b) => b.frac - a.frac || (a.key < b.key ? -1 : 1));
  let i = 0;
  while (assigned < size && remainders.length > 0) {
    const { key } = remainders[i % remainders.length];
    allocation.set(key, (allocation.get(key) ?? 0) + 1);
    assigned += 1;
    i += 1;
  }

  // Deterministic shuffle inside each stratum, then take its allocation.
  const picked: GoldSampleCandidate[] = [];
  for (const [key, list] of strata) {
    const take = Math.min(allocation.get(key) ?? 0, list.length);
    if (take <= 0) continue;
    const rng = mulberry32(seed ^ hashString(key));
    const shuffled = [...list];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    picked.push(...shuffled.slice(0, take));
  }
  // Stable output order.
  return picked.sort((a, b) => (a.scan_id < b.scan_id ? -1 : a.scan_id > b.scan_id ? 1 : 0));
}

// ── Review input validation ───────────────────────────────────────────────

export interface ReviewInput {
  scan_id?: unknown;
  field_name?: unknown;
  verdict?: unknown;
  corrected_value?: unknown;
}

export function validateReviewInput(input: ReviewInput): { ok: true } | { ok: false; error: string } {
  if (typeof input.scan_id !== 'string' || !input.scan_id.trim()) {
    return { ok: false, error: 'scan_id is required' };
  }
  if (!isGoldReviewField(input.field_name)) {
    return { ok: false, error: `field_name must be one of: ${GOLD_REVIEW_FIELDS.join(', ')}` };
  }
  if (input.verdict !== 'agree' && input.verdict !== 'disagree') {
    return { ok: false, error: "verdict must be 'agree' or 'disagree'" };
  }
  if (input.verdict === 'disagree') {
    if (typeof input.corrected_value !== 'string' || !input.corrected_value.trim()) {
      return { ok: false, error: 'corrected_value is required when verdict is disagree' };
    }
  } else if (input.corrected_value != null && String(input.corrected_value).trim() !== '') {
    return { ok: false, error: 'corrected_value must be empty when verdict is agree' };
  }
  return { ok: true };
}

// ── Agreement ─────────────────────────────────────────────────────────────

export interface GoldReviewRow {
  scan_id: string;
  reviewer: string;
  field_name: string;
  verdict: 'agree' | 'disagree';
  corrected_value: string | null;
}

export interface FieldAgreement {
  field: string;
  reviewers: string[];
  /** True when ≥2 distinct reviewers judged this field and all agree. */
  agreed: boolean;
  /** True when ≥2 distinct reviewers judged this field and they conflict. */
  conflict: boolean;
  /** The agreed correction when reviewers disagreed with the system but agreed with each other. */
  agreedCorrection: string | null;
}

export interface AgreementResult {
  perField: Record<string, FieldAgreement>;
  /** Distinct reviewers across all fields. */
  reviewerCount: number;
  /** True when every field is agreed (implies ≥2 reviewers per field). */
  gold: boolean;
  /** True when any field has a genuine reviewer conflict. */
  needsAdjudication: boolean;
}

function normalizeCorrection(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function computeAgreement(
  reviews: GoldReviewRow[],
  fields: readonly string[] = GOLD_REVIEW_FIELDS,
): AgreementResult {
  const perField: Record<string, FieldAgreement> = {};
  const allReviewers = new Set<string>();
  for (const r of reviews) allReviewers.add(r.reviewer);

  let gold = true;
  let needsAdjudication = false;
  for (const field of fields) {
    const rows = reviews.filter((r) => r.field_name === field);
    const reviewers = [...new Set(rows.map((r) => r.reviewer))];
    const verdicts = new Set(rows.map((r) => r.verdict));
    const corrections = new Set(rows.filter((r) => r.verdict === 'disagree').map((r) => normalizeCorrection(r.corrected_value)));
    // Agreed = ≥2 reviewers, one verdict, and (if disagreeing) one shared correction.
    const agreed =
      reviewers.length >= 2 &&
      verdicts.size === 1 &&
      (verdicts.has('agree') || corrections.size === 1);
    const conflict = reviewers.length >= 2 && !agreed;
    if (!agreed) gold = false;
    if (conflict) needsAdjudication = true;
    perField[field] = {
      field,
      reviewers,
      agreed,
      conflict,
      agreedCorrection:
        agreed && verdicts.has('disagree') ? (rows.find((r) => r.verdict === 'disagree')?.corrected_value ?? null) : null,
    };
  }
  return { perField, reviewerCount: allReviewers.size, gold, needsAdjudication };
}

// ── Gold status ───────────────────────────────────────────────────────────

export type GoldStatus = 'pending' | 'gold' | 'needs_adjudication';

export interface GoldStatusRow {
  status: string;
  adjudicated_by?: string | null;
}

/**
 * Gold = (all fields agreed by ≥2 reviewers) OR an explicit adjudication
 * recorded in gold_scan_status. Adjudication is an override: it stands
 * even when reviewers conflicted, because a named admin resolved it by
 * hand and the provenance is stored with it.
 */
export function goldStatusFor(agreement: AgreementResult, statusRow?: GoldStatusRow | null): GoldStatus {
  if (statusRow?.status === 'gold') return 'gold';
  if (agreement.gold) return 'gold';
  if (statusRow?.status === 'needs_adjudication' || agreement.needsAdjudication) return 'needs_adjudication';
  return 'pending';
}

/** True when the table is missing (migration not yet applied). Callers use
 *  this to return a 503 migration_pending instead of a 500. */
export function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = (error as { code?: unknown })?.code;
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /gold_label_reviews/i.test(message) ||
    /gold_scan_status/i.test(message)
  );
}
