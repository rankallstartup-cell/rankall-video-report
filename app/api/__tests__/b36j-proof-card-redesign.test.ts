import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/proof-card/page.tsx', 'utf8');

describe('b36j proof card redesign', () => {
  it('never takes client-supplied scores, a fake preview, or a self-reported fix', () => {
    expect(src).not.toContain('topFix');
    expect(src).not.toContain('beforeScore');
    expect(src).not.toContain('afterScore');
    expect(src).not.toContain('newPlatforms');
    expect(src).not.toContain('Preview — what your proof card');
    expect(src).not.toContain('Now appearing on');
  });
  it('never invents a 30-day rescan or a fake +19/45-day preview', () => {
    expect(src).not.toContain('30 days');
    expect(src).not.toContain('catch { }');
  });
  it('gates proof cards on rescan-verified outcomes', () => {
    expect(src).toContain('verifiedOutcomeId');
    expect(src).toContain('/api/outcomes/verified');
    expect(src).toContain('No verified improvement yet');
    expect(src).toContain('platforms_count');
    expect(src).toContain('7 days');
  });
  it('preserves failure hardening', () => {
    expect(src).toContain('Could not generate the proof card');
    expect(src).toContain('Copy failed');
    expect(src).toContain('Could not load your verified improvements');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
