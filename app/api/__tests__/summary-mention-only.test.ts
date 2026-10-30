import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax7w: the summary counted a category-only answer as a business
// appearance. Both the PDF report (generate-pdf) and the public
// share page (score/[slug]) built their platform map as
// `mentioned || response_text` — so a platform where the AI
// answered the category query ("Here are dentists in Austin…")
// without naming the business counted toward "appears on X of
// 11". The established rule (report page + its test) is
// response_text && mentioned: a mention requires mentioned=true.
describe('ax7w summary counts mentions only', () => {
  it('pdf report counts mentioned only', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');
    expect(src).not.toContain('!!r.mentioned || !!r.response_text');
    expect(src).toContain('platformMap[p] = !!r.mentioned;');
    expect(src).toContain('platformMap[r.platform as string] = !!r.mentioned;');
  });

  it('public share page counts mentioned only', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/score/[slug]/page.tsx'), 'utf8');
    expect(src).not.toContain('row.mentioned || row.response_text');
    expect(src).toContain('platformMap.set(row.platform, !!row.mentioned)');
  });
});
