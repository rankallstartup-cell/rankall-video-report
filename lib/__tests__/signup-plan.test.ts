import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { signupPlanFromParam } from '../signupPlan';

describe('signup plan preselect — b876', () => {
  it('free preselects Free, never a paid plan', () => {
    expect(signupPlanFromParam('free')).toEqual({ plan: 'Free', notice: '' });
    expect(signupPlanFromParam(' FREE ')).toEqual({ plan: 'Free', notice: '' });
  });
  it('known keys map to their card', () => {
    expect(signupPlanFromParam('agency').plan).toBe('Agency');
    expect(signupPlanFromParam('personal_pro').plan).toBe('Personal Brand');
    expect(signupPlanFromParam('business').plan).toBe('Local Business');
  });
  it('no param keeps the Local Business default', () => {
    expect(signupPlanFromParam(null).plan).toBe('Local Business');
    expect(signupPlanFromParam('').plan).toBe('Local Business');
  });
  it('unknown values select nothing and explain', () => {
    const r = signupPlanFromParam('platinum');
    expect(r.plan).toBe('');
    expect(r.notice).toContain('platinum');
  });
  it('the page starts with no plan selected until the param is read', () => {
    const src = readFileSync(join(process.cwd(), 'app/signup/page.tsx'), 'utf8');
    expect(src).toContain("useState('');");
    expect(src).toContain('if (step === 1 && !planReady) return;');
    expect(src).not.toContain("useState('Local Business')");
  });
});
