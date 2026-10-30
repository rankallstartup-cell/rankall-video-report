import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35w: AI Inbox redesign — b35q design system on staging logic;
// v2's page invented mention/competitor counts and hardcoded value fallbacks.
describe('b35w ai inbox redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/ai-inbox/page.tsx'), 'utf-8');
  it('new design system present: light theme, dash-card, Geist, tokens', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB', 'btn-blue']) {
      expect(src).toContain(s);
    }
    expect(src).not.toContain('0B0F19');
  });
  it('no v2 invented counts or hardcoded fallbacks', () => {
    for (const s of ['(score / 100) * 11', '(11 - yourCount) * 0.6', 'avgCustomerValue || 500', 'monthlyAIInquiries || 60', 'calculateRevenueGap', 'lib/scoring', 'No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('staging logic preserved: real counts, shared revenue model, caps, gate', () => {
    for (const s of ['scanRevenueEstimate', 'revenueEstimateBasis', 'deriveSummary', 'LimitReachedModal', 'requires a paid plan', 'executeSearch', 'requestSearch']) {
      expect(src).toContain(s);
    }
  });
  it('same page sections present', () => {
    for (const s of ['AI Inbox', 'No searches yet', 'Something went wrong']) {
      expect(src).toContain(s);
    }
  });
});
