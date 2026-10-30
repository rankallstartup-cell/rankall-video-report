import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ADMIN_EMAILS, isAdminUser } from '../planConfig';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('single admin allowlist (item 17)', () => {
  it('isAdminUser is case/space-insensitive and rejects empties', () => {
    expect(isAdminUser(' Nandish@Rankall.io ')).toBe(true);
    expect(isAdminUser('someone@example.com')).toBe(false);
    expect(isAdminUser('')).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
  it('no other file compares against an admin email literal (no parallel allowlists)', () => {
    const root = process.cwd();
    const files = [...walk(join(root, 'app')), ...walk(join(root, 'lib')), ...walk(join(root, 'components')), join(root, 'proxy.ts')]
      .filter((f) => !f.endsWith('lib/planConfig.tsx') && !f.includes('admin/qa-checklist'));
    const offenders: string[] = [];
    for (const f of files) {
      let s: string;
      try { s = readFileSync(f, 'utf8'); } catch { continue; }
      for (const e of ADMIN_EMAILS) {
        const esc = e.replace(/[.@]/g, (c) => `\\${c}`);
        if (new RegExp(`(===|!==|includes\\()\\s*['"\`]${esc}`).test(s) || new RegExp(`['"\`]${esc}['"\`]\\s*(===|!==)`).test(s)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('the old public cron secret literal is gone from docs', () => {
    for (const f of ['TESTING.md', 'docs/n8n-personalized-video-outreach.json']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).not.toContain('rankall-cron-2026-secure');
    }
  });
});
