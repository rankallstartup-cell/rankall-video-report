import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b88p: launch-readiness checks describe what the app actually does.
const src = readFileSync(join(process.cwd(), 'app/admin/launch-readiness/LaunchReadiness.tsx'), 'utf8');

describe('launch readiness copy — b88p', () => {
  it('counts come from the code, not stale literals', () => {
    expect(src).toContain('`${TRUST_SIGNAL_COUNT} signals shown in categories`');
    expect(src).toContain('All 6 tabs work');
  });
  it('the Stripe check says what a pass means', () => {
    expect(src).toContain('Stripe checkout or waitlist mode');
  });
});
