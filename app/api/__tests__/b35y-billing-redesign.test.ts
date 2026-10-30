import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35y: Billing redesign — b35q design system on staging logic;
// v2's page dropped refund + end-trial flows, read billing state from
// user-editable user_metadata, and swallowed status failures as not-configured.
describe('b35y billing redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/billing/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('billing state from app_metadata only; no failure-swallow', () => {
    expect(src).toContain('app_metadata');
    // user_metadata appears only in the comment explaining it must never drive billing
    const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const code = codeLines.join('\n');
    expect(code).not.toContain('user_metadata');
    expect(code).not.toContain('.catch(() => ({ ready: false }))');
    expect(src).toContain('if (!statusRes.ok) throw');
  });
  it('refund + end-trial flows present', () => {
    for (const s of ['RefundSection', 'requestRefund', 'endTrialNow', 'refund-eligibility', 'graceDeadline', 'trialEndDateLabel', 'moneyBackDateLabel']) {
      expect(src).toContain(s);
    }
  });
  it('no v2 regressions or invented copy', () => {
    for (const s of ['No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
});
