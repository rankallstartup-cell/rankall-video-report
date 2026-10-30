import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  getEffectivePlanLimit,
  normalizeScanInput,
  isNewTrialLocation,
  isTrialingStatus,
  TRIAL_LIMITS,
  TRIAL_MAX_LOCATIONS,
  TRIAL_EXPORT_BLOCKED_MESSAGE,
  TRIAL_WHITELABEL_BLOCKED_MESSAGE,
  TRIAL_LOCATION_BLOCKED_MESSAGE,
} from '@/lib/trialCaps';
import { checkUsageLimit } from '@/lib/usageLimits';

// b28g: trial caps are the anti-copying protection. A trialing account gets
// 1 location, capped scans, and NO exports / white-label. Enforcement lives
// in the API routes (server-side); the client only hides gated UI.

describe('trial caps — effective limits (lib/trialCaps)', () => {
  it('trialing business plan: report_export is 0 (blocked, not unlimited)', () => {
    expect(getEffectivePlanLimit('business', 'report_export', true)).toBe(0);
  });

  it('trialing business plan: local_scan capped to the trial cap, not the 200/mo paid cap', () => {
    expect(TRIAL_LIMITS.local_scan).toBe(25);
    expect(getEffectivePlanLimit('business', 'local_scan', true)).toBe(25);
  });

  it('non-trialing business plan keeps the full paid limits', () => {
    expect(getEffectivePlanLimit('business', 'local_scan', false)).toBe(200);
    expect(getEffectivePlanLimit('business', 'report_export', false)).toBeGreaterThan(99999);
  });

  it('trialing enterprise plan is capped too (trial cap beats unlimited)', () => {
    expect(getEffectivePlanLimit('enterprise', 'local_scan', true)).toBe(25);
    expect(getEffectivePlanLimit('enterprise', 'report_export', true)).toBe(0);
  });

  it('features without a trial cap keep the plan limit during trial', () => {
    // No trial cap defined for this key -> paid limit applies.
    expect(getEffectivePlanLimit('business', 'nonexistent_feature', true)).toBe(0);
  });

  it('1 location max during trial', () => {
    expect(TRIAL_MAX_LOCATIONS).toBe(1);
  });
});

describe('trial caps — input normalization (1-location comparison)', () => {
  it('case, punctuation, and whitespace do not create a second location', () => {
    expect(normalizeScanInput('Bright Smile Dental, Dallas TX')).toBe('bright smile dental dallas tx');
    expect(normalizeScanInput('  Bright   Smile Dental Dallas TX ')).toBe('bright smile dental dallas tx');
    expect(normalizeScanInput("Bright Smile Dental — Dallas")).toBe('bright smile dental dallas');
  });
});

describe('trial caps — 1-location check', () => {
  it('same business (normalized) is not a new location', () => {
    expect(isNewTrialLocation('Bright Smile Dental, Dallas TX', ['bright smile dental dallas tx'])).toBe(false);
  });

  it('first scan during trial is not a new-location violation', () => {
    expect(isNewTrialLocation('Bright Smile Dental Dallas TX', [])).toBe(false);
  });

  it('a second distinct business during trial IS a violation', () => {
    expect(isNewTrialLocation('Second Dental Clinic Austin TX', ['Bright Smile Dental Dallas TX'])).toBe(true);
  });

  it('empty input never counts as a new location', () => {
    expect(isNewTrialLocation('   ', ['Bright Smile Dental Dallas TX'])).toBe(false);
  });
});

describe('trial caps — trialing status', () => {
  it('only "trialing" counts as trialing', () => {
    expect(isTrialingStatus('trialing')).toBe(true);
    expect(isTrialingStatus('active')).toBe(false);
    expect(isTrialingStatus('past_due')).toBe(false);
    expect(isTrialingStatus(null)).toBe(false);
    expect(isTrialingStatus(undefined)).toBe(false);
  });
});

describe('trial caps — blocked-action messages are honest upgrade messages', () => {
  it('export message says exports unlock on conversion, not a cryptic error', () => {
    expect(TRIAL_EXPORT_BLOCKED_MESSAGE).toMatch(/trial converts to a paid plan/i);
    expect(TRIAL_EXPORT_BLOCKED_MESSAGE).not.toMatch(/error|failed|unauthorized/i);
  });

  it('white-label message says white-label unlocks on conversion', () => {
    expect(TRIAL_WHITELABEL_BLOCKED_MESSAGE).toMatch(/trial converts to a paid plan/i);
  });

  it('location message says trials cover 1 location', () => {
    expect(TRIAL_LOCATION_BLOCKED_MESSAGE).toMatch(/1 location/i);
  });
});

describe('trial caps — checkUsageLimit honours trialing (no DB needed: limit 0 short-circuits)', () => {
  it('trialing business plan cannot use report_export (blocked with the trial message)', async () => {
    const res = await checkUsageLimit('00000000-0000-0000-0000-000000000000', 'trial@example.com', 'report_export', 'business', true);
    expect(res.allowed).toBe(false);
    expect(res.message).toBe(TRIAL_EXPORT_BLOCKED_MESSAGE);
  });
});

describe('trial caps — route wiring (source-level)', () => {
  const pdfSrc = readFileSync(join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');
  const scanSrc = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');
  const settingsSrc = readFileSync(join(process.cwd(), 'app/api/agency/settings/route.ts'), 'utf8');

  it('PDF export route blocks trialing accounts with the trial message', () => {
    expect(pdfSrc).toContain('trial_export_blocked');
    expect(pdfSrc).toContain('TRIAL_EXPORT_BLOCKED_MESSAGE');
    expect(pdfSrc).toContain('resolvePlanServer');
  });

  it('scan route enforces the trial scan cap and the 1-location cap before the cache', () => {
    expect(scanSrc).toContain('userIsTrialing');
    // QA fix-all: the check moved into lib/trialCaps.isTrialLocationBlocked
    // (business scans only — category scans never consume the location).
    expect(scanSrc).toContain('isTrialLocationBlocked(');
    expect(scanSrc).toContain('trial_location_limit_reached');
    // The location check must sit before the cache check, or a cache hit
    // for a second business would serve that business's data for free.
    expect(scanSrc.indexOf('isTrialLocationBlocked(')).toBeLessThan(scanSrc.indexOf('getCachedScan(input'));
  });

  it('agency settings route blocks white-label for trialing accounts', () => {
    expect(settingsSrc).toContain('trial_whitelabel_blocked');
    expect(settingsSrc).toContain('TRIAL_WHITELABEL_BLOCKED_MESSAGE');
  });

  it('the only API is the public unkeyed v1 — no account API exists to trial-gate yet', () => {
    // Honesty check, updated (Oct 20, 2026): when this test was
    // written no /api/v1 existed. The public API v1 has since
    // shipped (PR #98) — it is PUBLIC and unkeyed (score +
    // verification reads), so there is still no ACCOUNT API for a
    // trial to be excluded from. The keyed private API (STD-06
    // Part B, api_keys table) is not built; when it lands, trial
    // exclusion must be wired there and this test revisited.
    expect(existsSync(join(process.cwd(), 'app/api/v1'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'app/api/v1/score/[scanId]/route.ts'))).toBe(true);
  });
});
