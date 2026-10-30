import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Fix round 2: twitter:image (/api/og/report) disagreed with the
// generated og:image on /[industry]/[city].
const dir = join(process.cwd(), 'app/[industry]/[city]');
describe('/[industry]/[city] share images', () => {
  it('twitter-image reuses the opengraph-image generator', () => {
    expect(existsSync(join(dir, 'twitter-image.tsx'))).toBe(true);
    expect(readFileSync(join(dir, 'twitter-image.tsx'), 'utf-8')).toContain("from './opengraph-image'");
  });
  it('metadata no longer points twitter/og at /api/og/report', () => {
    const page = readFileSync(join(dir, 'page.tsx'), 'utf-8');
    expect(page).not.toContain('/api/og/report');
    expect(page).not.toMatch(/images:\s*\[ogUrl\]/);
  });
});
