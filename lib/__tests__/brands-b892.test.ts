import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b892 — /brands: (1) the "See Sample Report" button opened a
// DEMO-request email — a mislabeled control; (2) the challenger
// vignette stated invented specifics ("launched 6 months ago...
// captured AI recommendations in 4 markets") as fact. The H1
// counts and the $999 tier are DERIVED from lib/publicStats
// (MARKETS_COVERED / PLATFORMS_SCANNED / tierPrice) — sourced,
// unchanged.

const page = readFileSync(join(process.cwd(), 'app/brands/BrandsClient.tsx'), 'utf8');

describe('b892 — brands page labels match actions', () => {
  it('the sample-report control requests a sample report', () => {
    expect(page).toContain('Request a Sample Report');
    expect(page).toContain('subject=Sample Report Request');
    expect(page).not.toContain('See Sample Report');
  });

  it('the challenger vignette is labelled a scenario', () => {
    expect(page).toContain('A common scenario: a new competitor launched 6 months ago');
  });

  it('headline numbers stay derived from the canonical stats', () => {
    expect(page).toContain('{MARKETS_COVERED} countries and {PLATFORMS_SCANNED} platforms');
    expect(page).toContain("tierPrice('Global Brand Intelligence')");
  });
});
