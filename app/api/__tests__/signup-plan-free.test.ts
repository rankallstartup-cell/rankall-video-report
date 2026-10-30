import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax6q: /signup?plan=free silently fell through to the $39 'Local Business
// Pro' default — the ?plan= map had no 'free' key and the signup page had no
// Free option, even though the pricing page sells Free ($0/forever, 3
// scans/month) and links to /signup?plan=free. Free IS a canonical plan
// (PLAN_LIMITS.free, normalizePlan('free') === 'free'), so signup must honor
// it. Source-level checks: the signup page is a client component.
// b876: the ?plan= map moved to lib/signupPlan.ts (shared + unit-tested).
const signupSrc = readFileSync(join(process.cwd(), 'app/signup/page.tsx'), 'utf8')
  + readFileSync(join(process.cwd(), 'lib/signupPlan.ts'), 'utf8');
const onboardingSrc = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8');

describe('signup ?plan=free — ax6q pricing truth', () => {
  it("maps plan=free to the Free option, not the $39 default", () => {
    expect(signupSrc).toContain("free: 'Free'");
  });

  it('offers a Free option in the plan list (so free can actually be selected)', () => {
    expect(signupSrc).toContain("{ name: 'Free'");
  });

  it('never promises a 7-day free trial to a Free selection', () => {
    expect(signupSrc).toContain("'Start free'");
    expect(signupSrc).toContain("'Free forever'");
    expect(signupSrc).toContain("'Create Free Account'");
  });

  it('shows a visible notice for an unknown ?plan= instead of silently defaulting to $39', () => {
    expect(signupSrc).toContain('planNotice');
    expect(signupSrc).toContain('role="alert"');
    expect(signupSrc).toContain("We don't offer");
  });

  it('records a Free intent as free, not local_pro', () => {
    expect(signupSrc).toContain("p === 'free' ? 'free'");
  });

  it('does not prompt a Free user to complete a paid checkout after onboarding', () => {
    expect(onboardingSrc).toContain("intendedPlan !== 'free'");
  });
});

// ax6q follow-up (PR #44 live check): the visible warning for an unknown
// ?plan= was present, but the $39 'Local Business Pro' plan was STILL
// preselected underneath it (useState default survived the unknown-param
// branch), with heading "Start your 7-day free trial" and CTA "Continue with
// Local Business Pro". Warning + $39 preselection contradict each other —
// an unknown plan must clear the selection entirely.
describe('signup unknown ?plan= — no $39 preselection behind the warning', () => {
  it('clears the selection on an unknown ?plan= value', () => {
    expect(signupSrc).toContain("plan: ''");
    expect(signupSrc).toContain('setPlan(picked.plan)');
  });

  it('shows a neutral heading when no plan is selected, never trial copy', () => {
    expect(signupSrc).toContain("'Pick a plan to get started'");
  });

  it('shows a disabled pick-a-plan CTA when no plan is selected', () => {
    expect(signupSrc).toContain('Pick a plan to continue');
    expect(signupSrc).toContain('<button disabled');
  });

  it('blocks advancing from step 1 with no plan selected', () => {
    expect(signupSrc).toContain('step === 1 && !plan');
  });
});
