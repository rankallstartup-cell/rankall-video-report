import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8bf: /video/[scan_id] must select columns that exist on rankall_scans
// (live schema checked 2026-10-17). city/score/competitor_score/revenue_leak
// do not exist there; selecting them made every real scan id 404.
// RT-69: the page no longer holds its own rankall_scans select — the
// scan row loads via loadShareableScanRow (lib/publicShare.ts), whose
// query is select('*') (a wildcard expands to real columns only, so it
// cannot 400 on a nonexistent column name) and is gated by
// canServePublicShare. This test asserts against the loader's query
// instead of the page's, and checks the page's toVideoScan mapping only
// touches real columns.
const RANKALL_SCANS_COLUMNS = new Set([
  'id', 'user_id', 'input', 'intent_type', 'industry', 'location', 'primary_query', 'overall_score',
  'trust_score', 'competitor_name', 'score_gap', 'scan_duration_ms', 'created_at', 'business_name',
  'queries_used', 'query_count', 'trust_signals', 'mentioned_count', 'citation_sources', 'enrichment',
  'country_code', 'scoring_version', 'resolved_category', 'category_confidence', 'failed_platforms',
  'scan_reliable', 'basket_hash', 'is_public', 'user_business_name', 'competitor_score',
]);
const page = readFileSync(join(process.cwd(), 'app/video/[scan_id]/page.tsx'), 'utf8');
const loader = readFileSync(join(process.cwd(), 'lib/publicShare.ts'), 'utf8');

describe('/video/[scan_id] — b8bf', () => {
  it('selects only real rankall_scans columns', () => {
    // The page holds no rankall_scans select of its own anymore.
    expect(page).toContain('loadShareableScanRow');
    expect(page).not.toContain("from('rankall_scans')");
    // The loader's scan-row query: a wildcard, or an explicit list of
    // real columns only — never a nonexistent column name.
    const fn = loader.slice(
      loader.indexOf('export async function loadShareableScanRow'),
      loader.indexOf('export async function resolvePublicReportUrl'),
    );
    const m = fn.match(/\.select\('([^']+)'\)/);
    expect(m).toBeTruthy();
    const selectList = m![1].trim();
    if (selectList !== '*') {
      for (const col of selectList.split(',').map((c) => c.trim())) {
        expect(RANKALL_SCANS_COLUMNS.has(col), col).toBe(true);
      }
    }
    expect(fn).toContain('canServePublicShare');
    // The page's mapping only touches real columns (toVideoScan reads
    // r.* fields; the mapped scan.city / scan.score / scan.revenue_leak
    // are post-mapping outputs, not DB column names).
    for (const field of [
      'r.business_name', 'r.location', 'r.industry', 'r.overall_score',
      'r.competitor_name', 'r.competitor_score', 'r.country_code', 'r.mentioned_count',
    ]) {
      expect(page).toContain(field);
      const col = field.slice(2);
      expect(RANKALL_SCANS_COLUMNS.has(col), col).toBe(true);
    }
  });
});
