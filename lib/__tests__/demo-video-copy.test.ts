import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8ag: no "real scan" heading over an empty state, no internal config in public copy.
const src = readFileSync(join(process.cwd(), 'app/demo-video/page.tsx'), 'utf8');

describe('/demo-video copy — b8ag', () => {
  it('the heading only promises a real scan when one is shown', () => {
    expect(src).toContain("measured ? 'Watch a real Rankall scan' : 'Demo video coming soon'");
  });
  it('never names environment variables to visitors', () => {
    const visible = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible).not.toMatch(/[A-Z]+_API_KEY/);
    expect(visible).not.toContain('Vercel');
  });
});
