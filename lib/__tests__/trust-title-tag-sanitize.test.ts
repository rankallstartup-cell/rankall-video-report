import { describe, it, expect } from 'vitest';
import { sanitizeTitleTagSignal, type TrustSignal } from '../trust';

function titleTagSignal(overrides: Partial<TrustSignal> = {}): TrustSignal {
  return {
    name: 'Title tag',
    status: 'warning',
    value: 'Title present but business name missing: "Brite Smiles Dentistry - Dentists in Flower Mound"',
    impact: 'low',
    fixAvailable: true,
    consequence: "Title tag missing or doesn't include business name — AI cannot reliably identify you in branded queries",
    pointsImpact: 4,
    ...overrides,
  };
}

describe('sanitizeTitleTagSignal', () => {
  it('replaces a quoted wrong-business title with an honest not-verified state on mismatch (d4b92cf0 regression)', () => {
    const out = sanitizeTitleTagSignal(titleTagSignal(), true);
    expect(out.status).toBe('missing');
    expect(out.value).not.toContain('Brite Smiles');
    expect(out.value).not.toContain('Flower Mound');
    expect(out.value).not.toContain('"');
    expect(out.consequence ?? '').not.toContain('Brite Smiles');
    expect(out.pointsImpact).toBe(0);
    expect(out.fixAvailable).toBe(true);
  });

  // #40: updated — a legacy non-matching quoted title is unquoted even when
  // the GBP data is trusted: the website it came from was never verified,
  // so the quoted title may be another business's. Status is kept.
  it('unquotes a legacy non-matching title even when the stored GBP data is trusted', () => {
    const out = sanitizeTitleTagSignal(titleTagSignal(), false);
    expect(out.status).toBe('warning');
    expect(out.value).toBe("Title doesn't mention your business name");
    expect(out.value).not.toContain('"');
  });

  it('keeps a quoted title that passed the name check (good) when GBP data is trusted', () => {
    const signal = titleTagSignal({ status: 'good', value: 'Title includes business name: "Brite Smiles Dentistry"' });
    expect(sanitizeTitleTagSignal(signal, false)).toEqual(signal);
  });

  it("keeps the user-verified site's quoted title", () => {
    const signal = titleTagSignal({ value: `Your website's title doesn't mention your business name: "Home | Welcome"` });
    expect(sanitizeTitleTagSignal(signal, false)).toEqual(signal);
  });

  it('leaves the signal untouched when no title is quoted (nothing to leak)', () => {
    const signal = titleTagSignal({ status: 'missing', value: 'No title tag found', pointsImpact: 4 });
    expect(sanitizeTitleTagSignal(signal, true)).toEqual(signal);
  });

  it('leaves non-Title-tag signals untouched even on mismatch', () => {
    const signal = titleTagSignal({ name: 'H1 tag', value: 'H1 includes business name: "Bright Smile Dental"' });
    expect(sanitizeTitleTagSignal(signal, true)).toEqual(signal);
  });

  it('sanitizes a good-status quoted title too — never quote another business title', () => {
    const signal = titleTagSignal({
      status: 'good',
      value: 'Title includes business name: "Brite Smiles Dentistry"',
    });
    const out = sanitizeTitleTagSignal(signal, true);
    expect(out.status).toBe('missing');
    expect(out.value).not.toContain('Brite Smiles');
  });
});
