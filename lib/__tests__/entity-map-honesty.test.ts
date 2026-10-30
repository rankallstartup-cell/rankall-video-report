// b8aj — /entity-map honesty: headline counts come from the canonical
// exports (TRUST_SIGNAL_COUNT, FIX_TYPE_COUNT), and the "47 customers"
// wound example is labeled illustrative.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('entity-map honesty (b8aj)', () => {
  it('counts derive from the canonical exports, never hardcoded', () => {
    const src = read('app/entity-map/page.tsx');
    expect(src).toContain('TRUST_SIGNAL_COUNT');
    expect(src).toContain('FIX_TYPE_COUNT');
    expect(src).not.toContain('131 prioritized');
    expect(src).not.toContain('32 structured');
  });

  it('the wound example is labeled illustrative', () => {
    const src = read('app/entity-map/page.tsx');
    expect(src).toContain('illustrative "AI sent 47 customers to competitors"');
  });
});
