import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a3 — /dashboard/playbooks + gate-copy honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/playbooks/page.tsx'), 'utf8');
const guard = readFileSync(join(process.cwd(), 'components/PlanGuard.tsx'), 'utf8');

describe('b8a3 — gate copy no longer claims verified-data ranking', () => {
  it('playbooks benefit line states expected impact from estimates', () => {
    expect(guard).toContain('Ranked by expected impact (estimates from fix data)');
    expect(guard).not.toContain('Ranked by verified outcomes data');
  });

  it('the fix-queue benefit line makes the same correction', () => {
    expect(guard).toContain('Ranked by expected impact for your industry');
    expect(guard).not.toContain('Ranked by verified impact for your industry');
  });
});

describe('b8a3 — page gates', () => {
  it('signed-out visitors get a sign-in gate before the plan guard', () => {
    expect(page).toContain('Sign in to view the playbooks');
    expect(page).toContain('/login?next=/dashboard/playbooks');
    expect(page.indexOf('signedIn === false')).toBeLessThan(page.indexOf('<PlanPageGuard'));
  });

  it('admin view is labelled when the upgraded plan differs', () => {
    expect(page).toContain('Admin view:');
    expect(page).toContain('rawPlan');
  });

  it('a tied #1 says joint-highest', () => {
    expect(page).toContain('joint-highest expected impact');
  });
});
