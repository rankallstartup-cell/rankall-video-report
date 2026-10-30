import { describe, it, expect } from 'vitest';
import { isAuthRequiredPath, loginRedirectPath, safeNextPath } from '../safeRedirect';

const O = 'https://www.rankall.io';

describe('safeNextPath — open-redirect vectors', () => {
  // Each value is what searchParams.get('next') returns (already decoded once).
  it.each([
    ['/\\evil.com'],
    ['/\\/evil.com'],
    ['//evil.com'],
    ['/\t/evil.com'],          // ?next=/%09/evil.com
    ['/\n/evil.com'],          // ?next=/%0a/evil.com
    ['/\r/evil.com'],
    ['/%09/evil.com'],         // double-encoded
    ['/%0a/evil.com'],
    ['/%5cevil.com'],          // encoded backslash
    ['/%2f/evil.com'],         // encoded slash → //evil.com after decode
    ['https:evil.com'],
    ['https://evil.com'],
    ['/.//evil.com'],
    ['/./\u0000/evil.com'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,x'],
    ['evil.com'],
    [''],
    ['/%E0%A4%A'],             // malformed escape
  ])('rejects %j', (next) => {
    expect(safeNextPath(next, O)).toBe('/dashboard');
  });

  it.each([
    ['/dashboard', '/dashboard'],
    ['/reset-password', '/reset-password'],
    ['/report/abc?x=1#top', '/report/abc?x=1#top'],
    ['/a/../settings', '/settings'],
  ])('allows %j', (next, out) => {
    expect(safeNextPath(next, O)).toBe(out);
  });

  it('resolving the result against the origin never leaves the origin', () => {
    for (const v of ['/\t/evil.com', '/.//evil.com', '//evil.com', '/dashboard']) {
      expect(new URL(safeNextPath(v, O), O).origin).toBe(O);
    }
  });
});

import { isRecoveryGatedPath } from '../safeRedirect';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('password recovery gate', () => {
  it('gates app pages, not the reset page or APIs', () => {
    expect(isRecoveryGatedPath('/dashboard')).toBe(true);
    expect(isRecoveryGatedPath('/dashboard/billing')).toBe(true);
    expect(isRecoveryGatedPath('/settings')).toBe(true);
    expect(isRecoveryGatedPath('/reset-password')).toBe(false);
    expect(isRecoveryGatedPath('/reset-password/state')).toBe(false);
    expect(isRecoveryGatedPath('/api/scan')).toBe(false);
    expect(isRecoveryGatedPath('/dashboards-marketing')).toBe(false);
  });

  it('callback surfaces exchange errors and arms the gate for recovery', () => {
    const cb = readFileSync(join(process.cwd(), 'app/auth/callback/route.ts'), 'utf8');
    expect(cb).toContain('exchangeError');
    expect(cb).toContain("new URL('/login', requestUrl.origin)");
    expect(cb).toContain("'rk_pw_recovery'");
    expect(cb).toContain('safeNextPath(');
    expect(cb).not.toMatch(/startTrialForUser\(|from '@\/lib\/trial'/);
  });

  it('proxy redirects a recovering session to /reset-password; page clears it after update', () => {
    const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
    expect(proxy).toContain("request.cookies.get('rk_pw_recovery')");
    const page = readFileSync(join(process.cwd(), 'app/reset-password/page.tsx'), 'utf8');
    expect(page).toContain("setRecoveryGate('done')");
    expect(page).toContain('otp_expired');
  });
});


describe('sign-in gate — b89g / b8ae', () => {
  it('requires sign-in for app pages', () => {
    for (const p of ['/dashboard', '/dashboard/billing', '/dashboard/usage', '/dashboard/url-intelligence', '/settings', '/admin/dashboard', '/agency/dashboard']) {
      expect(isAuthRequiredPath(p)).toBe(true);
    }
  });
  it('leaves public pages open', () => {
    for (const p of ['/', '/pricing', '/agency', '/login', '/dashboardx', '/report/abc', '/settingsx']) {
      expect(isAuthRequiredPath(p)).toBe(false);
    }
  });
  it('sends the visitor back to the page they asked for', () => {
    expect(loginRedirectPath('/dashboard/billing', '?tab=invoices')).toBe('/login?next=%2Fdashboard%2Fbilling%3Ftab%3Dinvoices');
    expect(loginRedirectPath('/dashboard')).toBe('/login?next=%2Fdashboard');
  });
  it('proxy uses the gate before rendering', () => {
    const src = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
    expect(src).toContain('isAuthRequiredPath(url.pathname)');
  });
});
