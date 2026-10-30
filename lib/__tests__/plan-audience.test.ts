import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planForAuthUser, loadLiveSubscriptions, type SubRow } from '../planAudience';

describe('planForAuthUser — never user_metadata', () => {
  const subs = new Map<string, SubRow>([
    ['paid', { user_id: 'paid', plan: 'business', status: 'active' }],
    ['expired', { user_id: 'expired', plan: 'business', status: 'trialing', trial_end: '2000-01-01T00:00:00Z' }],
  ]);

  it('self-granted user_metadata.account_type resolves to free', () => {
    const u = { id: 'x', user_metadata: { account_type: 'agency' }, app_metadata: {} };
    expect(planForAuthUser(u, subs)).toBe('free');
  });
  it('subscriptions row wins', () => {
    expect(planForAuthUser({ id: 'paid', app_metadata: {} }, subs)).toBe('business');
  });
  it('expired trial is free even with app_metadata', () => {
    expect(planForAuthUser({ id: 'expired', app_metadata: { account_type: 'business' } }, subs)).toBe('free');
  });
  it('app_metadata is the fallback', () => {
    expect(planForAuthUser({ id: 'y', app_metadata: { account_type: 'agency' } }, subs)).toBe('agency');
  });
  it('loadLiveSubscriptions fails soft', async () => {
    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }) };
    expect((await loadLiveSubscriptions(sb)).size).toBe(0);
  });
});

describe('crons + scan route no longer read plan/pause from user_metadata', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const files = ['app/api/cron/re-engagement/route.ts', 'app/api/cron/monthly-roi/route.ts', 'app/api/cron/referral-invite/route.ts', 'lib/weeklyReport.ts'];
  for (const f of files) {
    it(`${f} has no user_metadata.account_type read`, () => {
      expect(read(f)).not.toMatch(/user_metadata\?\.account_type/);
    });
  }
  it('scan route reads pause state from app_metadata first', () => {
    const s = read('app/api/scan/route.ts');
    expect(s).toContain('am?.account_paused === true');
    expect(s).not.toMatch(/const pausedFlag = um\?\.account_paused === true;/);
  });
  it('backfill migration never copies from user_metadata', () => {
    const sql = read('supabase/migrations/20261016000200_backfill_app_metadata_plan.sql')
      .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/raw_user_meta_data|user_metadata/);
    expect(sql).toContain("status IN ('active','trialing','past_due')");
  });
});
