import { describe, it, expect } from 'vitest';
import { computeSeoHealth } from '../seoHealth';
import type { TrustSignal, TrustSignalReport } from '../trust';

function signal(overrides: Partial<TrustSignal> & { name: string }): TrustSignal {
  return {
    status: 'good',
    value: 'ok',
    impact: 'medium',
    fixAvailable: false,
    pointsImpact: 10,
    ...overrides,
  };
}

function report(overrides: Partial<TrustSignalReport> = {}): TrustSignalReport {
  return {
    technical: [],
    directory: [],
    reviews: [],
    community: [],
    aiPlatforms: [],
    overall: 0,
    ...overrides,
  };
}

const OPTS = { asOf: '2026-10-15T12:00:00.000Z', businessName: 'Bright Smile Dental' };

describe('computeSeoHealth', () => {
  it('scores 100 when every evaluated check passes', () => {
    const out = computeSeoHealth(
      report({
        technical: [signal({ name: 'HTTPS', value: 'Site served over HTTPS' })],
        directory: [signal({ name: 'Google Business', value: 'Listed in AI citation sources' })],
        reviews: [signal({ name: 'Review mentions', value: 'Reviews mentioned by 5 of 8 AI platforms' })],
      }),
      OPTS,
    );
    expect(out?.score).toBe(100);
    expect(out?.evaluatedCount).toBe(3);
    expect(out?.asOf).toBe(OPTS.asOf);
    expect(out?.businessName).toBe('Bright Smile Dental');
  });

  it('scores 0 when every evaluated check fails', () => {
    const out = computeSeoHealth(
      report({
        technical: [signal({ name: 'HTTPS', status: 'danger', value: 'Site not served over HTTPS' })],
        directory: [signal({ name: 'Google Business', status: 'missing', value: 'Not in AI citation pool' })],
        reviews: [signal({ name: 'Review mentions', status: 'missing', value: 'Reviews not mentioned' })],
      }),
      OPTS,
    );
    expect(out?.score).toBe(0);
  });

  it('gives half credit for warning (partial) checks', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'HTTPS' }),
          signal({ name: 'Open Graph tags', status: 'warning', value: 'Partial OG tags' }),
        ],
      }),
      OPTS,
    );
    // (10*1 + 10*0.5) / 20 = 75
    expect(out?.score).toBe(75);
    expect(out?.checks.find((c) => c.name === 'Open Graph tags')?.status).toBe('partial');
  });

  it('returns null for missing/malformed input — never a fake score', () => {
    expect(computeSeoHealth(null, OPTS)).toBeNull();
    expect(computeSeoHealth(undefined, OPTS)).toBeNull();
    expect(computeSeoHealth({}, OPTS)).toBeNull();
    expect(computeSeoHealth('not a report', OPTS)).toBeNull();
    expect(computeSeoHealth(report(), { asOf: '', businessName: 'X' })).toBeNull();
  });

  it('returns a null score (not 0) when nothing was evaluated', () => {
    const out = computeSeoHealth(
      report({
        technical: [signal({ name: 'HTTPS', status: 'missing', value: 'Website not analyzed', pointsImpact: 0 })],
      }),
      OPTS,
    );
    expect(out?.score).toBeNull();
    expect(out?.evaluatedCount).toBe(0);
    expect(out?.checks[0]?.status).toBe('not_checked');
  });

  it('treats "Website not analyzed" technical signals as not evaluated, never failed', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'HTTPS', status: 'missing', value: 'Website not analyzed', pointsImpact: 0 }),
          signal({ name: 'H1 tag' }),
        ],
      }),
      OPTS,
    );
    // Only the H1 check counts; it passes -> 100, not dragged down by the unevaluated HTTPS check.
    expect(out?.score).toBe(100);
    expect(out?.evaluatedCount).toBe(1);
  });

  it('marks the whole review bucket not_checked when the scan had no responses', () => {
    const out = computeSeoHealth(
      report({
        technical: [signal({ name: 'HTTPS' })],
        reviews: [
          signal({ name: 'Review mentions', status: 'missing', value: 'No scan responses to analyse' }),
          signal({ name: 'Rating mentions', status: 'missing', value: 'No star ratings mentioned' }),
        ],
      }),
      OPTS,
    );
    expect(out?.checks.filter((c) => c.bucket === 'Reviews').every((c) => c.status === 'not_checked')).toBe(true);
    // Score comes from the evaluated HTTPS check only.
    expect(out?.score).toBe(100);
    expect(out?.buckets.find((b) => b.name === 'Reviews')?.score).toBeNull();
  });

  it('ignores unknown signal names and excludes community signals from the score', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'HTTPS' }),
          signal({ name: 'Some Future Signal', status: 'missing', value: 'unknown' }),
        ],
        community: [
          signal({ name: 'Reddit mentions', status: 'missing', value: 'No Reddit mentions found' }),
          signal({ name: 'Local news mentions', status: 'missing', value: 'No news' }),
        ],
      }),
      OPTS,
    );
    expect(out?.score).toBe(100);
    expect(out?.excludedCount).toBe(3); // 1 unknown technical + 2 community
    expect(out?.checks.some((c) => c.name === 'Some Future Signal')).toBe(false);
    expect(out?.checks.some((c) => c.name === 'Reddit mentions')).toBe(false);
  });

  it('never quotes a title tag — no leak from a stale poisoned report', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({
            name: 'Title tag',
            status: 'good',
            value: 'Title includes business name: "Brite Smiles Dentistry - Dentists in Flower Mound"',
          }),
        ],
      }),
      OPTS,
    );
    const title = out?.checks.find((c) => c.name === 'Title tag');
    expect(title?.detail).toBe('Title tag includes your business name');
    expect(title?.detail).not.toContain('Brite Smiles');
    expect(title?.detail).not.toContain('"');
  });

  it('labels evidence honestly: technical + directory measured, reviews estimated', () => {
    const out = computeSeoHealth(
      report({
        technical: [signal({ name: 'HTTPS' })],
        directory: [signal({ name: 'Google Business' })],
        reviews: [signal({ name: 'Review mentions' })],
      }),
      OPTS,
    );
    expect(out?.checks.find((c) => c.name === 'HTTPS')?.evidence).toBe('measured');
    expect(out?.checks.find((c) => c.name === 'Google Business')?.evidence).toBe('measured');
    expect(out?.checks.find((c) => c.name === 'Review mentions')?.evidence).toBe('estimated');
  });

  it('attaches fix links + actions from the canonical signal definitions, and none when unknown', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'Title tag', status: 'missing', value: 'No title tag found' }),
          signal({ name: 'H1 tag', status: 'missing', value: 'No H1 tag found on page' }),
        ],
        directory: [
          // Zocdoc has no canonical def entry — no fix link, still scored.
          signal({ name: 'Zocdoc', status: 'missing', value: 'Not in AI citation pool' }),
        ],
      }),
      OPTS,
    );
    const title = out?.checks.find((c) => c.name === 'Title tag');
    expect(title?.fixUrl).toContain('/dashboard/fix?signal=');
    expect(title?.fixAction).toContain('title');
    const zocdoc = out?.checks.find((c) => c.name === 'Zocdoc');
    expect(zocdoc?.fixUrl).toBeNull();
    expect(zocdoc?.bucket).toBe('Local');
  });

  it('computes per-bucket subscores and stamps every check with the scan date', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'HTTPS' }),
          signal({ name: 'H1 tag', status: 'missing', value: 'No H1 tag found on page' }),
        ],
        directory: [signal({ name: 'Google Business' })],
      }),
      OPTS,
    );
    // Technical bucket: HTTPS pass (10) + H1 fail (10) -> 50. Content bucket: H1 is Content, not Technical.
    // H1 tag maps to Content; HTTPS maps to Technical.
    expect(out?.buckets.find((b) => b.name === 'Technical')?.score).toBe(100);
    expect(out?.buckets.find((b) => b.name === 'Content')?.score).toBe(0);
    expect(out?.buckets.find((b) => b.name === 'Local')?.score).toBe(100);
    expect(out?.buckets.find((b) => b.name === 'Reviews')?.score).toBeNull();
    expect(out?.checks.every((c) => c.dataDate === OPTS.asOf)).toBe(true);
  });

  it('weights by pointsImpact: a heavy fail hurts more than a light fail', () => {
    const out = computeSeoHealth(
      report({
        technical: [
          signal({ name: 'LocalBusiness JSON-LD', status: 'missing', value: 'No LocalBusiness JSON-LD detected', pointsImpact: 16 }),
          signal({ name: 'Twitter Card', status: 'missing', value: 'No Twitter Card tag found', pointsImpact: 3 }),
          signal({ name: 'HTTPS' }),
        ],
      }),
      OPTS,
    );
    // (10*1 + 16*0 + 3*0) / 29 = 34
    expect(out?.score).toBe(34);
  });
});
