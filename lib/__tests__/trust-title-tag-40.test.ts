import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTechnicalSignals, sanitizeTitleTagSignal, type TrustSignal } from '../trust';

// #40: a non-matching title from an unverified website (e.g. a URL found
// via Places, with no Google data to cross-check) may belong to ANOTHER
// business — never quote it.
const html = (title: string) => `<html><head><title>${title}</title></head><body>Hi</body></html>`;
const titleSig = (title: string, name: string, websiteVerified?: boolean) =>
  buildTechnicalSignals(html(title), 'https://example.com', name, false, '', { websiteVerified })
    .find(s => s.name === 'Title tag')!;

describe('#40 title tag quoting', () => {
  it('unverified site + foreign title => not quoted', () => {
    const s = titleSig('Smile Studio - Dentists in Plano', 'Brite Smiles Dentistry');
    expect(s.status).toBe('warning');
    expect(s.value).toBe("Title doesn't mention your business name");
    expect(s.value).not.toContain('Smile Studio');
  });

  it('title containing the resolved name is quoted (good)', () => {
    const s = titleSig('Brite Smiles Dentistry - Dentists in Flower Mound', 'Brite Smiles Dentistry');
    expect(s.status).toBe('good');
    expect(s.value).toContain('"Brite Smiles Dentistry - Dentists in Flower Mound"');
  });

  it('user-verified site => its own non-matching title may be quoted', () => {
    const s = titleSig('Home | Welcome', 'Brite Smiles Dentistry', true);
    expect(s.status).toBe('warning');
    expect(s.value).toContain('"Home | Welcome"');
  });

  it('accent-insensitive name check', () => {
    expect(titleSig('Cafe Muller | Berlin', 'Café Müller').status).toBe('good');
  });

  it('render-time sanitiser unquotes legacy non-matching titles with no Google data', () => {
    const legacy: TrustSignal = {
      name: 'Title tag', status: 'warning', impact: 'low', fixAvailable: true, pointsImpact: 4,
      value: 'Title present but business name missing: "Other Biz | Plano"',
    };
    const out = sanitizeTitleTagSignal(legacy, false);
    expect(out.value).not.toContain('Other Biz');
  });

  it('dashboard trust page applies the same sanitiser', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/trust/page.tsx'), 'utf8');
    expect(src).toContain('sanitizeTitleTagSignal');
  });
});
