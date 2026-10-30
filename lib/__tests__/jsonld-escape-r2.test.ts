import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jsonLdString } from '../jsonLd';

// Fix round 2: /business/[slug] JSON-LD used raw JSON.stringify on DB
// business names ("</script><script>…" closes the tag).
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('JSON-LD escaping', () => {
  it('jsonLdString escapes <', () => {
    const s = jsonLdString({ name: 'Evil</script><script>alert(1)</script>' });
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s).name).toBe('Evil</script><script>alert(1)</script>');
  });
  it('no page injects raw JSON.stringify into dangerouslySetInnerHTML', () => {
    const offenders = [...walk(join(process.cwd(), 'app')), ...walk(join(process.cwd(), 'components'))]
      .filter(f => /dangerouslySetInnerHTML=\{\{\s*__html:\s*JSON\.stringify\(/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
