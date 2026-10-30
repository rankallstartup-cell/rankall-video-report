import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88a (E2E data honesty) — what remained live in the PDF after
// the per-page fixes: (1) the closing note invented a service —
// "Your dedicated account manager ... will walk you through,
// begin implementing within 5 business days, deliver a re-scan
// at the 90-day mark" — Rankall is self-serve and verification
// rescans run about 7 days after a fix, not at 90 days;
// (2) platform rows flattened "no response" into "Not Found",
// contradicting the web report's three states for the same scan
// (Mistral on scan 1137f754 had no response recorded).

const route = readFileSync(join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');

describe('b88a — PDF honesty', () => {
  it('no invented account-manager service promises', () => {
    expect(route).not.toContain('dedicated account manager');
    expect(route).not.toContain('within 5 business days');
    expect(route).not.toContain('90-day mark');
    expect(route).toContain('How to use this report');
    expect(route).toContain('verification re-scan (about 7 days later)');
    expect(route).toContain('hello@rankall.io');
  });

  it('platform rows are three-state, matching the web report', () => {
    expect(route).toContain("'Not mentioned'");
    expect(route).toContain("'No response'");
    expect(route).toContain('No response was recorded from this platform in this scan');
    expect(route).toContain('platformMap[p] = null');
    expect(route).not.toContain("'Not Found'");
  });

  it('the roadmap is titled as the implementation plan it is', () => {
    expect(route).toContain('12-Week Implementation Roadmap');
  });
});
