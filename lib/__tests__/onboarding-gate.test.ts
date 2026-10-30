// b8aw — /onboarding: sign-in gate, already-onboarded done state,
// pre-fill labeling, load-failure message.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/onboarding gating + pre-fill honesty (b8aw)', () => {
  it('redirects logged-out visitors to login instead of showing Step 1', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain("router.push('/login?next=/onboarding')");
    expect(page).toContain('checkingAuth');
    expect(page).toContain('Loading…');
  });

  it('shows a done state for already-onboarded accounts, with an edit path', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain("You&apos;re already set up");
    expect(page).toContain('You completed onboarding. Your business details are saved.');
    expect(page).toContain('Edit your business details');
    expect(page).toContain('Go to Dashboard');
    expect(page).toContain('if (alreadyOnboarded && !editingDetails)');
  });

  it('labels pre-filled fields with their source', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain('Pre-filled from your account — edit any field that is out of date.');
    expect(page).toContain('{prefilled && (');
  });

  it('shows an honest message when the account load fails', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain('We could not load your account details. You can still continue');
  });

  it('still keys the trial-start backstop off the onboarded flag, not scans', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain("if (!m?.onboarded) {");
    expect(page).toContain("fetch('/api/trial/start'");
  });
});
