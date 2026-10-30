import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a2 — /dashboard/platforms honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/platforms/page.tsx'), 'utf8');
const badge = readFileSync(join(process.cwd(), 'components/PlatformBadge.tsx'), 'utf8');
const switcher = readFileSync(join(process.cwd(), 'app/admin/plan-switcher/page.tsx'), 'utf8');

describe('b8a2 — attribution and gate', () => {
  it('header names the business, query and scan date', () => {
    expect(page).toContain('Results for');
    expect(page).toContain('scanMeta');
    expect(page).toContain('user_business_name');
  });

  it('signed-out visitors get a sign-in gate', () => {
    expect(page).toContain('Sign in to view your platform results');
    expect(page).toContain('/login?next=/dashboard/platforms');
  });
});

describe('b8a2 — three honest platform states', () => {
  it('summary splits not-mentioned from no-response', () => {
    expect(page).toContain('notMentionedCount');
    expect(page).toContain('noResponseCount');
    expect(page).toContain("'No response'");
    expect(page).not.toContain("'Not appearing'");
  });

  it('badge supports the No response state via a responded prop', () => {
    expect(badge).toContain('responded?: boolean');
    expect(badge).toContain("noResponse ? 'No response'");
    expect(page).toContain('responded={responded}');
  });

  it('a non-response is not rendered as a quote', () => {
    expect(page).toContain('No response recorded from this platform in this scan.');
  });

  it('weights render as scoring-weight percentages', () => {
    expect(page).toContain('Scoring weight:');
    expect(page).toContain('Math.round(r.weight * 100)');
  });
});

describe('b8a2 — plan-switcher Free bullets match reality', () => {
  it('Free shows all 12 platforms (no 3-platform limit exists)', () => {
    expect(switcher).toContain('All 12 platforms shown');
    expect(switcher).not.toContain("'3 platforms shown'");
  });
});
