import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35q: dashboard home redesign — v2 design ported onto staging HEAD,
// staging logic + honesty fixes preserved (see branch commit message).
describe('b35q dashboard redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf-8');
  it('v2 design present: hero, priority, steps, fix results, breakdowns', () => {
    for (const s of ['HeroCard', 'PriorityCard', 'What to do next', 'Your Fix Results', 'Platform breakdown', 'Knowledge Panel', 'pagehead', 'fadeInUp']) {
      expect(src).toContain(s);
    }
  });
  it('no reintroduced v2 regressions: no fake rescan, no hardcoded benchmark, no invented competitor score', () => {
    for (const s of ['INDUSTRY_BENCHMARK', 'daysUntilRescan', 'automated Monday', 'tracked weekly', 'No credit card', '30-day', '30–60', '+ 15', '|| 5']) {
      expect(src).not.toContain(s);
    }
  });
  it('breakdown distinguishes did-not-respond platforms from did-not-mention (b35q live-verify fix)', () => {
    // Behaviour fully present under the current identifiers: a platform
    // whose row carries an error goes in platNoResponse (a Set), and the
    // badge renders 'nodata' (a dash) for it — never a miss.
    expect(src).toContain('platNoResponse');
    expect(src).toContain('platNoResponse.add(p.platform)');
    expect(src).toContain('platNoResponse.has(platform)');
    expect(src).toContain("const badge = errored ? 'nodata'");
    expect(src).toContain("didn't respond — never a miss");
  });
  it('staging honesty fixes preserved', () => {
    for (const s of ['Apply + 7d', 'verification rescan after you mark a fix applied', 'forceRescan', 'peerAvg', 'competitor_score', 'Competitor score after every rescan', 'getTrustedDisplayName']) {
      expect(src).toContain(s);
    }
  });
});
