import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlanMeta } from '@/lib/planConfig';

// b881 (logged-in journey) — upsell copy named nothing: the
// sidebar plan card's "price" slot for Free literally read
// "Upgrade to unlock" (beside the score it simultaneously
// displayed), the Overview banner said "unlock all features",
// and getPlanMeta priced Enterprise as "Custom" against the
// founder $499.

describe('b881 — plan meta and upsell copy say what is locked', () => {
  it('plan meta carries real prices', () => {
    expect(getPlanMeta('free').price).toBe('$0 — 3 scans/month');
    expect(getPlanMeta('enterprise').price).toBe('$499/month');
    expect(getPlanMeta('business').price).toBe('$39/month');
    expect(getPlanMeta('agency').price).toBe('$259/month');
  });

  it('the Overview Free banner names the locked features', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(page).toContain('Upgrade to unlock competitor intelligence, report exports, and AI Inbox.');
    expect(page).not.toContain('Upgrade to unlock all features.');
  });
});
