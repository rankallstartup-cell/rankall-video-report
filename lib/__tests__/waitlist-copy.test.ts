import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8bh: the waitlist copy must always name a plan.
const src = readFileSync(join(process.cwd(), 'app/waitlist/page.tsx'), 'utf8');

describe('/waitlist copy — b8bh', () => {
  it('falls back to a name when ?plan= is missing or unknown', () => {
    expect(src).toContain("PLAN_LABELS[planParam] || 'our next plan'");
    expect(src).toContain("PLAN_LABELS[plan] || 'our next plan'");
    expect(src).not.toContain('PLAN_LABELS[plan] ?? plan}');
  });
});
