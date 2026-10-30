import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax6t residual: Paras's copy fix matched most copy to the one real
// path (verification rescan ~7 days after applying), but 8 files
// still promised weekly/automated/30-day rescans with no mechanism.
describe('ax6t no remaining weekly-rescan promises', () => {
  const files = [
    'app/api/cancel-subscription/route.ts',
    'app/api/pause-subscription/route.ts',
    'app/intelligence-graph/page.tsx',
    'app/llms-full.txt/route.ts',
    'app/llms.txt/route.ts',
    'app/page.tsx',
    'app/privacy/page.tsx',
    'app/api/fixes/apply/route.ts',
    'app/[industry]/[city]/page.tsx',
  ];
  const banned = [
    /weekly AI platform rescans/i,
    /weekly rescans/i,
    /rescans weekly/i,
    /automated rescans?/i,
    /automated rescan schedule/i,
    /automated rescan runs in 30 days/i,
    /rescan runs in 30 days/i,
    /weekly rescan/i,
  ];
  for (const f of files) {
    it(`${f} promises no weekly/automated rescan`, () => {
      const src = readFileSync(join(process.cwd(), f), 'utf-8');
      for (const p of banned) expect(src).not.toMatch(p);
    });
  }
  it('the one real path is named', () => {
    const src = readFileSync(join(process.cwd(), 'app/intelligence-graph/page.tsx'), 'utf-8');
    expect(src).toContain('Verification rescan runs ~7 days after you apply a fix');
  });
});
