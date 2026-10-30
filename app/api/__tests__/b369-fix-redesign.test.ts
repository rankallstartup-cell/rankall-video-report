import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/fix/page.tsx', 'utf8');

describe('b369 fix engine redesign', () => {
  it('never invents competitor measurements', () => {
    expect(src).toContain('We have NOT measured');
    expect(src).toContain('For measured competitor data, run a competitor scan from the Competitor page.');
    expect(src).not.toContain('likely yes');
    expect(src).not.toContain('Run a fresh scan for exact');
  });
  it('keeps every failure state instead of swallowing errors', () => {
    for (const s of ['scanError', 'fetchKey', 'pendingError', 'approvedError', 'appliedError', 'reviewError', 'copyError']) {
      expect(src).toContain(s);
    }
    expect(src).toContain('Could not save that review');
    expect(src).toContain('Could not mark that fix as applied');
    expect(src).not.toContain('non-fatal');
  });
  it('uses the canonical impact computation, not hardcoded values', () => {
    expect(src).toContain('canonicalFixImpact');
    expect(src).toContain('projectScore');
    expect(src).not.toContain('Based on similar verified outcomes');
  });
  it('keeps the ax8r tool ids the progress dots match on', () => {
    expect(src).toContain("tool: 'faq'");
    expect(src).toContain("tool: 'schema'");
    expect(src).toContain("tool: 'review'");
    expect(src).toContain("tool: 'reddit'");
    expect(src).toContain("tool: 'directory'");
  });
  it('renders the fix engine sections', () => {
    expect(src).toContain('Fix Engine');
    expect(src).toContain('showTrustGuide');
    expect(src).toContain('Approve without name');
  });
  it('gives the scan-error return the main shell', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
