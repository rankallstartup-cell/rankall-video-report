import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89x — /dashboard/linkedin: a logged-out visitor got the
// Business-plan card (a plan message for a login problem) while the
// admin test account saw the full queue — the gate looked
// inconsistent. Order is now: sign-in gate, then the plan gate,
// with the admin bypass labelled.

const page = readFileSync(join(process.cwd(), 'app/dashboard/linkedin/page.tsx'), 'utf8');

describe('b89x — gate order', () => {
  it('signed-out visitors get a sign-in gate, not the plan card', () => {
    expect(page).toContain('Sign in to use the LinkedIn Outreach Queue.');
    expect(page).toContain('/login?next=/dashboard/linkedin');
    // The sign-in gate is checked before the plan gate.
    expect(page.indexOf('if (!userId)')).toBeLessThan(page.indexOf('if (!isBusinessPlan(plan))'));
  });

  it('the plan gate still exists for signed-in accounts below Business', () => {
    expect(page).toContain('LinkedIn Queue is available on Business plan and above.');
  });

  it('the admin bypass is labelled with the real plan', () => {
    expect(page).toContain('Admin view:');
    expect(page).toContain('plan !== rawPlan');
  });
});

describe('b89x — guidance is labelled as guidance', () => {
  it('best-practice numbers carry a not-measured label', () => {
    expect(page).toContain('General guidance — not measured from your account.');
  });
});
