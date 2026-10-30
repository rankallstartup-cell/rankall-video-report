import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectTrustSignals } from '../trustServer';
import { fetchSerpData } from '../enrichment';

// b8ad supersedes the azzz '~' rule: DA numerics are GONE from directory
// values. The figures were Rankall estimates of the SOURCE's authority
// (never measured, no source/date), not measurements of this business,
// and they read as business data. The impact tier already conveys how
// much each source matters. (trustSignals.ts:171 still carries a bare
// 'Domain Authority 94.' — azzz's leftover, its own ticket.)
// fetchSerpData hardcoded gl='us', giving every GB/AU/IE business US
// SERP presence flags — the wrong market.

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SERPAPI_KEY;
});

describe('DA numerics removed — b8ad', () => {
  it('directory signal values carry no Domain Authority numerics', async () => {
    const report = await detectTrustSignals(
      {
        businessInput: 'Brite Smiles Dentistry',
        scanResults: [],
        citationSources: ['yelp.com'],
        enrichment: null,
      },
      'US',
    );
    for (const s of report.directory) {
      expect(s.value).not.toContain('Domain Authority');
      expect(s.value).not.toContain('DA ~');
      expect(s.consequence ?? '').not.toContain('Domain Authority');
      expect(s.consequence ?? '').not.toContain('DA ~');
    }
    const yelp = report.directory.find((s) => s.name === 'Yelp')!;
    expect(yelp.value).toContain('Cited in AI responses');
  });
});

describe('SERP locale — azzz', () => {
  async function captureGl(countryCode?: string) {
    process.env.SERPAPI_KEY = 'test-key';
    let captured = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      captured = url;
      return { json: async () => ({}) };
    }));
    await fetchSerpData('Brite Smiles Dentistry', 'London', countryCode);
    return captured;
  }

  it('uses gl from the business country (GB)', async () => {
    expect(await captureGl('GB')).toContain('gl=gb');
  });

  it('defaults to gl=us when no country is given', async () => {
    expect(await captureGl()).toContain('gl=us');
  });
});
