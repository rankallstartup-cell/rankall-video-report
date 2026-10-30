// b8ag — /demo-video honesty: no "real scan" promise when nothing is
// recorded; no internal config names shown to public visitors.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('demo-video honesty (b8ag)', () => {
  it('never promises a real scan unconditionally, never leaks config names', () => {
    const src = read('app/demo-video/page.tsx');
    expect(src).not.toContain('ELEVENLABS_API_KEY');
    expect(src).not.toContain('set in Vercel');
    expect(src).not.toContain('>Watch a real Rankall scan<');
  });

  it('the "real scan" heading only renders when a measured demo exists', () => {
    const src = read('app/demo-video/page.tsx');
    // Gating intact; only the else-branch copy changed (it now says the
    // demo is coming soon instead of offering a generic walkthrough).
    expect(src).toContain("measured ? 'Watch a real Rankall scan' : 'Demo video coming soon'");
  });

  it('metadata does not promise a real scan', () => {
    const src = read('app/demo-video/page.tsx');
    expect(src).not.toContain('Watch a Real Rankall Scan');
    expect(src).not.toContain('answer a real customer search');
  });
});
