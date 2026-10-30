import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax75 residual: (1) publicStats called the $39 tier "Local Business
// Pro" while the founder-set canonical name (llms-full.txt, pricing
// truth) is "Local Pro". (2) The Personal page still promised
// "Results in 60 seconds" / "in 60 seconds" — the same overpromise
// ax75 removed from the homepage (the personal scan makes several
// sequential fetches and can run past 60s).
describe('ax75 residual: tier label + personal timing', () => {
  it('publicStats uses the canonical tier name Local Pro', () => {
    const src = readFileSync(join(process.cwd(), 'lib/publicStats.ts'), 'utf-8');
    expect(src).toContain("{ name: 'Local Pro', monthly: 39");
    expect(src).not.toContain('Local Business Pro');
  });
  it('Personal page makes no 60-second promise', () => {
    const src = readFileSync(join(process.cwd(), 'app/personal/PersonalClient.tsx'), 'utf-8');
    expect(src).not.toMatch(/60 seconds/i);
    // Trial collects the card upfront (payment_method_collection: always),
    // so the old "No credit card" copy this test asserted was itself false.
    expect(src).not.toMatch(/no credit card/i);
    expect(src).toContain('7-day free trial');
    expect(src).toContain('Find out what AI says about you</h2>');
  });
});
