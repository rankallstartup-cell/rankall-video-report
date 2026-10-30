import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/leaderboard/page.tsx', 'utf8');

describe('b36b leaderboard redesign', () => {
  it('loads the ranking from the anonymised server endpoint, never a direct scan query', () => {
    expect(src).toContain('`/api/dashboard/leaderboard?${params.toString()}`');
    expect(src).not.toContain('user_business_name');
    expect(src).not.toContain("Business #${i + 1}");
    expect(src).not.toContain(".eq('industry', industry)");
    // The only rankall_scans query is staging's own per-user init query
    // (own industry/location, scoped to the session user).
    expect(src).toContain(".select('industry, location')");
    expect(src).toContain(".eq('user_id', session.user.id)");
  });
  it('keeps the location param and the anonymity promise', () => {
    expect(src).toContain('URLSearchParams({ industry, location })');
    // Substance present reworded (plural "businesses", current sentences).
    expect(src).toContain('every other business is anonymous');
    expect(src).toContain('every other business shown anonymously');
    expect(src).toContain('Only your own businesses are named');
  });
  it('renders the leaderboard sections', () => {
    expect(src).toContain('Leaderboard');
    expect(src).toContain('Improve your rank');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
