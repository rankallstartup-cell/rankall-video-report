import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b889 (E2E journey) — the referral link differed by surface:
// /referrals showed https://rankall.io/?ref=<lowercase uuid
// slice> (hardcoded production domain, non-canonical code) while
// /settings showed rankall.io/?ref=<UPPERCASE canonical> with no
// scheme. One code, one format: generateReferralCode on the
// current origin, everywhere. (Same fix as the b8b3 branch,
// applied to HEAD for the journey.)

const referrals = readFileSync(join(process.cwd(), 'app/referrals/page.tsx'), 'utf8');
const settings = readFileSync(join(process.cwd(), 'app/settings/page.tsx'), 'utf8');

describe('b889 — one referral link format', () => {
  it('/referrals uses the canonical code on the current origin', () => {
    expect(referrals).toContain('generateReferralCode(user.id)');
    expect(referrals).toContain('${window.location.origin}/?ref=${refCode}');
    expect(referrals).not.toContain('https://rankall.io/?ref=');
    expect(referrals).not.toContain('user.id.slice(0, 8)');
  });

  it('/settings uses the same origin-based link', () => {
    // SSR-safe form of the same origin-based link (window guarded):
    // `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${refCode}`.
    expect(settings).toMatch(/window\.location\.origin.*\/\?ref=\$\{refCode\}/);
    expect(settings).not.toContain('`rankall.io/?ref=${refCode}`');
  });
});
