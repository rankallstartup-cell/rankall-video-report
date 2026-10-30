import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b897 — the sample city scores (67/43/28, "MOCK_SCORES" in code)
// carried a SAMPLE label but no provenance: no city, source, date,
// or count, and they could not be checked against the site's own
// minimum-sample rules. The request form also used a realistic
// fake persona (Jane Smith, Nashville) as placeholders.

const page = readFileSync(join(process.cwd(), 'app/city-intelligence/CityIntelligenceClient.tsx'), 'utf8');

describe('b897 — city intelligence honesty', () => {
  it('the sample scores are labelled illustrative with the real methodology', () => {
    expect(page).toContain('Illustrative example only — these figures are not measured from a real city.');
    expect(page).toContain('at least 5 businesses scanned');
  });

  it('form placeholders are generic, not a fake persona', () => {
    expect(page).not.toContain('Jane Smith');
    expect(page).not.toContain('Nashville');
    expect(page).toContain('Your full name');
    expect(page).toContain('you@yourcity.gov');
  });
});
