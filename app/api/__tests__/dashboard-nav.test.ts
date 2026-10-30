import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b01u: 8 dashboard pages had zero nav links (orphaned) + SEO Health's
// nav entries were commented out; the agency 'Send Weekly Summary'
// button POSTed to a route that never existed (silent 404).
// Source-level checks: the layout is a client component with a heavy
// import graph, so the test reads the sources directly.
const ROOT = process.cwd();
const layoutSrc = readFileSync(join(ROOT, 'app/dashboard/layout.tsx'), 'utf8');
const agencySrc = readFileSync(join(ROOT, 'app/dashboard/agency/page.tsx'), 'utf8');

const ORPHANED_HREFS = [
  '/dashboard/ai-inbox',
  '/dashboard/content',
  '/dashboard/social-content',
  '/dashboard/leaderboard',
  '/dashboard/market-index',
  '/dashboard/playbooks',
  '/dashboard/proof-card',
  '/dashboard/spend-intelligence',
  '/dashboard/seo-health',
];

function navSection(key: string, nextKey: string | null): string {
  const start = layoutSrc.indexOf(`${key}: [`);
  expect(start).toBeGreaterThan(-1);
  const end = nextKey ? layoutSrc.indexOf(`${nextKey}: [`, start) : layoutSrc.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return layoutSrc.slice(start, end);
}

// The hrefs live in the shared TOOLS_NAV / SEO_HEALTH_NAV definitions;
// each paid nav spreads them in. Assert both halves.
const TOOL_HREFS = ORPHANED_HREFS.filter((h) => h !== '/dashboard/seo-health');

describe('dashboard nav — b01u orphaned pages', () => {
  it('every formerly-orphaned page is linked from every paid-plan nav', () => {
    const sections: Array<[string, string | null]> = [
      ['personal_pro', 'business'],
      ['business', 'agency'],
      ['agency', 'enterprise'],
      ['enterprise', null],
    ];
    for (const href of TOOL_HREFS) {
      expect(layoutSrc, `TOOLS_NAV missing ${href}`).toContain(`href: '${href}'`);
    }
    expect(layoutSrc).toContain("href: '/dashboard/seo-health'");
    for (const [key, next] of sections) {
      const section = navSection(key, next);
      expect(section, `${key} nav missing TOOLS_NAV spread`).toContain('...TOOLS_NAV');
      expect(section, `${key} nav missing SEO_HEALTH_NAV`).toContain('SEO_HEALTH_NAV');
    }
  });

  it('admin-only pages stay OUT of user nav (they render null for non-admins)', () => {
    expect(layoutSrc).not.toContain("href: '/dashboard/outreach'");
    expect(layoutSrc).not.toContain("href: '/dashboard/demo-prep'");
  });

  it('the dead Send Weekly Summary button is gone', () => {
    expect(agencySrc).not.toContain('send-weekly-summary');
    expect(agencySrc).not.toContain('Send Weekly Summary');
  });
});
