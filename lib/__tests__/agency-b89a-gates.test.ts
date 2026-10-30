import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89a — /dashboard/agency: the full Agency Dashboard rendered for
// logged-out visitors and Free accounts; the client-management
// routes checked only the session. (explain-fix already gated
// server-side — the precedent this follows.)

const page = readFileSync(join(process.cwd(), 'app/dashboard/agency/page.tsx'), 'utf8');
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('b89a — agency dashboard gates', () => {
  it('page: sign-in gate + PlanPageGuard + admin note', () => {
    expect(page).toContain('Sign in to view your Agency Dashboard.');
    expect(page).toContain('/login?next=/dashboard/agency');
    expect(page).toContain('<PlanPageGuard feature="canSeeAgency" requiredPlan="agency">');
    expect(page).toContain('plan !== rawPlan');
  });

  it('client routes: every authenticated handler is plan-gated', () => {
    const gated = [
      'app/api/agency/clients/route.ts',
      'app/api/agency/add-client/route.ts',
      'app/api/agency/remove-client/route.ts',
      'app/api/agency/rescan-client/route.ts',
      'app/api/agency/invite/route.ts',
    ];
    for (const f of gated) expect(read(f)).toContain('agencyPlanGate(userId)');
    // clients has GET + POST + DELETE
    expect(read('app/api/agency/clients/route.ts').match(/agencyPlanGate\(userId\)/g)?.length).toBe(3);
  });

  it('the public invite-token validation stays public', () => {
    const invite = read('app/api/agency/invite/route.ts');
    const get = invite.slice(invite.indexOf('export async function GET'));
    expect(get).not.toContain('agencyPlanGate');
  });
});
