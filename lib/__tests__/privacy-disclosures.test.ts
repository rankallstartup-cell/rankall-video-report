// b8b1 — /privacy disclosure gaps: Vercel + PostHog named, CCPA named,
// cookie wording reconciled, contact split explained. The _pk_* (Matomo)
// cookie row is gone — no Matomo code exists in the repo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/privacy disclosures (b8b1)', () => {
  it('names Vercel (hosting) and PostHog (analytics) as processors', () => {
    const page = read('app/privacy/page.tsx');
    expect(page).toContain('Vercel');
    expect(page).toContain('Hosting');
    expect(page).toContain('PostHog');
  });

  it('names CCPA and its rights (know / delete / correct / opt out of sale)', () => {
    const page = read('app/privacy/page.tsx');
    expect(page).toContain('CCPA');
    expect(page).toContain('opt out of any sale');
    expect(page).toContain('will not discriminate');
  });

  it('explains the privacy@ vs hello@ contact split', () => {
    const page = read('app/privacy/page.tsx');
    expect(page).toContain('privacy@rankall.io');
    expect(page).toContain('hello@rankall.io');
    expect(page).toContain('For general questions');
  });

  it('cookie wording is reconciled: no marketing cookies set, no phantom Matomo', () => {
    const cookie = read('app/cookie-policy/page.tsx');
    expect(cookie).not.toContain('_pk_*');
    expect(cookie).not.toContain('only set if you opt in');
    expect(cookie).toContain('we do not currently set any');
    // Wording reconciled but ordered differently: "Analytics cookies …
    // via PostHog, our product analytics".
    expect(cookie).toContain('Analytics cookies');
    expect(cookie).toContain('via PostHog');
    const privacy = read('app/privacy/page.tsx');
    expect(privacy).toContain('We do not use third-party advertising cookies');
  });

  it('both legal pages carry the new last-updated date', () => {
    // Each page carries its own date: the cookie page was legitimately
    // re-edited a day later, so one pinned date for both breaks on any
    // separate update. Assert each page's own date + a date pattern.
    const privacy = read('app/privacy/page.tsx');
    const cookie = read('app/cookie-policy/page.tsx');
    expect(privacy).toContain('Last updated: October 19, 2026');
    expect(cookie).toContain('Last updated: October 20, 2026');
    expect(privacy).toMatch(/Last updated: [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(cookie).toMatch(/Last updated: [A-Z][a-z]+ \d{1,2}, \d{4}/);
  });
});
