import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b36e: Outreach page redesign is render-only (v2 brand palette ported from
// Paras's dashboard-v2-redesign branch). These tests pin the port:
// the new palette everywhere, no leftover old-palette literals, and the
// one logic regression in Paras's version — a hardcoded `trustScore: 0` in
// the send-email payload — stays rejected.
const SRC_PATH = join(process.cwd(), 'app/dashboard/outreach/page.tsx');
const src = readFileSync(SRC_PATH, 'utf8');

describe('outreach page v2 design port (b36e)', () => {
  it('uses the v2 brand palette', () => {
    expect(src).toContain("NAVY   = '#0A0A14'");
    expect(src).toContain("BLUE   = '#1B17FF'");
    expect(src).toContain('#ECEBFF');
    expect(src).toContain('#C9C6FF');
  });

  it('has no leftover old-palette literals (no mixed old/new design)', () => {
    expect(src).not.toContain('#0F172A');
    expect(src).not.toContain('#2563EB');
    expect(src).not.toContain('#EFF6FF');
    expect(src).not.toContain('#BFDBFE');
  });

  it('rejects the hardcoded trustScore: 0 regression (keeps the honest no-trustScore comment)', () => {
    expect(src).not.toMatch(/trustScore\s*:/);
    expect(src).toContain('No trustScore field');
  });

  it('keeps the honest empty state for outreach history', () => {
    expect(src).toContain('No emails sent yet');
    expect(src).toContain('Find targets above and start your first campaign');
  });

  it('has no placeholder or dead copy', () => {
    // Strip the legitimate HTML placeholder="..." input hints first —
    // those are real UX hints ("e.g. Austin"), not placeholder copy.
    const withoutHints = src.replace(/placeholder="[^"]*"/g, '');
    expect(withoutHints).not.toMatch(/Lorem|TODO|FIXME|Coming soon|Placeholder|dummy/i);
  });

  it('keeps staging logic intact: same API calls, batching, and persistence', () => {
    for (const api of [
      '/api/outreach/history',
      '/api/outreach/find-targets',
      '/api/outreach/find-email',
      '/api/outreach/run-scan',
      '/api/outreach/send-email',
    ]) {
      expect(src).toContain(api);
    }
    expect(src).toContain('BATCH_SIZE');
    expect(src).toContain('rankall_outreach_targets');
    expect(src).toContain('saveTargetsToStorage');
    expect(src).toContain('loadTargetsFromStorage');
  });

  it('keeps every action control (no dead or dropped controls)', () => {
    for (const label of [
      'Find Targets',
      'Find All Emails',
      'Scan All',
      'Send All',
      'Export CSV',
      'Find Email',
      'Run Scan',
      'Send Email',
      'Check Score',
      'Rescan',
    ]) {
      expect(src).toContain(label);
    }
  });
});
