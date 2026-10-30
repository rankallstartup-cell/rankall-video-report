import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Item 12: remaining invented statistics / timing promises.
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

describe('no invented stats (round 2)', () => {
  it.each([
    ['app/dashboard/roi/page.tsx', [/increase in AI-driven appointment bookings/, /improving from 30→70/, /INDUSTRY_BENCHMARKS/]],
    ['app/api/seo-audit/route.ts', [/78% of local service queries/]],
    ['app/api/seo-audit/fix/route.ts', [/78% of local service queries/]],
    ['app/dashboard/fix/page.tsx', [/#1 signal/]],
    ['app/dashboard/page.tsx', [/30–60 days/]],
    ['app/dashboard/trust/page.tsx', [/30–60 days/, /48–72 hours/]],
    ['app/api/welcome-email/route.ts', [/30–60 days/]],
  ] as Array<[string, RegExp[]]>)('%s', (f, bad) => {
    const src = read(f);
    for (const re of bad) expect(src).not.toMatch(re);
  });
});
