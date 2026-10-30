/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeScanInput,
  isNewTrialLocation,
  isTrialLocationBlocked,
  getEffectivePlanLimit,
  trialCapDecision,
  NON_ALPHANUMERIC_KEY,
  TRIAL_EXPORT_BLOCKED_MESSAGE,
  TRIAL_LOCATION_BLOCKED_MESSAGE,
} from '../trialCaps';

describe('unicode-aware trial location key', () => {
  it('keeps letters of all scripts (no more empty keys for non-Latin names)', () => {
    expect(normalizeScanInput('東京歯科クリニック')).toBe('東京歯科クリニック');
    expect(normalizeScanInput('Зубная Клиника, Москва')).toBe('зубная клиника москва');
    expect(normalizeScanInput('दिल्ली डेंटल')).toBe('दिल्ली डेंटल');
    expect(normalizeScanInput('Café  Müller!')).toBe('café müller');
    // ASCII behaviour unchanged.
    expect(normalizeScanInput('Bright Smile Dental, Dallas TX')).toBe('bright smile dental dallas tx');
  });

  it('a non-Latin second business is a NEW location (was bypassing the 1-location cap)', () => {
    expect(isNewTrialLocation('大阪歯科', ['東京歯科'])).toBe(true);
    expect(isNewTrialLocation('東京歯科', ['東京歯科'])).toBe(false);
  });

  it('punctuation-only input gets its own key, never "no location"', () => {
    expect(normalizeScanInput('!!!')).toBe(NON_ALPHANUMERIC_KEY);
    expect(isNewTrialLocation('???', ['Bright Smile Dental'])).toBe(true);
    expect(normalizeScanInput('   ')).toBe('');
  });
});

describe('isTrialLocationBlocked', () => {
  const admin = (keys: string[] | null) => ({
    from: () => {
      const q: any = {
        select: () => q,
        eq: async () => (keys ? { data: keys.map((k) => ({ business_key: k })), error: null } : { data: null, error: { code: '42P01' } }),
        gte: async () => ({ data: [], error: null }),
      };
      return q;
    },
  });

  it('category scans never count or get blocked', async () => {
    expect(await isTrialLocationBlocked(admin(['bright smile dental']), 'u', 'best dentist austin', false, null)).toBe(false);
  });
  it('a second business is blocked', async () => {
    expect(await isTrialLocationBlocked(admin(['bright smile dental']), 'u', 'Other Dental', true, null)).toBe(true);
    expect(await isTrialLocationBlocked(admin(['bright smile dental']), 'u', 'Bright Smile Dental', true, null)).toBe(false);
  });
});

describe('agency trial scan cap', () => {
  it('a trialing agency gets the 5-scan agency cap on local scans', () => {
    expect(getEffectivePlanLimit('agency', 'local_scan', true)).toBe(5);
    expect(getEffectivePlanLimit('agency', 'local_scan', false)).toBe(1000);
    expect(getEffectivePlanLimit('business', 'local_scan', true)).toBe(25);
  });
});

describe('trial cap messages are honest for card-upfront trials', () => {
  it('never asks a trialing user to add a card', () => {
    for (const m of [TRIAL_EXPORT_BLOCKED_MESSAGE, TRIAL_LOCATION_BLOCKED_MESSAGE]) {
      expect(m).not.toMatch(/add your card/i);
      expect(m).toMatch(/start your paid plan now/i);
    }
  });
  it('cap decision', () => {
    expect(trialCapDecision(2, 3)).toEqual({ allowed: true, remaining: 1 });
    expect(trialCapDecision(3, 3)).toEqual({ allowed: false, remaining: 0 });
    expect(trialCapDecision(0, 0).allowed).toBe(false);
  });
});

// enforceTrialCap with mocks: session user, trialing, over the cap.
const mockState = { user: { id: 'u1' } as any, trialing: true, count: 3 };
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mockState.user } }) } }),
}));
vi.mock('../resolvePlanServer', () => ({
  resolvePlanServer: async () => ({ isTrialing: mockState.trialing, isAdmin: false, email: 'a@b.c' }),
}));
vi.mock('../usageLimits', () => ({ incrementUsage: vi.fn(async () => {}) }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { count: mockState.count }, error: null }) };
      return q;
    },
  }),
}));

describe('enforceTrialCap', () => {
  const req = { cookies: { getAll: () => [] } };
  beforeEach(() => { mockState.user = { id: 'u1' }; mockState.trialing = true; mockState.count = 3; });

  it('blocks a trialing user over the cap with an honest 403', async () => {
    const { enforceTrialCap } = await import('../trialCaps');
    const res = await enforceTrialCap(req, 'report_email');
    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe('trial_cap_reached');
  });
  it('lets non-trialing and anonymous users through', async () => {
    const { enforceTrialCap } = await import('../trialCaps');
    mockState.trialing = false;
    expect(await enforceTrialCap(req, 'report_email')).toBeNull();
    mockState.trialing = true;
    mockState.user = null;
    expect(await enforceTrialCap(req, 'report_email')).toBeNull();
  });
  it('allows and consumes under the cap', async () => {
    const { enforceTrialCap } = await import('../trialCaps');
    const { incrementUsage } = await import('../usageLimits');
    mockState.count = 0;
    expect(await enforceTrialCap(req, 'agency_proposal')).toBeNull();
    expect(incrementUsage).toHaveBeenCalledWith('u1', 'trial_agency_proposal', 'a@b.c');
  });
});
