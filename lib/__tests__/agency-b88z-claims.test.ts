import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88z — /agency promised "Unlimited client accounts" (4x) while
// /pricing, the PlanGuard card, and the admin plan-switcher all
// said "25 client accounts". The CODE is the tiebreaker: no route
// or limit caps the NUMBER of client accounts (agency_client_scan
// 1000/mo limits client SCANS, not accounts). All surfaces now
// state the enforced truth. The comparison table also asserted
// competitor facts with no source — now dated + sourced.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('b88z — one client-account claim everywhere', () => {
  it('no surface states a 25-account cap the product does not enforce', () => {
    expect(read('app/pricing/PricingClient.tsx')).not.toContain('25 client accounts');
    expect(read('components/PlanGuard.tsx')).not.toContain('up to 25 client accounts');
    expect(read('app/admin/plan-switcher/page.tsx')).not.toContain('25 client accounts');
  });

  it('the unlimited claim matches on pricing and the guard card', () => {
    expect(read('app/pricing/PricingClient.tsx')).toContain('Unlimited client accounts');
    expect(read('components/PlanGuard.tsx')).toContain('Manage unlimited client accounts');
    expect(read('app/agency/page.tsx')).toContain('Unlimited client accounts');
  });

  it('the comparison table carries its source + date', () => {
    expect(read('app/agency/page.tsx')).toContain("Competitor details from RankPrompt&apos;s public pages, checked October 2026");
  });
});
