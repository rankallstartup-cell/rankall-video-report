import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }));

import { selectComboScans, summarizeCombos, indexableCombos } from '../programmaticAggregates';

// Fix round 2: the combo page used the newest 200 rows; the sitemap used
// every row — they could disagree on whether a combo is indexable.
const CITIES = {
  austin: { label: 'Austin', state: 'TX', nearby: [] },
  austinburg: { label: 'Austinburg', state: 'OH', nearby: [] },
};

function rows() {
  const out = [];
  // 300 newest scans of ONE business, then 6 distinct older businesses.
  for (let i = 0; i < 300; i++) out.push({ id: `r${i}`, industry: 'dentist', location: 'Austin, TX', overall_score: 50, created_at: `2026-10-15T00:${String(i % 60).padStart(2, '0')}:00Z`, business_id: 'same', user_business_name: null, input: null });
  for (let i = 0; i < 6; i++) out.push({ id: `o${i}`, industry: 'dentist', location: 'Austin', overall_score: 30 + i, created_at: `2026-09-0${i + 1}T00:00:00Z`, business_id: `b${i}`, user_business_name: null, input: null });
  out.push({ id: 'x', industry: 'dentist', location: 'Austinburg, OH', overall_score: 90, created_at: '2026-10-16T00:00:00Z', business_id: 'z', user_business_name: null, input: null });
  out.push({ id: 'zero', industry: 'dentist', location: 'Austin', overall_score: 0, created_at: '2026-10-16T00:00:00Z', business_id: 'q', user_business_name: null, input: null });
  return out;
}

describe('page and sitemap select the same scans', () => {
  it('selectComboScans counts distinct businesses over ALL rows (no 200-row window)', () => {
    const scans = selectComboScans(rows(), 'dentist', 'austin', CITIES);
    expect(scans.length).toBe(7);
  });
  it('summarizeCombos agrees with selectComboScans for every combo', () => {
    const r = rows();
    const summary = summarizeCombos(r, CITIES, new Set(['dentist']));
    for (const [key, v] of summary) {
      const [ind, city] = key.split('/');
      const scans = selectComboScans(r, ind, city, CITIES);
      expect(v.count).toBe(scans.length);
      expect(v.sum).toBe(scans.reduce((a, s) => a + s.overall_score, 0));
    }
    expect(indexableCombos(summary).has('dentist/austin')).toBe(true);
  });
  it('getComboAggregate no longer uses a 200-row limit', () => {
    const src = readFileSync(join(process.cwd(), 'lib/programmaticAggregates.ts'), 'utf-8');
    expect(src).not.toContain('.limit(200)');
    expect(src).toContain('selectComboScans(all, industry, citySlug, cities)');
  });
});
