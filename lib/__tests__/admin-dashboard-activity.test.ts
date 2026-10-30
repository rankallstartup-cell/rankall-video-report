import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b88k: Recent Activity and the Stripe card on /admin/dashboard.
const src = readFileSync(join(process.cwd(), 'app/admin/dashboard/page.tsx'), 'utf8');

describe('admin dashboard — b88k', () => {
  it('selects only real rankall_scans columns', () => {
    expect(src).not.toMatch(/select\('[^']*\bscore\b,/);
    expect(src).toContain("select('business_name, input, overall_score, country_code, industry, created_at')");
  });
  it('a load error is not shown as "No scans yet."', () => {
    expect(src).toContain('recentError');
  });
  it('the Stripe button goes to Stripe, not the QA checklist', () => {
    expect(src).not.toContain('Configure Stripe');
    expect(src).toContain('https://dashboard.stripe.com');
  });
});
