// b8b8 — /score/[slug] exists and works for real report-link slugs.
// The first pass tested invalid slugs (a human slug that is not in
// rankall_report_links, and a raw scan id) and concluded the route did
// not exist. Two real defects instead:
//   1. The report page's share link hardcoded https://www.rankall.io —
//      a staging share pointed at prod, where the scan does not exist.
//   2. loadScoreBySlug queried a nonexistent score_slug column (dead path).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/score/[slug] share flow (b8b8)', () => {
  it('report share link uses the current origin, never hardcoded prod', () => {
    const report = read('app/report/[id]/page.tsx');
    expect(report).not.toContain('https://www.rankall.io/score/');
    expect(report).toContain('window.location.origin}/score/${payload.shareSlug}');
  });

  it('slug resolution uses rankall_report_links only (no dead score_slug path)', () => {
    const share = read('lib/publicShare.ts');
    expect(share).not.toContain("eq('score_slug'");
    expect(share).toContain("from('rankall_report_links')");
  });

  it('the /score/[slug] page exists and loads via the share rule', () => {
    const page = read('app/score/[slug]/page.tsx');
    expect(page).toContain('loadScoreBySlug');
  });
});
