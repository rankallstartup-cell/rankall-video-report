import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

describe('cron auth is uniform, fail-closed and constant-time (H)', () => {
  it('checkCronAuth uses safeEqual (timingSafeEqual), not ===', async () => {
    const src = readFileSync(join(process.cwd(), 'lib/cronAuth.ts'), 'utf8');
    expect(src).toContain('safeEqual(');
    expect(src).not.toMatch(/===\s*`Bearer/);
    const { checkCronAuth } = await import('../cronAuth');
    expect(checkCronAuth('Bearer s3cret', 's3cret')).toBe('ok');
    expect(checkCronAuth('Bearer s3creX', 's3cret')).toBe('unauthorized');
    expect(checkCronAuth(null, 's3cret')).toBe('unauthorized');
    expect(checkCronAuth('Bearer undefined', undefined)).toBe('unconfigured');
  });

  const routes = [
    'app/api/trigger-rescans/route.ts',
    'app/api/cron/winback-email/route.ts',
    'app/api/cron/monthly-roi/route.ts',
    'app/api/cron/expire-trials/route.ts',
    'app/api/milestone-email/route.ts',
    'app/api/rescan-weekly/route.ts',
    'app/api/webhooks/notion-sync/route.ts',
  ];
  it.each(routes)('%s uses the shared cronAuthFailure helper', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).toContain('cronAuthFailure(req)');
    expect(src).not.toMatch(/!==\s*`Bearer \$\{/);
    expect(src).not.toMatch(/bearer\s*!==\s*process\.env\.CRON_SECRET/);
  });

  it('no route compares the cron secret with a plain string compare', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (f === '__tests__' || f === 'node_modules') continue;
        if (statSync(p).isDirectory()) walk(p, out);
        else if (f.endsWith('.ts')) out.push(p);
      }
      return out;
    };
    const re = /(!==|===)\s*`Bearer \$\{|\b(bearer|token)\s*(!==|===)\s*process\.env\.CRON_SECRET/;
    const hits = [...walk(join(process.cwd(), 'app')), ...walk(join(process.cwd(), 'lib'))]
      .filter(f => re.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
