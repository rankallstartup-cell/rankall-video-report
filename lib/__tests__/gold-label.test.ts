import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  GOLD_REVIEW_FIELDS,
  computeAgreement,
  goldStatusFor,
  isTestScan,
  mulberry32,
  sampleGoldScans,
  validateReviewInput,
  type GoldReviewRow,
  type GoldSampleCandidate,
} from '@/lib/goldLabel';

// Labeling Phase 2a — gold-set tooling. Pure-logic tests; the API routes
// own DB access and the admin guard lives in the route/page files (checked
// by file-content assertions below, matching the repo's admin-allowlist
// test style).

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function candidate(id: string, industry = 'dentist', intent = 'local'): GoldSampleCandidate {
  return { scan_id: id, industry, intent_type: intent, business_name: `Business ${id}`, input: `best ${industry} near me` };
}

function review(scanId: string, reviewer: string, field: string, verdict: 'agree' | 'disagree', corrected: string | null = null): GoldReviewRow {
  return { scan_id: scanId, reviewer, field_name: field, verdict, corrected_value: corrected };
}

function fullSet(scanId: string, reviewer: string, verdict: 'agree' | 'disagree' = 'agree', corrected: string | null = null): GoldReviewRow[] {
  return GOLD_REVIEW_FIELDS.map((f) => review(scanId, reviewer, f, verdict, verdict === 'disagree' ? (corrected ?? `fixed-${f}`) : null));
}

describe('gold-label sampling — deterministic + stratified + excludes test scans', () => {
  it('same seed + same candidates → identical sample (reproducible for both reviewers)', () => {
    const cands = Array.from({ length: 60 }, (_, i) => candidate(`scan-${String(i).padStart(3, '0')}`));
    const a = sampleGoldScans(cands, { size: 20, seed: 20261017 });
    const b = sampleGoldScans(cands, { size: 20, seed: 20261017 });
    expect(a.map((c) => c.scan_id)).toEqual(b.map((c) => c.scan_id));
  });

  it('different seed may reshuffle (seed actually drives the shuffle)', () => {
    const cands = Array.from({ length: 60 }, (_, i) => candidate(`scan-${String(i).padStart(3, '0')}`));
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(1);
    expect(rng1()).toEqual(rng2());
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });

  it('stratifies by industry + intent_type (sample mirrors the population)', () => {
    const cands = [
      ...Array.from({ length: 100 }, (_, i) => candidate(`a-${String(i).padStart(3, '0')}`, 'dentist', 'local')),
      ...Array.from({ length: 50 }, (_, i) => candidate(`b-${String(i).padStart(3, '0')}`, 'plumber', 'local')),
    ];
    const sample = sampleGoldScans(cands, { size: 30, seed: 7 });
    const dentists = sample.filter((c) => c.industry === 'dentist').length;
    const plumbers = sample.filter((c) => c.industry === 'plumber').length;
    expect(sample.length).toBe(30);
    expect(dentists).toBe(20);
    expect(plumbers).toBe(10);
  });

  it('returns all candidates when fewer than the requested size', () => {
    const cands = [candidate('s1'), candidate('s2')];
    expect(sampleGoldScans(cands, { size: 150, seed: 1 }).length).toBe(2);
  });

  it('de-duplicates by scan_id', () => {
    const cands = [candidate('s1'), candidate('s1'), candidate('s2')];
    expect(sampleGoldScans(cands, { size: 150, seed: 1 }).map((c) => c.scan_id)).toEqual(['s1', 's2']);
  });

  it('excludes test / demo / quarantine scans', () => {
    expect(isTestScan({ business_name: 'Test Business', input: 'best dentist', data_quality_status: 'ok' })).toBe(true);
    expect(isTestScan({ business_name: 'Demo Co', input: 'best dentist', data_quality_status: 'ok' })).toBe(true);
    expect(isTestScan({ business_name: 'Real Dental', input: 'best dentist', data_quality_status: 'quarantine' })).toBe(true);
    expect(isTestScan({ business_name: 'Real Dental', input: '', data_quality_status: 'ok' })).toBe(true);
    expect(isTestScan({ business_name: 'Acme Corp', input: 'best plumber', data_quality_status: 'ok' })).toBe(true);
  });

  it('does NOT exclude real businesses with test-like substrings (word boundaries)', () => {
    expect(isTestScan({ business_name: "Testa's Bakery", input: 'best bakery', data_quality_status: 'ok' })).toBe(false);
    expect(isTestScan({ business_name: 'Bright Smile Dental', input: 'best dentist Austin', data_quality_status: 'ok' })).toBe(false);
  });

  it('sampling drops test scans from the sample', () => {
    const cands = [
      candidate('real-1'),
      { scan_id: 'test-1', industry: 'dentist', intent_type: 'local', business_name: 'Test Business', input: 'test business', data_quality_status: 'ok' },
    ];
    const sample = sampleGoldScans(cands, { size: 150, seed: 1 });
    expect(sample.map((c) => c.scan_id)).toEqual(['real-1']);
  });
});

describe('gold-label agreement math', () => {
  it('two reviewers agreeing on every field → gold', () => {
    const reviews = [...fullSet('s1', 'a@x.com', 'agree'), ...fullSet('s1', 'b@x.com', 'agree')];
    const agreement = computeAgreement(reviews);
    expect(agreement.gold).toBe(true);
    expect(agreement.needsAdjudication).toBe(false);
    expect(agreement.reviewerCount).toBe(2);
    expect(goldStatusFor(agreement, null)).toBe('gold');
  });

  it('one reviewer alone → not gold (two independent reviews required)', () => {
    const agreement = computeAgreement(fullSet('s1', 'a@x.com', 'agree'));
    expect(agreement.gold).toBe(false);
    expect(goldStatusFor(agreement, null)).toBe('pending');
  });

  it('agree vs disagree on one field → conflict + needs adjudication', () => {
    const reviews = [...fullSet('s1', 'a@x.com', 'agree')];
    for (const r of fullSet('s1', 'b@x.com', 'agree')) {
      reviews.push(r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r);
    }
    const agreement = computeAgreement(reviews);
    expect(agreement.gold).toBe(false);
    expect(agreement.needsAdjudication).toBe(true);
    expect(agreement.perField.industry.conflict).toBe(true);
    expect(agreement.perField.city.agreed).toBe(true);
    expect(goldStatusFor(agreement, null)).toBe('needs_adjudication');
  });

  it('two reviewers disagreeing with the system but agreeing on the SAME correction → agreed', () => {
    const reviews = [
      ...fullSet('s1', 'a@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r,
      ),
      ...fullSet('s1', 'b@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r,
      ),
    ];
    const agreement = computeAgreement(reviews);
    expect(agreement.perField.industry.agreed).toBe(true);
    expect(agreement.perField.industry.agreedCorrection).toBe('doctor');
    expect(agreement.gold).toBe(true);
  });

  it('two reviewers disagreeing with DIFFERENT corrections → conflict', () => {
    const reviews = [
      ...fullSet('s1', 'a@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r,
      ),
      ...fullSet('s1', 'b@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'chiropractor' } : r,
      ),
    ];
    const agreement = computeAgreement(reviews);
    expect(agreement.perField.industry.conflict).toBe(true);
    expect(agreement.gold).toBe(false);
  });

  it('explicit adjudication → gold even when reviewers conflicted', () => {
    const reviews = [
      ...fullSet('s1', 'a@x.com', 'agree'),
      ...fullSet('s1', 'b@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r,
      ),
    ];
    const agreement = computeAgreement(reviews);
    expect(goldStatusFor(agreement, { status: 'gold', adjudicated_by: 'admin@x.com' })).toBe('gold');
  });

  it('adjudication is never downgraded by later conflicts', () => {
    const agreement = computeAgreement([
      ...fullSet('s1', 'a@x.com', 'agree'),
      ...fullSet('s1', 'b@x.com', 'agree').map((r) =>
        r.field_name === 'industry' ? { ...r, verdict: 'disagree' as const, corrected_value: 'doctor' } : r,
      ),
    ]);
    expect(goldStatusFor(agreement, { status: 'gold', adjudicated_by: 'admin@x.com' })).toBe('gold');
  });
});

describe('gold-label review input validation', () => {
  it('accepts a well-formed agree and disagree', () => {
    expect(validateReviewInput({ scan_id: 's1', field_name: 'industry', verdict: 'agree' }).ok).toBe(true);
    expect(validateReviewInput({ scan_id: 's1', field_name: 'industry', verdict: 'disagree', corrected_value: 'doctor' }).ok).toBe(true);
  });

  it('rejects unknown fields, bad verdicts, missing corrections, and corrections on agree', () => {
    expect(validateReviewInput({ scan_id: 's1', field_name: 'trust_score', verdict: 'agree' }).ok).toBe(false);
    expect(validateReviewInput({ scan_id: 's1', field_name: 'industry', verdict: 'maybe' }).ok).toBe(false);
    expect(validateReviewInput({ scan_id: 's1', field_name: 'industry', verdict: 'disagree' }).ok).toBe(false);
    expect(validateReviewInput({ scan_id: 's1', field_name: 'industry', verdict: 'agree', corrected_value: 'doctor' }).ok).toBe(false);
    expect(validateReviewInput({ scan_id: '', field_name: 'industry', verdict: 'agree' }).ok).toBe(false);
  });

  it('only judgment fields are reviewable — measured numbers are not', () => {
    expect(GOLD_REVIEW_FIELDS).not.toContain('trust_score');
    expect(GOLD_REVIEW_FIELDS).not.toContain('overall_score');
    expect(GOLD_REVIEW_FIELDS).not.toContain('platforms_mentioned');
    expect(GOLD_REVIEW_FIELDS.length).toBe(10);
  });
});

describe('gold-label migration file', () => {
  const MIGRATION = 'supabase/migrations/20261017_gold_label_reviews.sql';

  it('exists and creates both tables with the required shape', () => {
    expect(existsSync(join(process.cwd(), MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toMatch(/create table if not exists public\.gold_label_reviews/);
    expect(sql).toMatch(/create table if not exists public\.gold_scan_status/);
    expect(sql).toMatch(/scan_id uuid not null/);
    expect(sql).toMatch(/reviewer text not null/);
    expect(sql).toMatch(/field_name text not null/);
    expect(sql).toMatch(/system_value text/);
    expect(sql).toMatch(/verdict text not null check \(verdict in \('agree', 'disagree'\)\)/);
    expect(sql).toMatch(/corrected_value text/);
    expect(sql).toMatch(/reviewed_at timestamptz/);
    expect(sql).toMatch(/unique \(scan_id, reviewer, field_name\)/);
    expect(sql).toMatch(/adjudicated_by text/);
    expect(sql).toMatch(/final_values jsonb/);
    expect(sql).toMatch(/enable row level security/);
  });
});

describe('gold-label admin guards (file-content checks)', () => {
  const guarded = [
    'app/api/admin/gold-label/sample/route.ts',
    'app/api/admin/gold-label/reviews/route.ts',
    'app/api/admin/gold-label/adjudicate/route.ts',
    'app/admin/gold-labels/page.tsx',
  ];
  it.each(guarded)('%s checks the admin allowlist and denies non-admins', (p) => {
    const src = read(p);
    expect(src).toMatch(/isAdminUser/);
    expect(src).toMatch(/Unauthorized|Access denied/);
  });

  it('review POST never takes reviewer identity from the body', () => {
    const src = read('app/api/admin/gold-label/reviews/route.ts');
    // Reviewer comes from the session user only.
    expect(src).toMatch(/user\?\.email/);
    expect(src).not.toMatch(/body\.reviewer|input\.reviewer/);
  });

  it('adjudicate POST never takes adjudicator identity from the body', () => {
    const src = read('app/api/admin/gold-label/adjudicate/route.ts');
    expect(src).toMatch(/user\?\.email/);
    expect(src).not.toMatch(/body\.adjudicated_by|input\.adjudicated_by/);
  });
});
