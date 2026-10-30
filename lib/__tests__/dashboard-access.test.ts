import { describe, it, expect } from 'vitest';
import { canOpenDashboardPath } from '../dashboardAccess';
import { getPlanConfig } from '../planConfig';

// b01u: the sidebar links only what the proxy lets through.
describe('canOpenDashboardPath', () => {
  it('personal_pro cannot open business-only gated pages', () => {
    const cfg = getPlanConfig('personal_pro');
    for (const p of ['/dashboard/seo-health', '/dashboard/market-index', '/dashboard/playbooks', '/dashboard/leaderboard', '/dashboard/spend-intelligence']) {
      expect(canOpenDashboardPath(p, cfg), p).toBe(false);
    }
    for (const p of ['/dashboard', '/dashboard/fix', '/dashboard/score-history', '/dashboard/personal-brand', '/dashboard/ai-inbox']) {
      expect(canOpenDashboardPath(p, cfg), p).toBe(true);
    }
  });
  it('local_pro (business config) opens the tools it is sold with', () => {
    const cfg = getPlanConfig('local_pro');
    for (const p of ['/dashboard/seo-health', '/dashboard/market-index', '/dashboard/playbooks', '/dashboard/leaderboard', '/dashboard/fix']) {
      expect(canOpenDashboardPath(p, cfg), p).toBe(true);
    }
  });
  it('canSeeEverything opens all', () => {
    expect(canOpenDashboardPath('/dashboard/enterprise', { canSeeEverything: true, dashboardPages: [] })).toBe(true);
  });
});
