import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { brandingEntitled, reportExportDecision } from '../reportEntitlements';

const p = (plan: string, isTrialing = false, isAdmin = false) => ({ plan, isTrialing, isAdmin });

describe('report export entitlement', () => {
  it('free users cannot export (report_export = 0)', () => {
    expect(reportExportDecision(p('free'), null)).toBe('plan_required');
  });
  it('paid non-trial plans can export', () => {
    for (const plan of ['personal_pro', 'business', 'agency', 'enterprise']) expect(reportExportDecision(p(plan), null)).toBe('ok');
  });
  it('trialing is blocked; admin always ok', () => {
    expect(reportExportDecision(p('business', true), null)).toBe('trial_blocked');
    expect(reportExportDecision(p('free', false, true), null)).toBe('ok');
  });
  it("an agency's free client may export only while the agency holds a current agency plan", () => {
    expect(reportExportDecision(p('free'), p('agency'))).toBe('ok');
    expect(reportExportDecision(p('free'), p('business'))).toBe('plan_required'); // downgraded agency
    expect(reportExportDecision(p('free'), p('agency', true))).toBe('plan_required');
    expect(reportExportDecision(p('free'), p('free'))).toBe('plan_required');
  });
});

describe('white-label / custom branding entitlement', () => {
  it('only current non-trial agency-tier plans (or admin)', () => {
    expect(brandingEntitled(p('agency'))).toBe(true);
    expect(brandingEntitled(p('enterprise'))).toBe(true);
    expect(brandingEntitled(p('business'))).toBe(false); // downgraded agency
    expect(brandingEntitled(p('free'))).toBe(false);
    expect(brandingEntitled(p('agency', true))).toBe(false);
    expect(brandingEntitled(p('free', false, true))).toBe(true);
    expect(brandingEntitled(null)).toBe(false);
  });
});

describe('generate-pdf wiring (source-level)', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');
  it('enforces the export decision and drops branding when not entitled', () => {
    expect(src).toContain('reportExportDecision(requesterPlan');
    expect(src).toContain("agencySettings = mayUseBranding ? (settings as Record<string, unknown> | null) : null;");
  });
});
