// Every unsubscribe link in an email template must carry the signed token:
// /api/unsubscribe rejects requests without a valid `token`, so a bare
// `https://rankall.io/unsubscribe` link (email-sequence, personal-monitor,
// welcome-email, outreachTemplates did this) unsubscribes nobody.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// A URL (absolute or `${BASE}`-prefixed) ending in /unsubscribe, plus its query.
const LINK = /(?:https?:\/\/[^\s"'`<>]*?|\$\{[\w.]+\})\/unsubscribe(?![\w-])([^\s"'`<>]*)/g;

describe('email unsubscribe links carry the signed token', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))];

  it('finds the known tokenised links (sanity)', () => {
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all).toMatch(/\/unsubscribe\?email=\$\{encodeURIComponent\(email\)\}&amp;token=/);
  });

  it('no /unsubscribe link without token=', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(LINK)) {
        if (!m[1].includes('token=')) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(ROOT, f)}:${line} ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
