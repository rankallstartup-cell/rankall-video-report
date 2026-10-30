import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/report/page.tsx', 'utf8');

describe('b36k report redesign', () => {
  it('never hardcodes the production share URL or a fabricated rescan date', () => {
    expect(src).not.toContain('https://rankall.io/report');
    expect(src).not.toContain('nextRescan');
    expect(src).not.toContain('30 * 24');
    expect(src).not.toContain('|| 10');
  });
  it('never shows a dead Print/PDF button labeled Download PDF', () => {
    expect(src).not.toMatch(/>\s*Download PDF</);
    expect(src).toContain('Print / PDF');
    expect(src).toContain('generate-pdf');
  });
  it('preserves ax8r failure hardening', () => {
    expect(src).toContain('loadError');
    expect(src).toContain("Couldn't load your report");
    expect(src).toContain('window.location.origin');
    expect(src).toContain('Copy failed — copy the link below');
    expect(src).toContain('On demand — rescan from the dashboard');
    expect(src).toContain('|| 11');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
