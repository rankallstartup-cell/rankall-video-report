import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReviewSignals } from '@/lib/trust';
import { PLAN_CONFIG } from '@/lib/planConfig';

// b8a8 — /dashboard/seo-health honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/seo-health/page.tsx'), 'utf8');
const prompt = readFileSync(join(process.cwd(), 'components/UpgradePrompt.tsx'), 'utf8');

describe('b8a8 — gates', () => {
  it('signed-out visitors get a sign-in gate before the plan gate', () => {
    expect(page).toContain('Sign in to view SEO Health.');
    expect(page).toContain('/login?next=/dashboard/seo-health');
    expect(page.indexOf('if (signedIn === false)')).toBeLessThan(page.indexOf('isBusinessPlan(plan)'));
  });

  it('admin view is labelled when the upgraded plan differs', () => {
    expect(page).toContain('Admin view:');
    expect(page).toContain('rawPlan');
  });

  it('UpgradePrompt uses the configured plan display name', () => {
    expect(prompt).toContain('PLAN_CONFIG');
    expect(prompt).toContain('displayName');
    // The configured name for the SEO bundle key is the honest label the
    // gate must show (was title-cased to a mangled form). Read PLAN_CONFIG
    // directly — getPlanConfig normalizes the key to its base plan.
    expect(PLAN_CONFIG.local_pro_seo.displayName).toBe('Local Pro + SEO');
  });
});

describe('b8a8 — score cards no longer contradict the scan block', () => {
  it('top SEO ring falls back to the scan-derived score, labelled as such', () => {
    expect(page).toContain('auditResult?.seoScore ?? scanSeo?.score');
    expect(page).toContain('seoFromScan');
    expect(page).toContain('from your latest scan');
  });

  it('the derivation of the scan score is stated on the page', () => {
    expect(page).toContain('weighted pass rate');
    expect(page).toContain('excluded, not scored 0');
  });

  it('dead/unsourced labels are gone', () => {
    expect(page).not.toContain('Session 6');
    expect(page).not.toContain('No competitor has this feature');
  });
});

describe('b8a8 — review-mentions denominator is labelled', () => {
  it('zero mentions: "any of the N AI platforms that responded"', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      platform: `P${i}`,
      response: 'A helpful answer about dentists in Dallas with no social proof discussion.',
    }));
    const signals = buildReviewSignals(results, results.map(r => r.response).join('\n'), 'Royal Lane Dental');
    const s = signals.find(x => x.name === 'Review mentions');
    expect(s?.value).toBe('Reviews not mentioned by any of the 10 AI platforms that responded');
  });
});
