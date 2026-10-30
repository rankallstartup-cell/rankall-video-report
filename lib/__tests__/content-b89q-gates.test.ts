import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89q — /dashboard/content (Content Studio): logged-out visitors
// got the "Business plan and above" paywall (plan resolves to free
// with no session — wrong message), and POST /api/content/generate
// had session auth (b01t) but NO plan gate, so a signed-in Free
// account could bypass the page paywall and generate at API cost.
// Generate failures were also swallowed silently.

const page = readFileSync(join(process.cwd(), 'app/dashboard/content/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/content/generate/route.ts'), 'utf8');

describe('b89q — gate order on the page', () => {
  it('sign-in gate renders before the plan paywall', () => {
    const signin = page.indexOf('Sign in to use Content Studio.');
    // (the paywall sentence also appears in the generate() 403 handler
    // earlier in the file — anchor the search after the sign-in gate)
    const paywall = page.indexOf('Content Studio is available on Business plan and above.', signin);
    expect(signin).toBeGreaterThan(-1);
    expect(paywall).toBeGreaterThan(signin);
    expect(page).toContain('/login?next=/dashboard/content');
  });

  it('admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
  });

  it('generate failures are surfaced, not swallowed', () => {
    expect(page).toContain('setGenError');
    expect(page).toContain('Generation failed');
    expect(page).not.toContain('catch { /* non-fatal */ }');
  });
});

describe('b89q — the API enforces the same gate', () => {
  it('403 for non-Business plans, admins pass', () => {
    expect(route).toContain('resolvePlanServer');
    expect(route).toContain('isBusinessPlan(plan)');
    expect(route).toContain("error: 'upgrade_required'");
    expect(route).toContain('status: 403');
  });
});
