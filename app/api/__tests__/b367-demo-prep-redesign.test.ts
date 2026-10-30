import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/demo-prep/page.tsx', 'utf8');

describe('b367 demo prep redesign', () => {
  it('never calls Anthropic from the browser or exposes the API key', () => {
    expect(src).toContain("fetch('/api/demo-prep/talking-points'");
    // The only api.anthropic.com / NEXT_PUBLIC_ANTHROPIC_API_KEY mentions are
    // staging's own warning comments explaining why the old code was removed.
    // Strip all // comments before checking live code.
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('api.anthropic.com');
    expect(code).not.toContain('NEXT_PUBLIC_ANTHROPIC_API_KEY');
    expect(code).not.toContain("fetch('https://api.anthropic.com");
  });
  it('shows competitor mention share, never a fabricated competitor score', () => {
    expect(src).toContain('competitorMentions');
    expect(src).toContain('Mentioned on');
    expect(src).not.toContain('competitorScore');
    expect(src).not.toContain('+ 20');
  });
  it('uses the canonical revenue model, not the old score-based formula', () => {
    expect(src).toContain('scanRevenueEstimate');
    expect(src).toContain('revenueEstimateBasis');
    expect(src).toContain('Same model as the report.');
    expect(src).not.toContain('getRevenueSymbol');
    expect(src).not.toContain('avgCustomerValue');
  });
  it('surfaces talking-points errors instead of swallowing them', () => {
    expect(src).toContain('tpError');
    expect(src).toContain("data.error ?? 'Talking points generation failed'");
    expect(src).not.toContain('Non-fatal');
  });
  it('keeps the internal demo link', () => {
    expect(src).toContain('/agency/demo');
    expect(src).not.toContain('cal.com');
  });
  it('renders the demo prep sections', () => {
    expect(src).toContain('Demo Prep');
    expect(src).toContain('Talking Points');
    expect(src).toContain('Platform Breakdown');
  });
});
