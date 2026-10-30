import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89y — /dashboard/market-index: the dashboard stated a different
// publication rule than the public index (at least 20 scans vs at
// least 5) over a different sample (no date window vs last 12
// months), the percentile had no denominator, and logged-out
// visitors got the shell plus a false "fewer than 20 scans" line.

const page = readFileSync(join(process.cwd(), 'app/dashboard/market-index/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/dashboard/benchmarks/route.ts'), 'utf8');
const lib = readFileSync(join(process.cwd(), 'lib/benchmarks.ts'), 'utf8');

describe('b89y — one canonical rule + one sample', () => {
  it('the benchmark min sample is the public privacy rule (5)', () => {
    expect(lib).toContain('BENCHMARK_MIN_SAMPLE = 5');
    expect(lib).not.toContain('BENCHMARK_MIN_SAMPLE = 20');
  });

  it('the API samples the last 12 months, like the public page', () => {
    expect(route).toContain(".gte('created_at', since)");
    expect(route).toContain('365 * 24 * 3600 * 1000');
  });

  it('the page states the shared window', () => {
    expect(page).toContain('the same sample as the public Market Index');
    expect(page).toContain('fewer than ${minSample} ${countryCode} scans in the last 12 months yet');
  });
});

describe('b89y — the percentile carries its denominator', () => {
  it('the API returns below/sample counts with the percentile', () => {
    expect(route).toContain('percentileBelow');
    expect(route).toContain('percentileSample');
  });

  it('the page states how many scored lower, out of how many', () => {
    expect(page).toContain('scored lower than your');
    expect(page).toContain('percentileBelow} of the {percentileSample}');
  });
});

describe('b89y — logged-out visitors get a gate, not placeholders', () => {
  it('sign-in state is tracked and gates the page', () => {
    expect(page).toContain('setSignedIn(!!session)');
    expect(page).toContain('Sign in to view the Market Index.');
    expect(page).toContain('/login?next=/dashboard/market-index');
  });

  it('the pre-fetch min-sample default matches the canonical rule', () => {
    expect(page).toContain('useState(5)');
    expect(page).not.toContain('useState(20)');
  });
});
