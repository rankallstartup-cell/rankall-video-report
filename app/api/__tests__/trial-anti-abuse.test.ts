import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  EMAIL_NOT_VERIFIED_MESSAGE,
  TRIAL_BUSINESS_USED_MESSAGE,
  TRIAL_RATE_LIMIT_MESSAGE,
  RESEND_RATE_LIMIT_MESSAGE,
  TRIAL_CHECKOUT_RATE_LIMIT,
  RESEND_RATE_LIMIT,
} from '@/lib/trialAntiAbuse';

// b28j: trial anti-abuse — verified email before trial start, one trial per
// business, rate limits on trial creation + resend. Enforcement lives in
// the API routes (server-side); the client only shows the messages.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('trial anti-abuse — messages (lib/trialAntiAbuse)', () => {
  it('unverified-email message tells the user what to do (verify / resend)', () => {
    expect(EMAIL_NOT_VERIFIED_MESSAGE).toMatch(/verify your email/i);
    expect(EMAIL_NOT_VERIFIED_MESSAGE).toMatch(/resend/i);
    expect(EMAIL_NOT_VERIFIED_MESSAGE).not.toMatch(/cryptic|error \d+/i);
  });

  it('business-already-used message is honest and offers a path', () => {
    expect(TRIAL_BUSINESS_USED_MESSAGE).toMatch(/already used its free trial/i);
    expect(TRIAL_BUSINESS_USED_MESSAGE).toMatch(/paid plan|support/i);
  });

  it('rate-limit messages are human-readable, never cryptic', () => {
    expect(TRIAL_RATE_LIMIT_MESSAGE).toMatch(/too many/i);
    expect(RESEND_RATE_LIMIT_MESSAGE).toMatch(/too many/i);
  });

  it('checkout rate limit is tight (5/hour per user, 20/hour per IP)', () => {
    expect(TRIAL_CHECKOUT_RATE_LIMIT.perUser.limit).toBe(5);
    expect(TRIAL_CHECKOUT_RATE_LIMIT.perUser.windowMs).toBe(60 * 60 * 1000);
    expect(TRIAL_CHECKOUT_RATE_LIMIT.perIp.limit).toBe(20);
  });

  it('resend rate limit is tight (3/hour per user, 10/hour per IP)', () => {
    expect(RESEND_RATE_LIMIT.perUser.limit).toBe(3);
    expect(RESEND_RATE_LIMIT.perIp.limit).toBe(10);
  });
});

describe('trial anti-abuse — rate limiter custom limits (lib/rateLimit)', () => {
  it('custom limit is enforced per key and does not disturb defaults', () => {
    const key = `b28j-custom-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, null, { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
    expect(checkRateLimit(key, null, { limit: 5, windowMs: 60_000 }).allowed).toBe(false);
    // Same key with the default anon limit (3/24h) is a separate bucket.
    expect(checkRateLimit(key, null).allowed).toBe(true);
  });

  it('custom per-user limit uses its own bucket', () => {
    const uid = `b28j-user-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('1.2.3.4', uid, { limit: 3, windowMs: 60_000 }).allowed).toBe(true);
    }
    expect(checkRateLimit('1.2.3.4', uid, { limit: 3, windowMs: 60_000 }).allowed).toBe(false);
  });
});

describe('trial anti-abuse — create-checkout wiring (source-level)', () => {
  const src = read('app/api/billing/create-checkout/route.ts');

  it('blocks trial start for unverified email with 403 email_not_verified', () => {
    expect(src).toContain('email_confirmed_at');
    expect(src).toContain("error: 'email_not_verified'");
    expect(src).toContain('status: 403');
    expect(src).toContain('resendUrl');
  });

  it('rate-limits checkout creation per user + per IP with 429', () => {
    expect(src).toContain('TRIAL_CHECKOUT_RATE_LIMIT');
    expect(src).toContain("error: 'trial_rate_limited'");
    expect(src).toContain('status: 429');
  });
});

describe('trial anti-abuse — resend-verification route (source-level)', () => {
  const routePath = 'app/api/auth/resend-verification/route.ts';
  it('route file exists', () => {
    expect(existsSync(join(process.cwd(), routePath))).toBe(true);
  });

  it('resends only to the caller\'s own email, is auth-gated, and is rate-limited', () => {
    const src = read(routePath);
    expect(src).toContain('Unauthorized');
    expect(src).toContain("supabase.auth.resend({ type: 'signup', email: user.email })");
    expect(src).toContain('RESEND_RATE_LIMIT');
    expect(src).toContain('alreadyVerified');
    // Never accepts an email from the request body.
    expect(src).not.toMatch(/body.*email|req\.json\(\)/);
  });
});

describe('trial anti-abuse — one trial per business in scan route (source-level)', () => {
  const src = read('app/api/scan/route.ts');

  it('blocks a different trialing account scanning an already-trialed business, before the cache', () => {
    expect(src).toContain('checkTrialBusinessUsed');
    expect(src).toContain("error: 'trial_business_already_used'");
    expect(src).toContain('TRIAL_BUSINESS_USED_MESSAGE');
  });

  it('records trial-business usage after a successful trialing scan', () => {
    expect(src).toContain('recordTrialBusinessUsage');
  });

  // Updated (fix round 2, item 3): the old check keyed on the CLIENT's
  // isBusinessName flag, so a client sending false skipped the cap. The
  // decision is now the server classifier (trialScanCountsAsLocation).
  it('only business scans consume a business trial — decided server-side, never by the body flag', () => {
    // Round 3: a body isBusinessName=true may only make a scan COUNT (restrictive direction).
    expect(src).toContain('const trialLocationScan = userIsTrialing && trialScanCountsAsLocation(input, { resolvesToBusiness: body.isBusinessName === true || hasGibberishToken });');
    expect(src).toContain('if (userId && trialLocationScan) {');
    expect(src).not.toContain('userIsTrialing && isBusinessName');
    expect(src).not.toMatch(/isTrialLocationBlocked\([^)]*isBusinessName/);
  });
});

describe('trial anti-abuse — pricing client handles the blocks (source-level)', () => {
  const src = read('app/pricing/PricingClient.tsx');

  it('shows the unverified-email message + a resend button, never a dead end', () => {
    expect(src).toContain("data?.error === 'email_not_verified'");
    expect(src).toContain('Resend verification email');
    expect(src).toContain('/api/auth/resend-verification');
  });

  it('shows the rate-limit message for 429', () => {
    expect(src).toContain('res.status === 429');
  });
});

describe('trial anti-abuse — migration (source-level)', () => {
  const migPath = 'supabase/migrations/20261016000100_b28j_trial_business_usage.sql';
  it('migration file exists and creates the usage table with RLS, no permissive policies', () => {
    expect(existsSync(join(process.cwd(), migPath))).toBe(true);
    const sql = read(migPath);
    expect(sql).toContain('create table if not exists public.trial_business_usage');
    expect(sql).toContain('business_key text primary key');
    expect(sql).toContain('enable row level security');
    // No permissive policy: only the service-role key touches this table.
    expect(sql).not.toMatch(/create policy/i);
  });
});
