import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/outreach/page.tsx', 'utf8');
// Strip // comment lines: staging's own comment names the trustScore field
// it removed — that mention is not live code.
const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

describe('b36e outreach redesign', () => {
  it('never sends a fabricated trustScore', () => {
    expect(code).not.toContain('trustScore');
  });
  it('keeps all five outreach endpoints', () => {
    expect(src).toContain('/api/outreach/send-email');
    expect(src).toContain('/api/outreach/find-targets');
    expect(src).toContain('/api/outreach/find-email');
    expect(src).toContain('/api/outreach/run-scan');
    expect(src).toContain('/api/outreach/history');
  });
  it('renders the outreach sections', () => {
    expect(src).toContain('Cold Outreach');
    expect(src).toContain('Campaign Setup');
    expect(src).toContain('Outreach History');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
