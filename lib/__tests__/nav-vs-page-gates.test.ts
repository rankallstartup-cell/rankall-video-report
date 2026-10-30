import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canOpenDashboardPath } from '../dashboardAccess';
import { getPlanConfig, isBusinessPlan, isAgencyPlan, normalizePlan } from '../planConfig';

// Item 13: personal_pro's nav showed Content Studio + LinkedIn Queue whose
// pages say "available on Business plan". For EVERY plan, every nav link
// that survives the access filter must open a page that plan passes.
const ROOT = process.cwd();
const layout = readFileSync(join(ROOT, 'app/dashboard/layout.tsx'), 'utf8');

function hrefsIn(text: string): string[] {
  return [...text.matchAll(/href: '([^']+)'/g)].map(m => m[1]);
}
const toolsBlock = layout.slice(layout.indexOf('const TOOLS_NAV'), layout.indexOf('const NAV_STRUCTURE'));
const seoHref = (layout.match(/const SEO_HEALTH_NAV[^\n]*href: '([^']+)'/) ?? [])[1];

function navHrefs(key: string): string[] {
  const start = layout.indexOf(`\n  ${key}: [`);
  if (start < 0) return [];
  const rest = layout.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z_]+: \[|\n\};/);
  const block = rest.slice(0, next + 1);
  const hrefs = hrefsIn(block);
  if (block.includes('...TOOLS_NAV')) hrefs.push(...hrefsIn(toolsBlock));
  if (block.includes('SEO_HEALTH_NAV') && seoHref) hrefs.push(seoHref);
  return hrefs.filter(h => h.startsWith('/dashboard'));
}

type Gate = (plan: string) => boolean;
function pageGate(href: string): Gate | 'admin' | null {
  const file = join(ROOT, 'app', ...href.replace(/^\//, '').split('/'), 'page.tsx');
  if (!existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');
  if (src.includes('useAdminGuard(')) return 'admin';
  if (/if \(!isBusinessPlan\(plan\)\)/.test(src)) return (p) => isBusinessPlan(p);
  if (/if \(!isAgencyPlan\(plan\)\)/.test(src)) return (p) => isAgencyPlan(p);
  const guard = src.match(/<PlanPageGuard feature="([A-Za-z]+)"/);
  if (guard) {
    const feature = guard[1];
    return (p) => {
      const cfg = getPlanConfig(p) as unknown as Record<string, unknown>;
      return cfg.canSeeEverything === true || cfg[feature] === true;
    };
  }
  return null;
}

const PLANS = ['free', 'starter', 'personal_pro', 'business', 'local_pro', 'local_pro_seo', 'agency', 'agency_seo', 'enterprise', 'government'];

describe('every plan: nav links ⊆ pages the plan can open', () => {
  it.each(PLANS)('%s', (plan) => {
    const navKey = normalizePlan(plan);
    const cfg = getPlanConfig(navKey);
    const visible = navHrefs(navKey).filter(h => canOpenDashboardPath(h, cfg));
    expect(visible.length).toBeGreaterThan(0);
    for (const href of visible) {
      const gate = pageGate(href);
      expect(gate, `${plan}: ${href} is admin-only`).not.toBe('admin');
      if (typeof gate === 'function') expect(gate(navKey), `${plan}: nav shows ${href} but the page gates it`).toBe(true);
    }
  });

  it('personal_pro does not see Content Studio / LinkedIn Queue; business does', () => {
    const pp = getPlanConfig('personal_pro');
    expect(canOpenDashboardPath('/dashboard/content', pp)).toBe(false);
    expect(canOpenDashboardPath('/dashboard/linkedin', pp)).toBe(false);
    for (const p of ['business', 'local_pro', 'local_pro_seo', 'agency', 'agency_seo', 'enterprise']) {
      expect(canOpenDashboardPath('/dashboard/content', getPlanConfig(p)), p).toBe(true);
      expect(canOpenDashboardPath('/dashboard/linkedin', getPlanConfig(p)), p).toBe(true);
    }
  });

  it('content/linkedin access matches isBusinessPlan for every plan', () => {
    for (const p of PLANS) {
      expect(canOpenDashboardPath('/dashboard/content', getPlanConfig(p)), p).toBe(isBusinessPlan(p));
    }
  });
});
