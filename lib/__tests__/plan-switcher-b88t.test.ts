import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88t — the plan-switcher cards contradicted founder pricing
// and PLAN_LIMITS: Enterprise/Government unpriced, "Local
// Business"/"Personal Brand" names, scan bullets 50/20/500
// against real limits of 200/100/1000, a false "3 platforms
// shown" for Free, and "50 client accounts" against the
// unlimited truth. ($799 Agency + SEO IS canonical — the
// countryConfig US tier price for agencySeo.)

const page = readFileSync(join(process.cwd(), 'app/admin/plan-switcher/page.tsx'), 'utf8');

describe('b88t — plan-switcher cards match the product', () => {
  it('labels carry founder names and prices', () => {
    expect(page).toContain("label: 'Local Pro · $39'");
    expect(page).toContain("label: 'Personal Pro · $15'");
    expect(page).toContain("label: 'Enterprise · $499'");
    expect(page).toContain("label: 'Government · $1,200'");
    expect(page).toContain("label: 'Agency + SEO · $799'");
  });

  it('bullets derive from the real limits', () => {
    expect(page).toContain("'200 local scans/month'");
    expect(page).toContain("'100 personal scans/month'");
    expect(page).toContain("'1,000 scans/month'");
    expect(page).toContain("'All 12 platforms shown'");
    expect(page).not.toContain('3 platforms shown');
    expect(page).not.toContain('50 client accounts');
    expect(page).not.toContain("'50 scans/month'");
    expect(page).not.toContain("'20 scans/month'");
  });

  it('the page explains prices, bundles, and package mapping', () => {
    expect(page).toContain('Local Pro + SEO has no separate bundle price');
    expect(page).toContain('not separate switchable keys');
    expect(page).toContain('Scan limits come from PLAN_LIMITS');
  });
});
