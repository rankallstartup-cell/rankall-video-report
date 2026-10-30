import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02e: broken/misdirected CTAs + contradicting copy (11 items).
const src = readFileSync(join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');
const cardSrc = readFileSync(join(process.cwd(), 'components/KnowledgePanelCard.tsx'), 'utf8');
const applySrc = readFileSync(join(process.cwd(), 'app/api/fixes/apply/route.ts'), 'utf8');

describe('report CTAs + copy — b02e', () => {
  it('1) Weekly Score History points at the real route', () => {
    expect(src).toContain('href="/dashboard/score-history"');
    expect(src).not.toContain('/dashboard/history');
  });

  it('2) KP Pro CTA renders only when a handler exists', () => {
    expect(cardSrc).toContain('onGetFix ? (');
    expect(cardSrc).toContain(') : null) : (');
  });

  it('3) ROI Calculator card points at /dashboard/roi', () => {
    expect(src).toContain('<a href="/dashboard/roi"');
    expect(src).not.toContain(`<a href="/dashboard/fix" style={{ background: '#EFF6FF'`);
  });

  it('4) rescan copy matches the 7-day mechanism', () => {
    // ax72: the apply route defaults to 7 days (lib/rescanSchedule) and
    // honours the picker's choice per fix; the constant moved there.
    expect(applySrc).toContain('normaliseVerifyDays(body.rescan_days)');
    expect(readFileSync(join(process.cwd(), 'lib/rescanSchedule.ts'), 'utf8')).toContain('export const DEFAULT_VERIFY_DAYS = 7;');
    expect(src).toContain('verification rescan in ~7 days');
    expect(src).not.toMatch(/rescan in 30 days/i);
    expect(src).not.toContain('Full score improvement visible in your rescan comparison');
    // Fix round 3: the 'Days 30–60' / 'Week 8+' timeline promised timing the
    // product can't keep; the honest row defers to each platform's refresh cycle.
    expect(src).not.toContain('Full score improvement visible across AI platforms');
    expect(src).toContain('reflects changes on its own refresh cycle');
  });

  // Updated: the trial collects the card UPFRONT (payment_method_collection
  // 'always' — product decision, see trial-7-day.test.ts), so the old
  // "No credit card required" assertion encoded false copy.
  it('5) sticky CTA says the real 7-day trial (card required)', () => {
    expect(src).toContain('7-day free trial · Card required');
    expect(src).not.toContain('No credit card required');
    expect(src).not.toContain('14-day free trial');
  });

  it('6) spend button labels the real model (Haiku)', () => {
    expect(src).toContain('Analyzing with Claude Haiku...');
    expect(src).not.toContain('Claude Opus');
  });

  it('7) platform fallback is 12, not 11', () => {
    expect(src).toContain('results.length : 12');
    expect(src).not.toContain('results.length : 11');
  });

  it('8) badge drops "Live" (point-in-time snapshot)', () => {
    expect(src).toContain('>AI Visibility Report<');
    expect(src).not.toContain('Live AI Visibility Report');
  });

  it('9) fix counts are dynamic, never hardcoded 5', () => {
    expect(src).toContain('see all {fixes.length} personalised fixes');
    expect(src).toContain('see all {fixes.length} fixes free');
    expect(src).toContain('Unlock all {fixes.length} fixes');
    expect(src).toContain('`${fixes.length} personalised fixes`');
    expect(src).not.toContain('all 5 fixes');
    expect(src).not.toContain('all 5 personalised fixes');
    expect(src).not.toContain("'5 personalised fixes'");
    // Guards so the copy never renders "0 fixes" on load failure.
    expect(src).toContain('{!isLoggedIn && !authLoading && !fixesLoading && fixes.length > 0 && (');
    expect(src).toContain('{!isLoggedIn && !authLoading && !ctaDismissed && !fixesLoading && fixes.length > 0 && (');
  });

  it('10) market claim softened (unsourced)', () => {
    expect(src).toContain('Many businesses spend');
    expect(src).not.toContain('Most businesses spend');
  });

  it('11) trust-panel points are labelled trust pts', () => {
    expect(src).toContain('trust pts');
    expect(src).not.toContain('trustFixGainPoints(signal, allSignals.length)} pts');
    expect(src).not.toContain('+{trustFixGainPoints(signal, allSignals.length)} pts');
  });
});
