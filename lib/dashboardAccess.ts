// lib/dashboardAccess.ts
// b01u: ONE map of plan-gated dashboard paths → planConfig dashboardPages
// keys, shared by proxy.ts (server redirect to /pricing) and the dashboard
// sidebar (only link pages the plan can open). Before, the nav linked
// gated pages (SEO Health, Market Index, Playbooks, …) to personal_pro
// users and the proxy bounced every click to /pricing.

export const DASHBOARD_PREFIX_PAGEKEY: ReadonlyArray<{ prefix: string; pageKey: string }> = [
  { prefix: '/dashboard/spend-intelligence', pageKey: 'spend-intelligence' },
  { prefix: '/dashboard/spend-intel',        pageKey: 'spend-intelligence' },
  { prefix: '/dashboard/personal-brand',     pageKey: 'personal-brand'     },
  { prefix: '/dashboard/intelligence',       pageKey: 'intelligence'       },
  { prefix: '/dashboard/seo-health',         pageKey: 'seo-health'         },
  { prefix: '/dashboard/playbooks',          pageKey: 'playbooks'          },
  { prefix: '/dashboard/market-index',       pageKey: 'market-index'       },
  { prefix: '/dashboard/leaderboard',        pageKey: 'leaderboard'        },
  { prefix: '/dashboard/score-history',      pageKey: 'score-history'      },
  { prefix: '/dashboard/agency',             pageKey: 'agency'             },
  { prefix: '/dashboard/enterprise',         pageKey: 'enterprise'         },
  { prefix: '/dashboard/fix',                pageKey: 'fix-engine'         },
  // Item 13: Business-plan tools (pages gate on isBusinessPlan).
  { prefix: '/dashboard/content',            pageKey: 'content-studio'     },
  { prefix: '/dashboard/linkedin',           pageKey: 'linkedin-queue'     },
];

/** True when the plan may open `path` (ungated paths are always open). */
export function canOpenDashboardPath(
  path: string,
  cfg: { canSeeEverything?: boolean; dashboardPages: readonly string[] },
): boolean {
  if (cfg.canSeeEverything) return true;
  for (const route of DASHBOARD_PREFIX_PAGEKEY) {
    if (path.startsWith(route.prefix) && !cfg.dashboardPages.includes(route.pageKey)) return false;
  }
  return true;
}
