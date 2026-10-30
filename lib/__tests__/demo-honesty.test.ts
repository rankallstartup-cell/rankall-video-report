// b8ah — /demo honesty: no false "generating" promise, no dead preview
// link, simulated animation labeled + controllable, dead scan button
// wired, "Takes 20 minutes" labeled an estimate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('demo honesty (b8ah)', () => {
  it('never claims the tour is generating', () => {
    const src = read('app/demo/page.tsx');
    expect(src).not.toContain('generating');
    expect(src).toContain('not recorded yet');
  });

  it('no link promises an animated preview on /demo-video', () => {
    const src = read('app/demo/page.tsx');
    expect(src).not.toContain('Watch animated preview');
    expect(src).not.toContain('href="/demo-video"');
  });

  it('the simulated animation is labeled + has pause/replay controls', () => {
    const src = read('components/HomepageScanVideo.tsx');
    expect(src).toContain('Simulated animation — not a live scan');
    expect(src).toContain('Pause');
    expect(src).toContain('Replay');
  });

  it('"Takes 20 minutes" is labeled an estimate', () => {
    const src = read('components/HomepageScanVideo.tsx');
    expect(src).not.toContain('>Takes 20 minutes<');
    expect(src).toContain('Est. ~20 minutes');
  });

  it('the scan button in the animation is wired, not dead', () => {
    const src = read('components/HomepageScanVideo.tsx');
    expect(src).toContain("window.location.href = '/#scan'");
  });
});
