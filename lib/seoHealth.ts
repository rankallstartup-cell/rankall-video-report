// lib/seoHealth.ts
// SEO Health v1: a 0-100 score computed ONLY from data Rankall already has —
// the trust_signals JSON stored on the latest rankall_scans row.
//
// No fetches, no vendor APIs, no new audits. The score answers:
// "from the data in your latest scan, how healthy is your Google presence?"
//
// Honesty rules (non-negotiable):
// - A check that was never evaluated is NOT counted as a fail. It is
//   reported as `not_checked` and excluded from the denominator.
//   - Technical checks read "Website not analyzed" when the scan never
//     fetched the website — those are not evaluated, not failed.
//   - Review checks are inferred from AI platform responses. If the scan
//     had no responses at all ("No scan responses to analyse"), the whole
//     review bucket is not evaluated.
// - Every check carries its evidence kind: `measured` (observed directly
//   from the business's own website HTML or from citation sources) or
//   `estimated` (inferred from what AI platforms said in scan responses).
// - Every check carries the scan's date as `dataDate`. A stale score is
//   labelled with its date, never presented as fresh.
// - The Title tag check NEVER quotes the stored title. A stale scan can
//   hold another business's title (see PR #39); quoting it here would leak
//   it. The check reports only pass/fail, never the title text.
// - Community signals (Reddit, Nextdoor, news, awards, forums) are NOT
//   counted. They measure AI trust, not SEO. They live on the Trust page.
// - The stored trust report's own `overall` is IGNORED — that is the
//   AI-trust score over a different signal set, not an SEO score.
//
// Scoring: weighted pass rate over evaluated checks.
//   good -> 1, warning -> 0.5, danger/missing -> 0.
//   Weight = the signal's own pointsImpact (the same weight the trust
//   builders assign), falling back to impact level when pointsImpact is
//   absent. Bucket scores use the same math within the bucket.

import { TRUST_SIGNALS, type TrustSignalDef } from './trustSignals';
import type { TrustSignal, TrustSignalReport } from './trust';

export type SeoEvidence = 'measured' | 'estimated';
export type SeoBucket = 'Technical' | 'Content' | 'Local' | 'Reviews';
export type SeoCheckStatus = 'pass' | 'partial' | 'fail' | 'not_checked';

export interface SeoHealthCheck {
  /** Stable slug, e.g. 'title-tag'. */
  id: string;
  /** Display name, from the runtime trust signal. */
  name: string;
  bucket: SeoBucket;
  status: SeoCheckStatus;
  /** Evidence text. Never contains a quoted title tag (see header). */
  detail: string;
  /** Weight used in the score. */
  weight: number;
  /** How the underlying evidence was obtained. */
  evidence: SeoEvidence;
  /** ISO date of the scan this check came from. */
  dataDate: string;
  /** Fix Engine URL (e.g. /dashboard/fix?signal=...) or null when none exists. */
  fixUrl: string | null;
  /** One concrete action, from the canonical signal definition. */
  fixAction: string | null;
  /** What happens if this stays unfixed, when known. */
  consequence: string | null;
}

export interface SeoHealthBucketScore {
  name: SeoBucket;
  /** Null when the bucket had no evaluated checks. */
  score: number | null;
  evaluated: number;
  total: number;
}

export interface SeoHealthResult {
  /** Null only when nothing was evaluated — callers must show an empty state, never a fake score. */
  score: number | null;
  /** ISO date of the scan. */
  asOf: string;
  businessName: string;
  checks: SeoHealthCheck[];
  buckets: SeoHealthBucketScore[];
  /** Evaluated checks counted in the score. */
  evaluatedCount: number;
  /** Signals present in the report but excluded from the SEO score (community etc.). */
  excludedCount: number;
}

/** Runtime trust-signal name -> canonical signal definition key (for fix links + actions). */
const FIX_DEF_BY_SIGNAL_NAME: Record<string, string> = {
  'FAQ Schema': 'faq_schema',
  'LocalBusiness JSON-LD': 'business_data_markup',
  HTTPS: 'https_secure',
  'Meta description': 'meta_description',
  'Open Graph tags': 'open_graph',
  'Twitter Card': 'twitter_card',
  'Canonical URL': 'canonical_url',
  'H1 tag': 'h1_tag',
  'Image alt text': 'image_alt_text',
  'Phone number on page': 'phone_on_page',
  'Address on page': 'address_on_page',
  'Blog section': 'blog_section',
  'Services page': 'services_page',
  'Contact page': 'contact_page',
  'Title tag': 'title_tag',
  'Google Business': 'google_business',
  Yelp: 'yelp',
  BBB: 'bbb',
  Healthgrades: 'healthgrades',
  Facebook: 'facebook',
  'Review mentions': 'review_mentions',
  'Rating mentions': 'rating_mentions',
  'Review count': 'review_count',
  'Review recency': 'review_recency',
  'Review keywords': 'review_keywords',
  'Multi-platform reviews': 'multi_platform_reviews',
  'Response rate signals': 'review_response_rate',
};

/** Runtime trust-signal name -> SEO bucket. Technical report group only. */
const TECHNICAL_BUCKET_BY_NAME: Record<string, SeoBucket> = {
  'FAQ Schema': 'Technical',
  'LocalBusiness JSON-LD': 'Technical',
  HTTPS: 'Technical',
  'Open Graph tags': 'Technical',
  'Twitter Card': 'Technical',
  'Canonical URL': 'Technical',
  'Image alt text': 'Technical',
  'Phone number on page': 'Technical',
  'Address on page': 'Technical',
  'Contact page': 'Technical',
  'Meta description': 'Content',
  'H1 tag': 'Content',
  'Title tag': 'Content',
  'Blog section': 'Content',
  'Services page': 'Content',
};

const BUCKET_ORDER: SeoBucket[] = ['Technical', 'Content', 'Local', 'Reviews'];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function weightFor(signal: TrustSignal): number {
  if (typeof signal.pointsImpact === 'number' && Number.isFinite(signal.pointsImpact) && signal.pointsImpact > 0) {
    return signal.pointsImpact;
  }
  // Fallback when a builder omitted pointsImpact: impact level as weight.
  if (signal.impact === 'high') return 10;
  if (signal.impact === 'medium') return 5;
  return 3;
}

function creditFor(status: TrustSignal['status']): number {
  if (status === 'good') return 1;
  if (status === 'warning') return 0.5;
  return 0;
}

/**
 * Title tag detail that never quotes the stored title. A stale scan can
 * hold ANOTHER business's title; quoting it would leak it (PR #39 class).
 * Report only pass/fail, never the title text.
 */
function titleTagDetail(status: TrustSignal['status'], evaluated: boolean): string {
  if (!evaluated) return 'Website not analyzed';
  if (status === 'good') return 'Title tag includes your business name';
  if (status === 'warning') return 'Title tag present but business name missing';
  return 'No title tag found';
}

function isValidReport(report: unknown): report is TrustSignalReport {
  if (typeof report !== 'object' || report === null) return false;
  const r = report as Record<string, unknown>;
  return (
    Array.isArray(r.technical) ||
    Array.isArray(r.directory) ||
    Array.isArray(r.reviews) ||
    Array.isArray(r.community)
  );
}

function asSignalArray(value: unknown): TrustSignal[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is TrustSignal =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Record<string, unknown>).name === 'string' &&
      typeof (s as Record<string, unknown>).status === 'string' &&
      typeof (s as Record<string, unknown>).value === 'string',
  );
}

/**
 * Compute the SEO Health score from a stored trust_signals report.
 * Pure function — no DB, no fetch. Never throws; returns null when the
 * input cannot honestly produce a score (no report, no scan date, or
 * nothing evaluated).
 */
export function computeSeoHealth(
  report: unknown,
  opts: { asOf: string; businessName: string },
): SeoHealthResult | null {
  if (!isValidReport(report)) return null;
  const asOf = opts.asOf;
  if (typeof asOf !== 'string' || asOf.length === 0) return null;

  const technical = asSignalArray(report.technical);
  const directory = asSignalArray(report.directory);
  const reviews = asSignalArray(report.reviews);
  const community = asSignalArray(report.community);

  // The review bucket is inferred from AI platform responses. If the scan
  // had no responses at all, the whole bucket is unevaluated — not failed.
  const reviewsUnevaluated = reviews.some(
    (s) => s.name === 'Review mentions' && s.value === 'No scan responses to analyse',
  );

  const checks: SeoHealthCheck[] = [];
  let excludedCount = community.length; // community signals are never SEO checks

  const pushCheck = (
    signal: TrustSignal,
    bucket: SeoBucket,
    evidence: SeoEvidence,
    evaluated: boolean,
  ): void => {
    const defKey = FIX_DEF_BY_SIGNAL_NAME[signal.name];
    const def: TrustSignalDef | undefined = defKey ? TRUST_SIGNALS[defKey] : undefined;
    const isTitleTag = signal.name === 'Title tag';
    checks.push({
      id: slugify(signal.name),
      name: signal.name,
      bucket,
      status: !evaluated
        ? 'not_checked'
        : signal.status === 'good'
          ? 'pass'
          : signal.status === 'warning'
            ? 'partial'
            : 'fail',
      detail: isTitleTag ? titleTagDetail(signal.status, evaluated) : signal.value,
      weight: weightFor(signal),
      evidence,
      dataDate: asOf,
      fixUrl: def ? def.fixEngineUrl : null,
      fixAction: def ? def.quickAction : null,
      consequence: typeof signal.consequence === 'string' && signal.consequence.length > 0 ? signal.consequence : null,
    });
  };

  for (const signal of technical) {
    const bucket = TECHNICAL_BUCKET_BY_NAME[signal.name];
    if (!bucket) {
      excludedCount += 1; // unknown technical signal — not an SEO check
      continue;
    }
    // The scan never fetched the website: not evaluated, never a fail.
    const evaluated = signal.value !== 'Website not analyzed';
    pushCheck(signal, bucket, 'measured', evaluated);
  }

  for (const signal of directory) {
    // Directory signals are always evaluated: the citation-pool check ran
    // whether or not the website was fetched. 'missing' = genuinely absent.
    pushCheck(signal, 'Local', 'measured', true);
  }

  for (const signal of reviews) {
    pushCheck(signal, 'Reviews', 'estimated', !reviewsUnevaluated);
  }

  const evaluatedChecks = checks.filter((c) => c.status !== 'not_checked');
  const totalWeight = evaluatedChecks.reduce((sum, c) => sum + c.weight, 0);
  const earned = evaluatedChecks.reduce(
    (sum, c) => sum + c.weight * (c.status === 'pass' ? 1 : c.status === 'partial' ? 0.5 : 0),
    0,
  );
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : null;

  const buckets: SeoHealthBucketScore[] = BUCKET_ORDER.map((name) => {
    const inBucket = checks.filter((c) => c.bucket === name);
    const evaluated = inBucket.filter((c) => c.status !== 'not_checked');
    const w = evaluated.reduce((sum, c) => sum + c.weight, 0);
    const e = evaluated.reduce(
      (sum, c) => sum + c.weight * (c.status === 'pass' ? 1 : c.status === 'partial' ? 0.5 : 0),
      0,
    );
    return {
      name,
      score: w > 0 ? Math.round((e / w) * 100) : null,
      evaluated: evaluated.length,
      total: inBucket.length,
    };
  });

  return {
    score,
    asOf,
    businessName: opts.businessName,
    checks,
    buckets,
    evaluatedCount: evaluatedChecks.length,
    excludedCount,
  };
}
