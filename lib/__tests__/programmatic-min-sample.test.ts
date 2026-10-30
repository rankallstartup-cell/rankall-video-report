import { describe, it, expect, vi } from 'vitest';

// The lib imports react's cache (server-only in some builds) — identity is fine here.
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }));

import {
  MIN_PUBLIC_SAMPLE,
  meetsMinSample,
  businessKey,
  latestPerBusiness,
  summarizeCombos,
  indexableCombos,
} from '../programmaticAggregates';
import { programmaticSitemapEntries } from '../sitemapEntries';

const CITIES = {
  austin: { label: 'Austin', state: 'TX', nearby: [] },
  dallas: { label: 'Dallas', state: 'TX', nearby: [] },
};
const IND = new Set(['dentist', 'hvac']);

function row(i: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `s${i}`,
    industry: 'dentist',
    location: 'Austin, TX',
    overall_score: 40,
    created_at: `2026-10-${String(10 + (i % 10)).padStart(2, '0')}T00:00:00Z`,
    business_id: `b${i}`,
    user_business_name: null,
    input: null,
    ...over,
  } as never;
}

describe('azxc: minimum-sample gate', () => {
  it('threshold is 5', () => {
    expect(MIN_PUBLIC_SAMPLE).toBe(5);
    expect(meetsMinSample(4)).toBe(false);
    expect(meetsMinSample(5)).toBe(true);
    expect(meetsMinSample(null)).toBe(false);
    expect(meetsMinSample(NaN)).toBe(false);
  });

  it('one business scanned many times counts once', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i, { business_id: 'same' }));
    const s = summarizeCombos(rows, CITIES, IND);
    expect(s.get('dentist/austin')?.count).toBe(1);
    expect(indexableCombos(s).size).toBe(0);
  });

  it('a single scan never publishes (the old 1-scan "average" leak)', () => {
    const s = summarizeCombos([row(1, { overall_score: 73 })], CITIES, IND);
    expect(indexableCombos(s).has('dentist/austin')).toBe(false);
  });

  it('5 distinct businesses → indexable, average over latest scan each', () => {
    const rows = [
      row(9, { business_id: 'a', overall_score: 50 }), // newest for a
      row(8, { business_id: 'a', overall_score: 10 }), // older, ignored
      row(7, { business_id: 'b', overall_score: 30 }),
      row(6, { business_id: 'c', overall_score: 30 }),
      row(5, { business_id: 'd', overall_score: 30 }),
      row(4, { business_id: 'e', overall_score: 30 }),
    ];
    const s = indexableCombos(summarizeCombos(rows, CITIES, IND));
    const c = s.get('dentist/austin')!;
    expect(c.count).toBe(5);
    expect(Math.round(c.sum / c.count)).toBe(34);
  });

  it('ignores zero scores, unknown industries and unmatched cities', () => {
    const rows = [
      row(1, { overall_score: 0 }),
      row(2, { industry: 'plumber' }),
      row(3, { location: 'Austinburg, OH' }),
    ];
    expect(summarizeCombos(rows, CITIES, IND).size).toBe(0);
  });

  it('businessKey falls back business_id → name → input → scan id', () => {
    expect(businessKey({ business_id: 'x' })).toBe('b:x');
    expect(businessKey({ user_business_name: ' Joe  Dental ' })).toBe('n:joe dental');
    expect(businessKey({ input: 'Joe Dental Austin' })).toBe('i:joe dental austin');
    expect(businessKey({ id: 's1' })).toBe('s:s1');
    expect(latestPerBusiness([{ id: '1', business_id: 'x' }, { id: '2', business_id: 'x' }]).map((r) => r.id)).toEqual(['1']);
  });
});

describe('ax8c/azxg: sitemap lists only indexable programmatic URLs + their hubs', () => {
  const known = { industries: new Set(['dentist', 'hvac']), cities: new Set(['austin', 'dallas']) };
  it('emits combos and only the hubs that have an indexable child', () => {
    const combos = new Map([['dentist/austin', '2026-10-01T00:00:00Z']]);
    const { pages, hubs } = programmaticSitemapEntries(combos, 'https://rankall.io', known);
    expect(pages.map((p) => p.url)).toEqual(['https://rankall.io/dentist/austin']);
    expect(hubs.map((h) => h.url)).toEqual(['https://rankall.io/cities/austin', 'https://rankall.io/dentist']);
    expect(hubs.some((h) => h.url.endsWith('/hvac') || h.url.endsWith('/dallas'))).toBe(false);
    expect(pages[0].lastModified?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it('no indexable combos → no programmatic URLs and no hubs', () => {
    const { pages, hubs } = programmaticSitemapEntries(new Map(), 'https://rankall.io', known);
    expect(pages).toEqual([]);
    expect(hubs).toEqual([]);
  });
  it('drops unknown slugs and omits invalid lastmod', () => {
    const combos = new Map([['ghost/austin', '2026-10-01'], ['hvac/dallas', '']]);
    const { pages } = programmaticSitemapEntries(combos, 'https://rankall.io', known);
    expect(pages.map((p) => p.url)).toEqual(['https://rankall.io/hvac/dallas']);
    expect(pages[0].lastModified).toBeUndefined();
  });
});
