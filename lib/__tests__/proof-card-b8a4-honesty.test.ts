import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a4 — /dashboard/proof-card honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/proof-card/page.tsx'), 'utf8');

describe('b8a4 — session handling', () => {
  it('no session resolves loading and shows a sign-in gate', () => {
    expect(page).toContain('if (!session) { setLoading(false); return; }');
    expect(page).toContain('Sign in to view your proof card');
    expect(page).toContain('/login?next=/dashboard/proof-card');
  });
});

describe('b8a4 — proof stats come only from the verified outcome', () => {
  it('stats render only when an outcome is selected, in /100 units', () => {
    expect(page).toContain('{selectedOutcome && (');
    expect(page).toContain('selectedOutcome.score_before');
    expect(page).toContain('/100');
    expect(page).toContain('Days to improvement');
  });

  it('the first/last history pairing is gone', () => {
    expect(page).not.toContain('first.overall_score');
    expect(page).not.toContain('Days Tracked');
    expect(page).not.toContain('daysBetween');
    expect(page).not.toContain("Your score hasn't changed yet between scans");
  });

  it('stats are attributed to the outcome business + verified date', () => {
    expect(page).toContain('Verified improvement for');
    expect(page).toContain('selectedOutcome.business_name');
  });
});
