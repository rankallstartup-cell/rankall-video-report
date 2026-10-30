import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UNLIMITED_LIMIT, usageBarPercent } from '../usageDisplay';

describe('/dashboard/usage — b8af', () => {
  it('unlimited and zero-limit bars stay empty', () => {
    expect(usageBarPercent(0, UNLIMITED_LIMIT)).toBe(0);
    expect(usageBarPercent(40, UNLIMITED_LIMIT)).toBe(0);
    expect(usageBarPercent(0, 0)).toBe(0);
  });
  it('metered bars fill by use and cap at 100', () => {
    expect(usageBarPercent(0, 50)).toBe(0);
    expect(usageBarPercent(18, 200)).toBe(9);
    expect(usageBarPercent(250, 200)).toBe(100);
  });
  it('the page labels the real plan, not the admin override', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/usage/page.tsx'), 'utf8');
    expect(src).toContain('getPlanMeta(rawPlan)');
    expect(src).not.toContain('getPlanMeta(plan)');
    expect(src).toContain('Not counted (admin)');
  });
});
