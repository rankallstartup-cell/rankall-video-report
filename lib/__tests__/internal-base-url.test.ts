import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { internalBaseUrl } from '../internalBaseUrl';

describe('internalBaseUrl (D)', () => {
  it('uses the configured app URL origin', () => {
    expect(internalBaseUrl({ NEXT_PUBLIC_APP_URL: 'https://www.rankall.io/' })).toBe('https://www.rankall.io');
    expect(internalBaseUrl({ NEXT_PUBLIC_BASE_URL: 'https://staging.rankall.io/x' })).toBe('https://staging.rankall.io');
  });
  it('falls back to production for missing / malformed / non-http values', () => {
    expect(internalBaseUrl({})).toBe('https://rankall.io');
    expect(internalBaseUrl({ NEXT_PUBLIC_APP_URL: 'not a url' })).toBe('https://rankall.io');
    expect(internalBaseUrl({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' })).toBe('https://rankall.io');
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === '__tests__' || f === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

describe('no CRON_SECRET-bearing fetch derives its host from the request (D)', () => {
  it('routes that send CRON_SECRET never use req.url origin / Host headers', () => {
    const offenders: string[] = [];
    for (const f of walk(join(process.cwd(), 'app'))) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes('CRON_SECRET') || !src.includes('fetch(')) continue;
      if (/new URL\((req|request)\.url\)\.origin|nextUrl\.origin|headers\.get\(['"](host|x-forwarded-host)['"]\)/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
  it('inbox/search uses the fixed base URL', () => {
    expect(readFileSync(join(process.cwd(), 'app/api/inbox/search/route.ts'), 'utf8')).toContain('fetch(`${internalBaseUrl()}/api/scan`');
  });
});
