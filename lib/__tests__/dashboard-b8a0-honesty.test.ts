import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a0 — /dashboard (Overview): the page contradicted itself.
// DB-verified on staging (Oct 20, 2026): the test account owns 14 scans
// (the page showed "Total scans 10" — the list cap), 39 raw pending fix
// rows vs 6 deduped fix types (the page showed both numbers in
// different places), and a "+2 pts" score change computed across
// unrelated businesses (the like-for-like delta is +1).

const page = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
const layout = readFileSync(join(process.cwd(), 'app/dashboard/layout.tsx'), 'utf8');
const valueStack = readFileSync(join(process.cwd(), 'app/api/dashboard/value-stack/route.ts'), 'utf8');

describe('b8a0 — one fix count everywhere', () => {
  it('value-stack counts pending fixes deduped by fix_type', () => {
    expect(valueStack).toContain('pendingTypesRes');
    expect(valueStack).toContain('new Set(pendingTypeRows.map');
    expect(valueStack).toContain('dedupedPending');
  });

  it('the Fixes Applied denominator uses the deduped pending count, not the capped list', () => {
    expect(page).toContain('appliedFixCount + pendingFixCount');
    expect(page).not.toContain('appliedFixCount + fixes.length');
  });
});

describe('b8a0 — scan counts agree', () => {
  it('a count query under the same track filter feeds Total scans', () => {
    expect(page).toContain('fetchTotalScanCount');
    expect(page).toContain("count: 'exact', head: true");
    expect(page).toContain('totalScans > 0 ? totalScans : scans.length');
  });

  it('scan history says when it is showing a capped list', () => {
    expect(page).toContain('latest ${scans.length} of ${totalScans} scans');
  });

  it('the trend names its scope (one query set, not all scans)', () => {
    expect(page).toContain('For the query set of your latest scan');
    expect(page).toContain('since previous scan');
  });
});

describe('b8a0 — deltas carry their baseline', () => {
  it('value-stack computes score change within the latest basket only', () => {
    expect(valueStack).toContain('basket_hash');
    expect(valueStack).toContain('basketPrev');
    expect(valueStack).toContain('scoreBaselineDate');
  });

  it('the page names the baseline date under SCORE CHANGE', () => {
    expect(page).toContain('vs previous scan of the same query set');
    expect(page).toContain('scoreBaselineDate');
  });

  it('AI APPEARANCES states its definition (mentions summed over this month scans)', () => {
    expect(valueStack).toContain('scansThisMonth');
    expect(page).toContain('platform mentions summed across your');
  });
});

describe('b8a0 — no first-scan copy for accounts with scans', () => {
  it('the welcome banner no longer tells a scanned account to run its first scan', () => {
    expect(page).toContain('Your latest scan is below');
  });

  it('the next-steps strip says Run a new scan and step 2 opens the latest report', () => {
    expect(page).toContain("label: 'Run a new scan'");
    expect(page).toContain('`/report/${latestScan.id}`');
  });

  it('the free teaser no longer says first scan', () => {
    expect(page).toContain('Run a free scan across 12 AI platforms');
    expect(page).not.toContain('Run your first free scan');
  });
});

describe('b8a0 — platform grid and share card honesty', () => {
  it('an errored platform is a non-response, not a miss', () => {
    expect(page).toContain('platNoResponse');
    expect(page).toContain('if (p.error) { platNoResponse.add(p.platform); return; }');
    expect(page).toContain('not counted as a miss');
  });

  it('the score-card link goes by scan_id, never client-supplied score params', () => {
    expect(page).toContain('/score-card?scan_id=${latestScan.id}');
    expect(page).not.toContain('/score-card?score=');
  });
});

describe('b8a0 — the sidebar pill label names its number', () => {
  it('layout labels the overall_score pill AI Visibility Score', () => {
    expect(layout).toContain("'AI Visibility Score'");
    expect(layout).not.toContain('Share of Recommendation Score');
  });
});
