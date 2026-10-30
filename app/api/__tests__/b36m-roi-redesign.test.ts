import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/roi/page.tsx', 'utf8');

describe('b36m roi redesign', () => {
  it('never invents industry benchmark outcome percentages', () => {
    expect(src).not.toContain('INDUSTRY_BENCHMARKS');
    expect(src).not.toContain('Industry Benchmark');
    expect(src).toContain('About these numbers');
    expect(src).toContain('quote industry-wide outcome percentages');
  });
  it('never invents a default score or uses the wrong plan price', () => {
    expect(src).not.toContain('?? 40');
    expect(src).not.toContain('country.monthly * 12');
    expect(src).toContain('Only prefill from a measured scan score');
    expect(src).toContain('planMonthlyPrice');
    expect(src).toContain('planCostLabel');
    expect(src).toContain('Annual cost uses');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
