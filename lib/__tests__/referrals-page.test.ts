// b8b3 — /referrals: canonical code, environment origin, always-on
// history section, signup href, honest copy confirmation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateReferralCode, getReferralLink } from '@/lib/referralCode';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/referrals page (b8b3)', () => {
  it('uses the canonical UPPERCASE referral code', () => {
    expect(generateReferralCode('36ab6e3f-3767-4745-bb11-37e244ed6e94')).toBe('36AB6E3F');
    expect(getReferralLink('36ab6e3f-3767-4745-bb11-37e244ed6e94')).toBe('https://rankall.io/?ref=36AB6E3F');
    const page = read('app/referrals/page.tsx');
    expect(page).toContain('generateReferralCode(user.id)');
    expect(page).not.toContain('user.id.slice(0, 8)');
    expect(page).not.toContain('https://rankall.io/?ref=${refCode}');
  });

  it('builds the link from the current origin, not hardcoded prod', () => {
    const page = read('app/referrals/page.tsx');
    expect(page).toContain('window.location.origin');
    // Origin inlined (no intermediate origin variable) — the same
    // window.location.origin form the b889 test accepts.
    expect(page).toContain('`${window.location.origin}/?ref=${refCode}`');
  });

  it('always renders the referrals history section with an honest empty state', () => {
    const page = read('app/referrals/page.tsx');
    expect(page).toContain('No referrals yet');
    expect(page).not.toContain('{conversions.length > 0 && (');
  });

  it('signed-out "Sign up to get your link" goes to /signup, not /login', () => {
    const page = read('app/referrals/page.tsx');
    expect(page).toContain('href="/signup"');
    expect(page).toContain('Sign up to get your link');
  });

  it('Copy Link only claims success when the write succeeds', () => {
    // async/await shape, not a .then chain: setCopied(true) runs only
    // after the awaited write resolves; a failed write sets copyError.
    const page = read('app/referrals/page.tsx');
    expect(page).toContain('await navigator.clipboard.writeText(refLink)');
    expect(page).toContain('setCopied(true)');
    expect(page).toContain("Couldn't copy automatically");
    const writeIdx = page.indexOf('await navigator.clipboard.writeText(refLink)');
    const copiedIdx = page.indexOf('setCopied(true)', writeIdx);
    expect(copiedIdx).toBeGreaterThan(writeIdx);
  });
});
