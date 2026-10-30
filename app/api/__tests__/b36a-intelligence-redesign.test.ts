import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/intelligence/page.tsx', 'utf8');

describe('b36a intelligence redesign', () => {
  it('loads KP stats from the server endpoint, never a direct browser query', () => {
    expect(src).toContain("fetch('/api/dashboard/kp-stats')");
    expect(src).not.toContain("from('rankall_scans')");
    expect(src).not.toContain('limit(500)');
  });
  it('computes real per-country averages, never a hardcoded table', () => {
    expect(src).toContain('countryAgg');
    expect(src).toContain('Labeled Scans');
    expect(src).toContain('No labeled scans yet');
    expect(src).toContain('Averages from labeled scans');
    expect(src).not.toContain('score: 62');
    expect(src).not.toContain('score: 58');
  });
  it('renders the intelligence sections', () => {
    expect(src).toContain('Intelligence Graph');
    expect(src).toContain('Global Comparison');
  });
  it('gives the load-error return the main shell', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
