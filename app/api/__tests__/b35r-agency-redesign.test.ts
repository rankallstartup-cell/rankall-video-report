import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35r: Agency page redesign — b35q design system applied to staging logic;
// v2's agency page had no distinct design and carried fabricated data.
describe('b35r agency redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/agency/page.tsx'), 'utf-8');
  it('new design system present: pagehead, dash-card, Geist, tokens', () => {
    for (const s of ['pagehead', 'dash-card', 'fadeInUp', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('no v2 fabricated data: no invented score, competitor, platforms, revenue, country', () => {
    for (const s of ['?? 35', 'competitorScore: 62', 'platformsCovered: 3', 'revenueGap: 3500', "countryCode: 'US'", 'No credit card', 'automated Monday']) {
      expect(src).not.toContain(s);
    }
  });
  it('staging logic preserved: real projections, CSV export, remove error, 5-grade badges', () => {
    for (const s of ['scanRevenueEstimate', 'revenueMeasured', 'exportSelectedCsv', 'actionError', 'BADGE_COLORS', 'Not Visible', 'competitorScore: null']) {
      expect(src).toContain(s);
    }
  });
  it('same 9 sections, same order', () => {
    const markers = ['TOP BAR', 'Context Switcher', 'STATS ROW', 'FILTER / SORT / SEARCH BAR', 'BULK ACTIONS', 'CLIENT TABLE', 'ADD CLIENT MODAL', 'AGENCY CLIENT VIEW'];
    const idx = markers.map(m => src.indexOf(m));
    for (const i of idx) expect(i).toBeGreaterThanOrEqual(0);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
