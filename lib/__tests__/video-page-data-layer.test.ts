// b8bf — /video/[scan_id] data layer: the old page read rankall_scans
// with the anon key and a select naming three columns that do not exist
// (score / city / revenue_leak), so PostgREST answered 400 and EVERY
// scan id 404'd. The page now loads via loadShareableScanRow (service
// role + the /r/ share-visibility rule) and maps only real columns.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/video/[scan_id] data layer (b8bf)', () => {
  it('loads via the share rule, never the anon client', () => {
    const page = read('app/video/[scan_id]/page.tsx');
    expect(page).toContain('loadShareableScanRow');
    expect(page).not.toContain('createServerClient');
    expect(page).not.toContain("from('@supabase/ssr')");
    expect(page).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('never selects the nonexistent columns', () => {
    // RT-69: the select moved into the loader — assert against the
    // loader's query string, not the page source. scan.score /
    // scan.city / scan.revenue_leak are post-mapping outputs of
    // toVideoScan (r.overall_score -> score, r.location -> city,
    // revenue_leak: null), not DB column names, so they may appear on
    // the page but must never appear in a select list.
    const page = read('app/video/[scan_id]/page.tsx');
    const loader = read('lib/publicShare.ts');
    const fn = loader.slice(
      loader.indexOf('export async function loadShareableScanRow'),
      loader.indexOf('export async function resolvePublicReportUrl'),
    );
    const m = fn.match(/\.select\('([^']+)'\)/);
    expect(m).toBeTruthy();
    const selectList = m![1];
    expect(selectList).not.toMatch(/\bcity\b/);
    expect(selectList).not.toMatch(/(?<![a-z_])score(?![a-z_])/);
    expect(selectList).not.toContain('revenue_leak');
    expect(page).not.toMatch(/from\('rankall_scans'\)\s*\.select\('[^']*(city|score|revenue_leak)/);
    // The page maps real row fields: toVideoScan reads r.overall_score,
    // the body reads row.location.
    expect(page).toContain('r.overall_score');
    expect(page).toContain('row.location');
  });

  it('uses the trusted display name (#39), not the raw stored name', () => {
    const page = read('app/video/[scan_id]/page.tsx');
    expect(page).toContain('getTrustedDisplayName');
    expect(page).not.toContain('scan.business_name');
  });
});
