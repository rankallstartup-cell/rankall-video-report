// b8b7 — /score-card must load the scan server-side from scan_id.
// The old page took score/business/industry/city/competitor from URL
// params and ignored scan_id: 0 for a real 84-score scan, the same
// false 0 card for a bogus id, and ?score=100 minted a fake card.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/score-card server load (b8b7)', () => {
  it('loads via the share rule from scan_id, never from URL params', () => {
    const page = read('app/score-card/page.tsx');
    expect(page).toContain('loadShareableScanRow');
    expect(page).toContain('scan_id');
    expect(page).not.toContain('useSearchParams');
    expect(page).not.toContain("params.get('score')");
    expect(page).not.toContain("params.get('business')");
    expect(page).not.toContain('use client');
  });

  it('has honest bare / not-found states, never a 0 card', () => {
    const page = read('app/score-card/page.tsx');
    expect(page).toContain('No scan selected');
    expect(page).toContain('Scan not found');
  });

  it('uses the trusted display name + real overall_score', () => {
    const page = read('app/score-card/page.tsx');
    expect(page).toContain('getTrustedDisplayName');
    expect(page).toContain('row.overall_score');
  });

  it('the report page links by scan_id, not by client-supplied params', () => {
    const report = read('app/report/[id]/page.tsx');
    expect(report).toContain('/score-card?scan_id=');
    expect(report).not.toContain('/score-card?score=');
  });
});
