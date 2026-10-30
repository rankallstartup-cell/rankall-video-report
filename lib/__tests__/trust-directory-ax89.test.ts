import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDirectorySignals } from '../trust';
import { extractCitationSources } from '../analyser-ml';
import { fetchWebsiteHtml, subpageUrls, detectTrustSignals, MAX_HTML_BYTES } from '../trustServer';

vi.mock('dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ax89 general industry = unknown', () => {
  it('"general" keeps Healthgrades and Avvo (no false hiding)', () => {
    const names = buildDirectorySignals([], '', ['healthgrades.com', 'avvo.com'], { industry: 'general' }).map(s => s.name);
    expect(names).toContain('Healthgrades');
    expect(names).toContain('Avvo');
  });

  it('a known non-medical industry still hides Healthgrades', () => {
    const names = buildDirectorySignals([], '', ['healthgrades.com'], { industry: 'plumber' }).map(s => s.name);
    expect(names).not.toContain('Healthgrades');
  });
});

describe('ax89 SERP absent vetoes text-only evidence', () => {
  it('citation + SERP absent => warning, not good', () => {
    const hg = buildDirectorySignals(['Healthgrades'], '', ['healthgrades.com'], {
      industry: 'dentist', serpData: { healthgradesPresent: false },
    }).find(s => s.name === 'Healthgrades')!;
    expect(hg.status).toBe('warning');
    expect(hg.value).toContain('no Healthgrades listing found');
  });

  it('citation with no SERP data => good (unchanged)', () => {
    const hg = buildDirectorySignals(['Healthgrades'], '', ['healthgrades.com'], { industry: 'dentist' })
      .find(s => s.name === 'Healthgrades')!;
    expect(hg.status).toBe('good');
  });

  it('SERP present => good', () => {
    const hg = buildDirectorySignals([], '', ['healthgrades.com'], {
      industry: 'dentist', serpData: { healthgradesPresent: true },
    }).find(s => s.name === 'Healthgrades')!;
    expect(hg.status).toBe('good');
  });
});

describe('ax89 citations need the business as the subject', () => {
  const BIZ = 'Brite Smiles Dentistry';
  it.each([
    'Look for reviews on Yelp before you book.',
    'Find a dentist on Zocdoc and book online.',
    'You can check Healthgrades profiles for ratings.',
    'Brite Smiles Dentistry is nice. Look for reviews on Yelp.',
  ])('not a citation: %s', (text) => {
    expect(extractCitationSources(text, BIZ)).toEqual([]);
  });

  it('a sentence about the business with citation context counts', () => {
    expect(extractCitationSources('Brite Smiles Dentistry is listed on Yelp with 200 reviews.', BIZ)).toContain('Yelp');
    expect(extractCitationSources('Brite Smiles Dentistry has a Healthgrades profile.', BIZ)).toContain('Healthgrades');
  });

  it('no business name => no citations', () => {
    expect(extractCitationSources('Smile Co is listed on Yelp.')).toEqual([]);
  });
});

describe('ax89 website fetching', () => {
  it('subpages are built from the ORIGIN, never the raw URL/query', () => {
    expect(subpageUrls('https://example.com/?ref=gbp')).toEqual([
      'https://example.com/contact', 'https://example.com/contact-us', 'https://example.com/about',
    ]);
    expect(subpageUrls('example.com/page.html')[0]).toBe('https://example.com/contact');
    expect(subpageUrls('not a url ::')).toEqual([]);
  });

  it('detectTrustSignals fetches subpages at the origin', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      seen.push(String(u));
      return { ok: true, status: 200, text: async () => '<html><title>X</title><body>hi</body></html>' };
    }));
    await detectTrustSignals({
      businessInput: 'X', websiteUrl: 'https://example.com/landing?utm=1', scanResults: [], citationSources: [],
    }, 'US');
    expect(seen).toContain('https://example.com/contact');
    expect(seen.some(u => u.includes('utm=1/contact'))).toBe(false);
  });

  it('caps the body at ~2MB', async () => {
    const big = 'a'.repeat(MAX_HTML_BYTES + 5000);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        for (let i = 0; i < big.length; i += 65536) c.enqueue(enc.encode(big.slice(i, i + 65536)));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, body, text: async () => big })));
    const html = await fetchWebsiteHtml('https://example.com');
    expect(html!.length).toBe(MAX_HTML_BYTES);
  });

  it('keeps the timeout armed through the body read', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const signal = init.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          // Headers arrive at once; the body never finishes until aborted.
          signal.addEventListener('abort', () => { aborted = true; c.error(new Error('aborted')); });
        },
      });
      return { ok: true, status: 200, body };
    }));
    const p = fetchWebsiteHtml('https://example.com');
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await p).toBeNull();
    expect(aborted).toBe(true);
  });
});
