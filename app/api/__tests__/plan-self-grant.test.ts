import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b062: self-grant via user_metadata — no security resolver may trust it.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const planConfig = read('lib/planConfig.tsx');
const proxy = read('proxy.ts');
const usePlan = read('lib/usePlan.ts');
const resolvePlan = read('lib/resolvePlanServer.ts');
const inbox = read('app/api/inbox/search/route.ts');
const webhook = read('app/api/billing/webhook/route.ts');
const switchPlan = read('app/api/admin/switch-plan/route.ts');

// user_metadata must never feed a plan decision. Comments may mention
// the bare name, but no read of its account_type may remain.
const NO_META_READ = /user_metadata\s*\?\.\s*account_type|user_metadata\.account_type/;

describe('plan self-grant — b062', () => {
  it('one shared cascade exists', () => {
    expect(planConfig).toContain('export function resolvePlanFromSources');
    expect(planConfig).toContain('NEVER trust');
  });

  it('proxy resolves plan via the shared cascade, never user metadata', () => {
    expect(proxy).toContain('resolvePlanForProxy');
    expect(proxy).toContain('resolvePlanFromSources');
    expect(proxy).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(proxy).not.toMatch(NO_META_READ);
  });

  it('usePlan uses the shared cascade, no metadata/profiles fallback', () => {
    expect(usePlan).toContain('resolvePlanFromSources');
    expect(usePlan).not.toContain('extractPlanFromMeta');
    expect(usePlan).not.toMatch(NO_META_READ);
    expect(usePlan).not.toContain("from('profiles')");
    expect(usePlan).not.toContain('refreshSession');
  });

  it('resolvePlanServer uses the shared cascade, no metadata/profiles fallback', () => {
    expect(resolvePlan).toContain('resolvePlanFromSources');
    expect(resolvePlan).not.toMatch(NO_META_READ);
    expect(resolvePlan).not.toContain("from('profiles')");
  });

  it('inbox/search gate uses the shared cascade, no metadata/profiles fallback', () => {
    expect(inbox).toContain('resolvePlanFromSources');
    expect(inbox).not.toMatch(NO_META_READ);
    expect(inbox).not.toContain("from('profiles')");
  });

  it('writers land grants in app_metadata (the trusted field)', () => {
    expect(webhook).toContain('syncPlanMetadata');
    expect(webhook).not.toContain('syncUserMetadata');
    expect(webhook).toContain('app_metadata:');
    expect(switchPlan).toContain('app_metadata: { account_type: plan }');
  });
});

describe('resolvePlanFromSources — b062', () => {
  it('subscriptions row wins; app_metadata is the fallback; else free', async () => {
    const { resolvePlanFromSources } = await import('@/lib/planConfig');
    expect(resolvePlanFromSources({ plan: 'agency', status: 'active', trial_end: null }, {})).toBe('agency');
    expect(resolvePlanFromSources(null, { account_type: 'agency' })).toBe('agency');
    expect(resolvePlanFromSources(null, {})).toBe('free');
    expect(resolvePlanFromSources(null, { account_type: 'not-a-plan' })).toBe('free');
    // Row without a plan falls through to app_metadata.
    expect(resolvePlanFromSources({ plan: null, status: 'active', trial_end: null }, { account_type: 'agency' })).toBe('agency');
  });

  it('expired trial grants nothing — no fallback to app_metadata', async () => {
    const { resolvePlanFromSources } = await import('@/lib/planConfig');
    const past = new Date(Date.now() - 1000).toISOString();
    expect(resolvePlanFromSources({ plan: 'agency', status: 'trialing', trial_end: past }, { account_type: 'agency' })).toBe('free');
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(resolvePlanFromSources({ plan: 'agency', status: 'trialing', trial_end: future }, {})).toBe('agency');
  });

  it('legacy plan names normalize', async () => {
    const { resolvePlanFromSources } = await import('@/lib/planConfig');
    expect(resolvePlanFromSources({ plan: 'local_pro', status: 'active', trial_end: null }, {})).toBe('business');
    expect(resolvePlanFromSources(null, { account_type: 'local_pro' })).toBe('business');
  });
});
