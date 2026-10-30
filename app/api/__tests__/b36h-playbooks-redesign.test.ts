import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/playbooks/page.tsx', 'utf8');

describe('b36h playbooks redesign', () => {
  it('never invents impact numbers or verified-outcome claims', () => {
    expect(src).not.toContain('verified outcomes');
    expect(src).not.toContain('Avg +');
    expect(src).not.toContain('fix.avg');
    expect(src).not.toContain('fix.count');
    expect(src).not.toContain('highest verified');
    expect(src).not.toContain('#1 citation source');
  });
  it('uses labelled estimates from shared fix metadata', () => {
    expect(src).toContain('canonicalFixImpact');
    expect(src).toContain('knownImpactRangeForFix');
    expect(src).toContain('Est. +');
    expect(src).toContain('estimates from our fix metadata');
    expect(src).toContain('Editorial sequence');
    expect(src).toContain('highest expected impact');
  });
  it('renders the playbooks sections', () => {
    expect(src).toContain('AI Recommendation Playbooks');
    expect(src).toContain('a key citation source');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
