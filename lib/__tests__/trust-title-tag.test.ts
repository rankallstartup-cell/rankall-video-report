import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectTrustSignals } from '../trustServer';

// Offline: the SSRF guard (lib/ssrf-server.ts) resolves the hostname
// before fetching. Mock the resolver with a PUBLIC answer so these tests
// never touch real DNS — the production guard is unchanged (private
// answers are still rejected; see ssrf-guard tests).
vi.mock('dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

// azzu: the title-tag check must use the RESOLVED business name
// (enrichment.google.name), not the raw scan input. Audit case: input
// "Bright Smile Dental Dallas TX" (typo'd), resolved "Brite Smiles
// Dentistry", title "Brite Smiles Dentistry - Dentists in Flower Mound"
// — the old code scored 'warning' ("business name missing") because it
// checked the title against the typo.
const TYPO_INPUT = 'Bright Smile Dental Dallas TX';
const RESOLVED = 'Brite Smiles Dentistry';
const TITLE = 'Brite Smiles Dentistry - Dentists in Flower Mound';

function stubSite(title: string) {
  const html = `<html><head><title>${title}</title></head><body><p>123 Main St, Flower Mound, TX</p><p>(555) 123-4567</p></body></html>`;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => html })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function titleSignal(opts: { googleName?: string | null }) {
  const report = await detectTrustSignals(
    {
      businessInput: TYPO_INPUT,
      websiteUrl: 'https://example.com',
      scanResults: [],
      citationSources: [],
      enrichment: { google: { name: opts.googleName ?? null } },
    },
    'US',
  );
  return report.technical.find((s) => s.name === 'Title tag')!;
}

describe('trust title-tag check — azzu resolved-name', () => {
  it('passes when the title contains the resolved name even though the raw input is typo’d', async () => {
    stubSite(TITLE);
    const signal = await titleSignal({ googleName: RESOLVED });
    expect(signal.status).toBe('good');
    expect(signal.value).toContain('Title includes business name');
  });

  it('falls back to the raw input when no resolved name exists', async () => {
    // Title holds only the typo'd raw input — passes via the fallback.
    stubSite('Bright Smile Dental Dallas TX - Dentists in Dallas');
    const signal = await titleSignal({ googleName: null });
    expect(signal.status).toBe('good');
  });

  it('fails when the title holds neither the resolved name nor the raw input', async () => {
    stubSite('Best Dentists in Flower Mound - Smile Studio');
    const signal = await titleSignal({ googleName: RESOLVED });
    expect(signal.status).toBe('warning');
    // #40: the URL is not user-verified here, so the non-matching title
    // (possibly another business's) is NOT quoted.
    expect(signal.value).toBe("Title doesn't mention your business name");
    expect(signal.value).not.toContain('Smile Studio');
  });
});
