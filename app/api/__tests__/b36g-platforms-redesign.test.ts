import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/platforms/page.tsx', 'utf8');

describe('b36g platforms redesign', () => {
  it('keeps the ax8r failure hardening', () => {
    expect(src).toContain('loadError');
    expect(src).toContain("Couldn't load platform results");
    expect(src).toContain('The platform data failed to load');
  });
  it('gives the error return the main shell', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
  it('renders the platforms sections', () => {
    expect(src).toContain('AI Platform Results');
    expect(src).toContain('Run my first scan');
  });
});
