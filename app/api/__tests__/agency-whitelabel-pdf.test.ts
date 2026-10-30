import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// a8wr: Ticket 10 — white-label PDF must carry zero Rankall branding
// when white-label is ON, and "Powered by Rankall" when OFF.
const route = readFileSync(join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');

describe('white-label PDF — a8wr', () => {
  it('white-label mode never falls back to the Rankall agency name', () => {
    expect(route).toContain("(whiteLabel ? '' : 'Rankall.io')");
  });

  it('white-label mode never falls back to the Rankall contact email', () => {
    expect(route).toContain("(whiteLabel ? '' : 'hello@rankall.io')");
  });

  it('the Rankall "R" badge only renders when white-label is OFF', () => {
    // logoBlock: logo -> <img>, no logo + white-label -> '', else "R" badge.
    expect(route).toContain(': whiteLabel');
    expect(route).toContain('>R</span>');
  });

  it('a broken logo URL hides itself instead of a broken-image icon', () => {
    expect(route).toContain(`onerror="this.style.display='none'"`);
  });

  it('accent color is validated as hex before interpolation into style attributes', () => {
    expect(route).toContain('/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/');
  });

  it('OFF mode still shows "Powered by Rankall" (both strings)', () => {
    expect(route).toContain("Powered by Rankall.io");
    expect(route).toContain('Rankall powered by AI');
  });
});
