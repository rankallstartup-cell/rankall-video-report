import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89u — /dashboard/fix: (1) the queue mixed fixes from three of the
// account's businesses under "specifically for your business" and
// personalised their content with the LATEST scan's business;
// (2) "Ready for Review 4" vs banner "Apply all 5 priority fixes"
// with irreconcilable totals/confidences; (3) Verification showed
// "Starting score 0/100" — the stored score_before (4) was never
// selected by lib/fixes FIX_COLUMNS; (4) unsourced claims (~60
// threshold, ChatGPT Ads $25/day); (5) logged-out = shell + "No
// scans yet".

const page = readFileSync(join(process.cwd(), 'app/dashboard/fix/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/fixes/pending/route.ts'), 'utf8');
const fixes = readFileSync(join(process.cwd(), 'lib/fixes.ts'), 'utf8');
const intel = readFileSync(join(process.cwd(), 'lib/fixIntelligence.ts'), 'utf8');

describe('b89u — verification reads the stored scores', () => {
  it('FIX_COLUMNS selects score_before / score_after / verification_status', () => {
    expect(fixes).toContain('score_before, score_after, verification_status');
  });
});

describe('b89u — every fix is labelled with its source scan', () => {
  it('the pending route attaches the trusted scan business + date', () => {
    expect(route).toContain('scan_business');
    expect(route).toContain('scan_date');
    expect(route).toContain('getTrustedDisplayName');
  });

  it('the queue no longer claims one business and labels each fix', () => {
    expect(page).not.toContain('specifically for your business');
    expect(page).toContain('Generated from your scans');
    expect(page).toContain('fix.scan_business');
    expect(page).toContain('from your scan of');
  });

  it('personalisation uses the fix’s own business, not the latest scan’s', () => {
    expect(page).toContain('fix.scan_business || scan?.user_business_name');
    expect(page).not.toContain("personalizeContent(String(fix.generated_content), scan?.user_business_name || scan?.input)");
  });
});

describe('b89u — one page, reconciled numbers', () => {
  it('the queue shows its own estimated total from the card impacts', () => {
    expect(page).toContain('Estimated total:');
    expect(page).toContain('pendingImpactTotal');
  });

  it('the banner names the priority TOOLS and an average confidence', () => {
    // Banner reworded, not broken: it names the 5 priority tools and
    // an average confidence (aggConfidence = mean of the priority
    // tools' confidences), and distinguishes the tool set from the
    // fix queue. Do not revert the page copy.
    expect(page).toContain('The 5 priority tools below, applied together');
    expect(page).toContain('confidence (derived from platform coverage + trust signals)');
    expect(page).toContain('priority TOOL set');
    expect(page).not.toContain('Apply all 5 priority fixes');
  });

  it('verification names the business its starting score belongs to', () => {
    expect(page).toContain('for ${fix.scan_business}');
  });
});

describe('b89u — claims and gates', () => {
  it('the unsourced claims are gone', () => {
    expect(page).not.toContain('starts at $25/day');
    expect(intel).not.toContain('~60');
    expect(intel).toContain('71+ Strong band');
  });

  it('logged-out visitors get a sign-in gate, not the no-scan branch', () => {
    const gate = page.indexOf('Sign in to use the Fix Engine.');
    const noScan = page.indexOf('No scans yet.');
    expect(gate).toBeGreaterThan(-1);
    expect(noScan).toBeGreaterThan(gate);
    expect(page).toContain('/login?next=/dashboard/fix');
  });
});
