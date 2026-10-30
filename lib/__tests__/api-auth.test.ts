import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canAccessScan, userOwnsScan, hasBearerSecret, safeEqual } from '../apiAuth';
import { checkOAuthState, issueOAuthState } from '../oauthState';

const me = { id: 'u1', email: 'me@example.com' };
const admin = { id: 'a1', email: 'nandish@rankall.io' };

describe('canAccessScan (ownership)', () => {
  it('owner may access', () => expect(canAccessScan({ user_id: 'u1' }, me)).toBe(true));
  it('another user may not', () => expect(canAccessScan({ user_id: 'u2' }, me)).toBe(false));
  it('ownerless scans are NOT owned by whoever is logged in', () => expect(canAccessScan({ user_id: null }, me)).toBe(false));
  it('admin may access any scan', () => {
    expect(canAccessScan({ user_id: 'u2' }, admin)).toBe(true);
    expect(canAccessScan({ user_id: null }, admin)).toBe(true);
  });
  it('no user / no scan → false', () => {
    expect(canAccessScan({ user_id: 'u1' }, null)).toBe(false);
    expect(canAccessScan(null, me)).toBe(false);
  });
});

function fakeSb(result: { data?: unknown; error?: unknown } | Error) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { if (result instanceof Error) throw result; return result; },
        }),
      }),
    }),
  };
}

describe('userOwnsScan', () => {
  it('true for the owner', async () => expect(await userOwnsScan(fakeSb({ data: { user_id: 'u1' } }), 's1', me)).toBe(true));
  it('false for another owner', async () => expect(await userOwnsScan(fakeSb({ data: { user_id: 'u2' } }), 's1', me)).toBe(false));
  it('fails closed on DB error / throw / missing id', async () => {
    expect(await userOwnsScan(fakeSb({ error: { message: 'x' } }), 's1', me)).toBe(false);
    expect(await userOwnsScan(fakeSb(new Error('boom')), 's1', me)).toBe(false);
    expect(await userOwnsScan(fakeSb({ data: { user_id: 'u1' } }), '', me)).toBe(false);
  });
});

describe('hasBearerSecret — fail closed', () => {
  const req = (h?: string) => new Request('http://x', { headers: h ? { authorization: h } : {} });
  it('unset secret rejects even "Bearer undefined"', () => {
    expect(hasBearerSecret(req('Bearer undefined'), undefined)).toBe(false);
    expect(hasBearerSecret(req('Bearer '), '')).toBe(false);
  });
  it('matches only the exact secret', () => {
    expect(hasBearerSecret(req('Bearer s3cret'), 's3cret')).toBe(true);
    expect(hasBearerSecret(req('Bearer s3cre'), 's3cret')).toBe(false);
    expect(hasBearerSecret(req(), 's3cret')).toBe(false);
  });
  it('safeEqual handles length mismatch and empties', () => {
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('OAuth state (CSRF)', () => {
  it('accepts only the issued nonce for the same kind', () => {
    const { state, nonce } = issueOAuthState('ga4');
    expect(checkOAuthState('ga4', state, nonce)).toBe(true);
    expect(checkOAuthState('gbp', state, nonce)).toBe(false);
    expect(checkOAuthState('ga4', 'ga4', nonce)).toBe(false); // old static state
    expect(checkOAuthState('ga4', state, null)).toBe(false);
    expect(checkOAuthState('ga4', state, 'other')).toBe(false);
  });
});

describe('IDOR source checks — routes derive the user from the session', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  it.each([
    'app/api/inbox/search/route.ts', 'app/api/inbox/check/route.ts', 'app/api/competitor-scan/route.ts',
    'app/api/scan-personal/route.ts', 'app/api/user/mark-discount-used/route.ts', 'app/api/welcome-email/route.ts',
    'app/api/send-report-email/route.ts', 'app/api/url-intelligence/email/route.ts', 'app/api/gap-narrative/route.ts',
    'app/api/update-business-name/route.ts',
  ])('%s uses getSessionUser', (f) => expect(read(f)).toContain('getSessionUser'));

  it.each([
    'app/api/integrations/google-analytics/route.ts', 'app/api/integrations/google-business-profile/route.ts',
  ])('%s never takes user_id from the query', (f) => {
    const s = read(f);
    expect(s).not.toMatch(/=\s*searchParams\.get\('user_id'\)/);
    expect(s).toContain('const userId = user.id;');
    expect(s).toContain('checkOAuthState');
  });
  it('GSC callback no longer uses state as the user id', () => {
    const s = read('app/api/integrations/google-search-console/route.ts');
    expect(s).not.toContain("searchParams.get('state') || user");
    expect(s).toContain('checkOAuthState');
  });
  it('whatsapp + sms require admin session or cron bearer; no hardcoded secret', () => {
    for (const f of ['app/api/outreach/send-whatsapp/route.ts', 'app/api/outreach/send-sms/route.ts']) {
      const s = read(f);
      expect(s).toContain('isCronRequest');
      expect(s).toContain('getAdminUser');
      expect(s).not.toContain('rankall-cron-2026-secure');
    }
  });
});

