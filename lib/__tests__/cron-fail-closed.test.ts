/* eslint-disable @typescript-eslint/no-explicit-any -- loose request mocks */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('must not reach the DB without auth'); },
}));

function req(headers: Record<string, string> = {}): any {
  return { headers: new Headers(headers), json: async () => ({}), cookies: { getAll: () => [] } };
}

beforeEach(() => { delete process.env.CRON_SECRET; });

describe('blog/generate and market-index/generate fail closed', () => {
  it('blog/generate: CRON_SECRET unset + "Bearer undefined" → 500', async () => {
    const { POST } = await import('@/app/api/blog/generate/route');
    const res = await POST(req({ authorization: 'Bearer undefined' }));
    expect(res.status).toBe(500);
  });
  it('blog/generate: wrong secret → 401', async () => {
    process.env.CRON_SECRET = 's3cret';
    const { POST } = await import('@/app/api/blog/generate/route');
    expect((await POST(req({ authorization: 'Bearer nope' }))).status).toBe(401);
  });
  it('market-index/generate exports GET (Vercel Cron) and fails closed', async () => {
    const mod = await import('@/app/api/market-index/generate/route');
    expect(typeof mod.GET).toBe('function');
    expect((await mod.GET(req({ authorization: 'Bearer undefined' }))).status).toBe(500);
    process.env.CRON_SECRET = 's3cret';
    expect((await mod.GET(req({ 'x-vercel-cron': '1' }))).status).toBe(401);
  });
});

describe('repo sweep', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === '__tests__' || name === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  const files = walk(join(process.cwd(), 'app'));
  it('no route compares the auth header to `Bearer ${CRON_SECRET}` without an unset guard', () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      if (!/!==\s*`Bearer \$\{process\.env\.CRON_SECRET\}`/.test(s)) return false;
      return !/if \(!process\.env\.CRON_SECRET\)/.test(s);
    });
    expect(offenders).toEqual([]);
  });
  it('no route accepts x-vercel-cron as auth', () => {
    const offenders = files.filter((f) => /headers\.get\(['"]x-vercel-cron['"]\)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('every vercel.json cron path exports GET', () => {
    const v = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    const missing = (v.crons ?? []).map((c: { path: string }) => c.path.split('?')[0]).filter((p: string) => {
      const s = readFileSync(join(process.cwd(), 'app', p, 'route.ts'), 'utf8');
      return !/export (async function|const) GET/.test(s);
    });
    expect(missing).toEqual([]);
  });
});
