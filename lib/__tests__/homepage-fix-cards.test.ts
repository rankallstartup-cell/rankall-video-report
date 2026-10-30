import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalFixImpact } from '../fixIntelligence';

// Item 2: the homepage fix cards showed hardcoded +18/+16/+22/+20/+14/+19
// and +16/+12/+10/+8 pts on every visitor's results, plus "#1 signal" /
// "3× more" claims. Each card now uses canonicalFixImpact(fixType), labelled
// as an estimate.
describe('homepage fix cards use the canonical impact', () => {
  const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  const start = src.indexOf('{/* 4 — FIX #1 (fully free, generated content inline) */}');
  const end = src.indexOf('{/* Fix #2 — blurred */}');
  const block = src.slice(start, end);

  it('no hardcoded point values or superlative claims in the fix-card block', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).not.toMatch(/pts: '\+\d+ pts'/);
    expect(block).not.toContain('#1 trust signal');
    expect(block).not.toContain('#1 factor');
    expect(block).not.toContain('3× more');
    expect(block).not.toContain('8+ platforms');
    expect(block).toContain("fixEstimateLabel('faq_schema')");
    expect(block).toContain("fixEstimateLabel('citation_finder')");
    expect(block).toContain("fixEstimateLabel('reddit_contribution')");
  });

  it('every card type has a canonical estimate, labelled as such', () => {
    for (const ft of ['faq_schema', 'local_business_schema', 'citation_finder', 'review_response', 'content_optimizer', 'reddit_contribution']) {
      expect(canonicalFixImpact(ft)).toBeGreaterThan(0);
    }
    expect(src).toContain('return pts == null ? null : `Est. +${pts} pts`;');
  });
});
