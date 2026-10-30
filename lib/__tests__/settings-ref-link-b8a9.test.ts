import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a9 — /dashboard/settings is a redirect stub to /settings (correct by
// design, ax8r). The one live defect found via its test lives on the
// /settings Referrals tab: the referral link was hardcoded to the
// production domain, so a link copied on staging pointed at prod — the
// same defect b8b3 fixed on /referrals.

const redirect = readFileSync(join(process.cwd(), 'app/dashboard/settings/page.tsx'), 'utf8');
const settings = readFileSync(join(process.cwd(), 'app/settings/page.tsx'), 'utf8');

describe('b8a9 — the redirect stub stays a stub', () => {
  it('redirects to the canonical /settings page', () => {
    expect(redirect).toContain("router.replace('/settings')");
  });
});

describe('b8a9 — settings referral link uses the current origin', () => {
  it('link is built from window.location.origin', () => {
    expect(settings).toContain('window.location.origin');
    expect(settings).toContain('/?ref=${refCode}');
  });

  it('the hardcoded production domain is gone', () => {
    expect(settings).not.toContain('rankall.io/?ref=');
  });

  it('copy writes the link itself (no scheme re-prefix)', () => {
    expect(settings).toContain('navigator.clipboard.writeText(refLink)');
    expect(settings).not.toContain('https://${refLink}');
  });
});
