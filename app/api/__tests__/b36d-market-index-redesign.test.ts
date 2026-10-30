import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/market-index/page.tsx', 'utf8');
// Strip // comment lines: staging's own honesty comment names the old
// fabricated baselines it removed — those mentions are not live code.
const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

describe('b36d market index redesign', () => {
  it('never invents baselines', () => {
    expect(code).not.toContain('DEFAULT_NATIONAL');
    expect(code).not.toContain('TOP_INDUSTRIES');
    expect(code).not.toContain('Med Spas');
    expect(code).not.toContain('baseline default');
  });
  it('loads benchmarks from the server endpoint, never direct browser queries', () => {
    expect(src).toContain('/api/dashboard/benchmarks');
    expect(code).not.toContain('market_index_snapshots');
    expect(code).not.toContain('from market snapshot');
    expect(code).not.toContain('computed from scans');
  });
  it('keeps the min-sample honesty states', () => {
    expect(src).toContain('minSample');
    expect(src).toContain('Not enough scans yet to rank industries');
    expect(src).toContain('not enough scans yet');
  });
  it('renders the market index sections', () => {
    expect(src).toContain('Market Index');
    expect(src).toContain('View Fix Queue');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
