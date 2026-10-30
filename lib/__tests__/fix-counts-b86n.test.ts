import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b86n (re-audit MIXED) — two count defects on /dashboard/fix:
// P1: the queue's "Ready for Review: N" sat beside a tools
// summary reading "Apply all 5 priority fixes" (the static
// priority TOOL catalog) with nothing saying they count
// different things. P2: /api/fixes/pending capped the LIST at
// 10 while returning the full deduped count — above 10 pending,
// the queue badge (list length) and the dashboard banner
// (count) diverged.

const page = readFileSync(join(process.cwd(), 'app/dashboard/fix/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/fixes/pending/route.ts'), 'utf8');

describe('b86n — fix counts agree and say what they count', () => {
  it('the pending list is not capped below the deduped total', () => {
    expect(route).toContain('getUserFixes(user.id, status, 50)');
    expect(route).not.toContain('getUserFixes(user.id, status, 10)');
  });

  it('the queue badge shows the API count, not the list length', () => {
    expect(page).toContain('pendingCount ?? pendingFixes.length');
    expect(page).toContain('setPendingCount(typeof json.count');
  });

  it('the tools projection names itself as a different count', () => {
    expect(page).toContain('The 5 priority tools below, applied together');
    expect(page).toContain('the two counts measure different things');
    expect(page).not.toContain('Apply all 5 priority fixes →');
  });
});
