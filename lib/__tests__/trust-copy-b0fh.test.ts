import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trustFixGainPoints } from '../trust';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// Unsourced claims removed from trust copy.
describe('trust copy has no invented statistics', () => {
  it.each(['lib/trustSignals.ts', 'app/dashboard/trust/page.tsx'])('%s', (file) => {
    const src = read(file);
    for (const claim of ['#1 signal', '90%+', '60% less likely', '78%', 'up to 40%', '4.5+ stars', '3+ platforms', '+18 pts']) {
      expect(src).not.toContain(claim);
    }
    expect(src).not.toMatch(/\b2x\b/);
  });

  it('lib/trust.ts consequences make no fixed-points promise', () => {
    expect(read('lib/trust.ts')).not.toContain('+18 pts to fix');
  });
});

// b0fh: competitor and weekly rescans measure trust on the same basis as
// the main scan (website + verified enrichment).
describe('b0fh like-for-like trust inputs', () => {
  it('competitor-scan passes the website and verified enrichment', () => {
    const src = read('app/api/competitor-scan/route.ts');
    expect(src).toMatch(/websiteUrl:\s*googleData\?\.website/);
    expect(src).toMatch(/google:\s*googleData \?\? null/);
  });

  it('rescan-weekly passes the trusted stored website', () => {
    const src = read('app/api/rescan-weekly/route.ts');
    expect(src).toContain('websiteUrl: trustCtx.websiteUrl');
    expect(src).toContain('getTrustedStoredGoogle(originalScan.input, originalScan.location');
  });

  it('+N pts badges divide by MEASURED signals only', () => {
    const signals = [
      { status: 'missing' }, { status: 'good' },
      { status: 'not_checked' }, { status: 'not_checked' },
    ];
    // 2 measured -> fixing one missing signal = 1/2 = 50 pts.
    expect(trustFixGainPoints({ status: 'missing' }, signals)).toBe(50);
    expect(trustFixGainPoints({ status: 'not_checked' }, signals)).toBe(0);
  });
});
