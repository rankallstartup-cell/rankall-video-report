import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetAllocation } from '../../app/dashboard/spend-intelligence/page';
import { planMonthlyPrice } from '../planPrice';
import { getCountryConfig } from '../countryConfig';

// b8ac — /dashboard/spend-intelligence honesty fixes. The page hid
// overspend ("$0 unallocated" at 110% allocated), priced AI Organic off
// the admin-upgraded plan, showed the AI score with no scan named, had
// no empty state, rendered the full calculator shell logged-out, and
// labelled nothing as estimated.

describe('b8ac — budget allocation names overspend instead of clamping it', () => {
  it('Ads 2500 + SEO 800 vs total 3000 shows $300 over budget, not $0 unallocated', () => {
    const a = budgetAllocation(2500, 800, 3000);
    expect(a.allocated).toBe(3300);
    expect(a.overBudget).toBe(300);
    expect(a.unallocated).toBe(0);
    expect(a.allocatedPct).toBe(110);
  });

  it('normal allocation still shows unallocated', () => {
    const a = budgetAllocation(1500, 800, 3000);
    expect(a.allocated).toBe(2300);
    expect(a.overBudget).toBe(-700);
    expect(a.unallocated).toBe(700);
    expect(a.allocatedPct).toBe(77);
  });
});

describe('b8ac — planMonthlyPrice covers enterprise + government', () => {
  const us = getCountryConfig('US');

  it('enterprise resolves to the $499 founder price', () => {
    expect(planMonthlyPrice('enterprise', us)).toEqual({ monthly: 499, exactPlanPrice: true });
  });

  it('government resolves to the $1,200 founder price', () => {
    expect(planMonthlyPrice('government', us)).toEqual({ monthly: 1200, exactPlanPrice: true });
  });

  it('free still falls back to Local Pro pricing, labelled as such', () => {
    expect(planMonthlyPrice('free', us)).toEqual({ monthly: 39, exactPlanPrice: false });
  });
});

describe('b8ac — spend-intelligence page: gate, provenance, empty state, labels', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/spend-intelligence/page.tsx'), 'utf8');

  it('logged-out visitors get a sign-in gate, not the calculator shell', () => {
    expect(src).toContain('Sign in to use Spend Intelligence.');
    expect(src).toContain('/login?next=/dashboard/spend-intelligence');
    expect(src).not.toContain('Showing a sample score of 0 below');
  });

  it('AI price uses the real plan (rawPlan), never the admin-upgraded plan', () => {
    expect(src).toContain('planMonthlyPrice(rawPlan, country)');
    expect(src).not.toContain('planMonthlyPrice(plan, country)');
  });

  it('AI score is sourced to the scan (business input + date)', () => {
    expect(src).toContain('from your scan');
    expect(src).toContain('scanInput');
  });

  it('signed-in users with no scan get an honest empty state, not 0/100', () => {
    expect(src).toContain('No scan yet');
  });

  it('avg customer value is labelled an estimate from Rankall defaults', () => {
    expect(src).toContain('Avg customer value (est.)');
    expect(src).toContain('an assumption, not a measured value');
  });

  it('spend inputs are labelled estimates with defaults', () => {
    expect(src).toContain('Your estimates');
  });

  it('overspend is named instead of hidden behind the clamp', () => {
    expect(src).toContain('overBudget > 0');
    expect(src).toContain('over budget');
  });
});
