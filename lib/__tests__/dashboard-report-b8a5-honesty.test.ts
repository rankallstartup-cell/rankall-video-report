import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a5 — /dashboard/report honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/report/page.tsx'), 'utf8');

describe('b8a5 — attribution', () => {
  it('the header names the business and the latest-scan scope', () => {
    expect(page).toContain('Report for');
    expect(page).toContain('coreBusinessName(scan.user_business_name || scan.input)');
    expect(page).toContain('your latest scan');
    expect(page).toContain('/dashboard/score-history');
  });

  it('the scan select fetches the business name', () => {
    expect(page).toContain('user_business_name');
  });
});

describe('b8a5 — gates and states', () => {
  it('signed-out visitors get a sign-in gate before the empty state', () => {
    expect(page).toContain('Sign in to view your report');
    expect(page).toContain('/login?next=/dashboard/report');
    expect(page.indexOf('Sign in to view your report')).toBeLessThan(page.indexOf('No scans yet.'));
  });
});

describe('b8a5 — platform status and labels', () => {
  it('non-responders are "No response", not "Not mentioned"', () => {
    expect(page).toContain("'No response'");
    expect(page).toContain('const responded = !!text');
  });

  it('score weighting is not mislabelled as market share', () => {
    expect(page).not.toContain('Weighted by market share');
    expect(page).toContain("Weighted by Rankall\\'s platform scoring weights");
  });

  it('platform count pluralizes correctly', () => {
    expect(page).toContain("mentionedCount === 1 ? '' : 's'");
  });

  it('Google AI has platform metadata', () => {
    expect(page).toContain("'Google AI':");
  });
});
