// b8at — /leaderboard: ranked by the headline AI Score, state filter
// matches state codes, domains are not cities, timestamp is data-derived.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/leaderboard honesty (b8at)', () => {
  it('ranks by AI Score desc (tiebreak Trust, then newest), not Trust', () => {
    const route = read('app/api/leaderboard/route.ts');
    expect(route).toContain('scoreOf(b) - scoreOf(a)');
    expect(route).toContain('compareScans');
    expect(route).not.toContain('return bt - at;');
    expect(route).not.toContain('Sort by trust score');
    expect(route).not.toContain('new Date().toISOString()');
  });

  it('state filter matches the state code as the last location token', () => {
    const route = read('app/api/leaderboard/route.ts');
    expect(route).toContain('matchesState');
    expect(route).toContain("tokens[tokens.length - 1] === code");
    expect(route).toContain("texas: 'tx'");
    expect(route).toContain("idaho: 'id'");
  });

  it('a bare domain is not returned as a city', () => {
    const route = read('app/api/leaderboard/route.ts');
    expect(route).toContain("if (!/\\s/.test(trimmed) && trimmed.includes('.')) return '';");
  });

  it('updatedAt is the newest scan in the ranking, not the request time', () => {
    const route = read('app/api/leaderboard/route.ts');
    expect(route).toContain('ranked.map((r) => r.updatedAt)');
  });

  it('page discloses the sort key, drops "Live", labels the timestamp honestly', () => {
    const page = read('app/leaderboard/page.tsx');
    expect(page).toContain('Ranked by AI Score');
    expect(page).not.toContain('Live Rankings');
    expect(page).toContain('Newest scan in this ranking:');
    expect(page).not.toContain('Last updated:');
  });
});
