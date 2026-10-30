import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usageMeterModel } from '@/lib/usageMeter';

// b89e — the AI Inbox meter printed the raw plan sentinels:
// "999999/∞ searches remaining" on unlimited plans and "0/0" on
// excluded ones. Both read as measured quotas; neither is one.
// The page gate also flashed for every visitor while the plan was
// still resolving (plan reads 'free' mid-load).

describe('b89e — usageMeterModel', () => {
  it('classifies the sentinels honestly', () => {
    expect(usageMeterModel(0, 999999, 999999).kind).toBe('unlimited');
    expect(usageMeterModel(3, 999999, 999996).kind).toBe('unlimited');
    expect(usageMeterModel(0, 0, 0).kind).toBe('excluded');
    expect(usageMeterModel(7, 50, 43)).toEqual({ kind: 'counted', used: 7, limit: 50, remaining: 43 });
  });
});

const page = readFileSync(join(process.cwd(), 'app/dashboard/ai-inbox/page.tsx'), 'utf8');

describe('b89e — the page uses the model and never flashes the gate', () => {
  it('meter and confirm card branch on the model', () => {
    expect(page).toContain('usageMeterModel(used, limit, remaining)');
    expect(page).toContain('AI Inbox — Unlimited searches this month');
    expect(page).toContain('AI Inbox — not included in your current plan');
    expect(page).toContain('Your plan includes unlimited AI Inbox searches this month.');
  });

  it('the plan gate waits for the plan to resolve', () => {
    const loading = page.indexOf('if (planLoading)');
    const gate = page.indexOf('if (isFree)');
    expect(loading).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(loading);
  });

  it('admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
  });
});
