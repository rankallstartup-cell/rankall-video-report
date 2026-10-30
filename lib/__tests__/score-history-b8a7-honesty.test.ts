import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a7 — /dashboard/score-history honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/score-history/page.tsx'), 'utf8');

describe('b8a7 — gates and states', () => {
  it('signed-out visitors get a sign-in gate, not the empty state', () => {
    expect(page).toContain('Sign in to view your score history');
    expect(page).toContain('/login?next=/dashboard/score-history');
  });

  it('the no-scan empty state remains for signed-in users', () => {
    expect(page).toContain('No score history yet');
    expect(page).toContain('Run your first scan to start tracking your AI visibility score over time.');
  });
});

describe('b8a7 — grouping is by business + query set, not raw query string', () => {
  it('groups key on user_business_name + basket_hash', () => {
    expect(page).toContain('user_business_name');
    expect(page).toContain('basket_hash');
  });

  it('selector options label the business', () => {
    expect(page).toContain('coreBusinessName');
    expect(page).toContain('businessName');
  });

  it('the heading names the selected business', () => {
    expect(page).toContain('currentGroup');
    expect(page).toContain('Scans for');
  });
});

describe('b8a7 — stats are honestly scoped', () => {
  it('all-time best is computed across ALL scans in the fallback path', () => {
    expect(page).toContain('Math.max(...list.map((r: any) => r.overall_score ?? 0))');
  });

  it('days tracking counts distinct displayed days', () => {
    expect(page).toContain('new Set(scans.map(s => fmtDate(s.created_at))).size');
  });

  it('the chart annotation is labelled as the biggest jump', () => {
    expect(page).toContain('Biggest jump +{bestJump} pts');
  });
});
