import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlanLimit } from '@/lib/planConfig';

// b86m — pricing truth. The ticket's one FAIL was the
// plan-switcher's "Agency + SEO $799": adjudicated in b88t —
// $799 IS the countryConfig US tier price for agencySeo (a
// real bundle price in the product's own pricing table, even
// though the founder 8-package list names no bundles). Its
// remaining observation: /pricing's Personal card claimed
// "50 scans per month" while the enforced limit
// (PLAN_LIMITS.personal_pro.personal_scan, read by
// checkUsageLimit) is 100 — and the switcher said 20. All
// surfaces must state the enforced number.

const pricing = readFileSync(join(process.cwd(), 'app/pricing/PricingClient.tsx'), 'utf8');

describe('b86m — pricing claims match enforcement', () => {
  it('the Personal scan claim equals the enforced limit', () => {
    expect(getPlanLimit('personal_pro', 'personal_scan')).toBe(100);
    expect(pricing).toContain("'100 scans per month'");
    expect(pricing).not.toContain("'50 scans per month'");
  });

  it('the Free claim equals the enforced limit', () => {
    expect(getPlanLimit('free', 'local_scan')).toBe(3);
    expect(pricing).toContain("'3 scans per month'");
  });
});
