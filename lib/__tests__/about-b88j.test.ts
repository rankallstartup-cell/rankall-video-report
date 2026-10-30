import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88j — /about: the stats block hardcoded 11/35/13 (canonical
// constants — right values, wrong source: they would rot
// silently), the 800M ChatGPT claim carried no attribution, and
// the CTA promised "Under 90 seconds" against the site's settled
// "about 90 seconds".

const page = readFileSync(join(process.cwd(), 'app/about/page.tsx'), 'utf8');

describe('b88j — about page numbers', () => {
  it('stats derive from the canonical constants', () => {
    expect(page).toContain('String(PLATFORMS_SCANNED)');
    expect(page).toContain('String(TRUST_SIGNAL_COUNT)');
    expect(page).toContain('String(FIX_TYPE_COUNT)');
    expect(page).not.toContain("{ n: '11', l: 'AI platforms tracked' }");
    expect(page).not.toContain("{ n: '35', l: 'Trust signals mapped' }");
  });

  it('the external claim is attributed', () => {
    expect(page).toContain('800 million weekly active users (OpenAI, October 2025)');
  });

  it('the scan-time claim matches the settled wording', () => {
    expect(page).toContain('About 90 seconds.');
    expect(page).not.toContain('Under 90 seconds');
  });
});
