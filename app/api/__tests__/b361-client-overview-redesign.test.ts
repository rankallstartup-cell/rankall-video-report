import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b361: Client overview redesign — b35q design system on staging logic;
// v2's version replaced the shared gradeLabel table with local A-F
// grades, bypassed /api/client-portal/overview with direct Supabase
// queries on the stale scans table, and fabricated fallback titles.
describe('b361 client overview redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/client/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens, pagehead', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB', 'pagehead']) {
      expect(src).toContain(s);
    }
  });
  it('staging logic preserved: endpoint load, shared grade table, real fix impacts', () => {
    expect(src).toContain('/api/client-portal/overview');
    expect(src).toContain("gradeLabel } from '@/lib/projection'");
    expect(src).toContain('GRADE_COLORS');
    expect(src).toContain('Est. +${f.predictedImpact} pts');
    expect(src).toContain('AI Platform Visibility');
    expect(src).toContain('Your Top 3 Priorities');
  });
  it('error state carries the redesign (header + card, not a bare line)', () => {
    // The error return is not a bare line: it renders an h1 plus a
    // white bordered card (radius 16, padding 24) with the error + Retry.
    // The page heading in every state is "My Score", never
    // "Your Dashboard", and the error card uses inline styles, not the
    // dash-card class — so assert the real heading + card shape.
    expect(src).toContain('My Score');
    expect(src).toContain("borderRadius: 16, padding: '24px'");
  });
  it('no v2 poison: no direct Supabase, no letter grades, no fabricated titles', () => {
    for (const s of ['getBrowserClient', "from('scans')", "from('agency_clients')", 'Optimisation fix', 'response_text', 'No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
});
