// b8b2 — /report/ contradictions: gap-narrative prompt rules + the
// projection-cap label. (The /r/[id] route itself is a CORRECTION: it
// exists and works — see the /r/ checks below.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectScore, effectiveCap } from '@/lib/projection';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/report/ contradictions (b8b2)', () => {
  it('gap narrative never invents a confidence percentage or a competitor mention count', () => {
    const route = read('app/api/gap-narrative/route.ts');
    expect(route).toContain('NEVER state a confidence percentage');
    expect(route).toContain('NEVER state how many platforms mention the competitor');
    expect(route).not.toContain('how many platforms mention the competitor vs them');
  });

  it('the projection names the cap when it binds (per-fix gains vs total)', () => {
    // The 1137 scan: current 84, fix gains sum > 1, projection capped at 85.
    expect(effectiveCap(84)).toBe(85);
    expect(projectScore(84, 29)).toBe(85);
    expect(projectScore(84, 1)).toBe(85);
    const page = read('app/report/[id]/page.tsx');
    expect(page).toContain('projectionCapBinds');
    expect(page).toContain('individual fix gains sum to');
    expect(page).toContain('projection capped at');
  });

  it('/r/[id] exists and loads via the share rule (first-pass correction)', () => {
    const page = read('app/r/[id]/page.tsx');
    expect(page).toContain('loadPublicShare');
    expect(page).toContain('notFound()');
  });

  it('report in-body links are real links (Score History, View Dashboard)', () => {
    const page = read('app/report/[id]/page.tsx');
    expect(page).toContain('href="/dashboard/score-history"');
    expect(page).toContain('href="/dashboard"');
    expect(page).toContain('setExpandedIdx(expandedIdx === i ? null : i)');
  });
});
