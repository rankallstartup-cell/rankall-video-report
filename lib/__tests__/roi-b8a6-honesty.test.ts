import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a6 — /dashboard/roi honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/roi/page.tsx'), 'utf8');

describe('b8a6 — gate', () => {
  it('signed-out visitors get a sign-in gate, not the full calculator', () => {
    expect(page).toContain('Sign in to use the ROI Calculator');
    expect(page).toContain('/login?next=/dashboard/roi');
    expect(page).toContain('if (!signedIn)');
  });
});

describe('b8a6 — attribution and defaults', () => {
  it('the seed scan is recorded and named in the score field hint', () => {
    expect(page).toContain('scanMeta');
    expect(page).toContain('Pre-filled from your latest scan:');
    expect(page).toContain('user_business_name');
  });

  it('no-scan state does not claim a prefill', () => {
    expect(page).toContain('No scan yet — run a scan to pre-fill your measured score');
  });

  it('transaction value starts from the country default (the report model default)', () => {
    expect(page).toContain('String(getCountryConfig(\'US\').avgCustomerValue)');
    expect(page).not.toContain("useState<string>('150')");
  });

  it('defaults and the +30 target are labelled as starting points', () => {
    expect(page).toContain('Starting default');
    expect(page).toContain('current score + 30');
    expect(page).toContain('not a projection');
  });
});

describe('b8a6 — net ROI, and the model difference is disclosed', () => {
  it('ROI subtracts the cost (net), with the gross figure shown as gross', () => {
    expect(page).toContain('((addlAnnual - ANNUAL_COST) / ANNUAL_COST) * 100');
    expect(page).toContain('Net ROI on Rankall');
    expect(page).toContain('gross revenue gain');
  });

  it('the 30% factor is labelled an assumption', () => {
    expect(page).toContain('calculator&apos;s assumption');
  });

  it('the difference from the report model is explained on the page', () => {
    expect(page).toContain('Why this differs from your scan report');
    expect(page).toContain('10% conversion');
  });
});
