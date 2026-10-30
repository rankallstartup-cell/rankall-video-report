import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b899 — the standalone Cookie Policy still described the OLD
// analytics: a Matomo "_pk_*" row (the app loads PostHog —
// lib/posthog.ts + PostHogProvider; no Matomo exists in code) and
// "marketing cookies — only set if you opt in", promising an
// opt-in mechanism that does not exist. b8b1 reconciled the same
// facts on the Privacy page; this page now agrees with it.

const page = readFileSync(join(process.cwd(), 'app/cookie-policy/page.tsx'), 'utf8');

describe('b899 — cookie policy matches the code', () => {
  it('names the real analytics provider and its cookies', () => {
    expect(page).toContain('ph_* (analytics)');
    expect(page).toContain('Aggregate usage analytics (PostHog)');
    expect(page).not.toContain('_pk_*');
    expect(page).toContain('via PostHog, our product analytics');
  });

  it('marketing cookies: none are set — no phantom opt-in', () => {
    expect(page).toContain('we do not currently set any marketing cookies');
    expect(page).not.toContain('only set if you opt in');
  });

  it('third parties include the analytics processor', () => {
    expect(page).toContain('and PostHog for product analytics');
  });
});
