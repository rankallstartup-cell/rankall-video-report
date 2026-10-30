import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sanitizeQueryBasket, isValidQueryText, invalidQueryField, generateQueryVariations, QUERIES_PER_SCAN, MAX_QUERY_LENGTH } from '../queryVariations';

describe('query basket sanitising (A)', () => {
  it('QUERIES_PER_SCAN matches the generated basket size', () => {
    expect(generateQueryVariations('best dentist in Austin')).toHaveLength(QUERIES_PER_SCAN);
  });
  it('caps an oversized basket at the per-scan count', () => {
    const big = Array.from({ length: 500 }, (_, i) => `query ${i}`);
    expect(sanitizeQueryBasket(big)).toHaveLength(QUERIES_PER_SCAN);
  });
  it('rejects a basket with any non-string / too-long / control-char entry', () => {
    expect(sanitizeQueryBasket(['ok', 42])).toBeNull();
    expect(sanitizeQueryBasket(['ok', 'x'.repeat(MAX_QUERY_LENGTH + 1)])).toBeNull();
    expect(sanitizeQueryBasket(['ok', 'evil\u0000'])).toBeNull();
    expect(sanitizeQueryBasket(['ok', 'line\nbreak'])).toBeNull();
    expect(sanitizeQueryBasket('not an array')).toBeNull();
    expect(sanitizeQueryBasket([])).toBeNull();
  });
  it('dedupes and trims', () => {
    expect(sanitizeQueryBasket([' a ', 'A', 'b'])).toEqual(['a', 'b']);
  });
  it('isValidQueryText / invalidQueryField', () => {
    expect(isValidQueryText('best dentist in Austin')).toBe(true);
    expect(isValidQueryText({})).toBe(false);
    expect(invalidQueryField({ name: 'Jane', city: undefined, state: '' })).toBeNull();
    expect(invalidQueryField({ name: 'Jane', city: 'x'.repeat(101) })).toBe('city');
    expect(invalidQueryField({ name: ['array'] })).toBe('name');
  });
});

describe('scan route wiring (A/E)', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');
  it('only internal callers may supply queries_used, and it is sanitised', () => {
    expect(src).toContain('const lockedBasket = internalCall ? sanitizeQueryBasket(lockedQueriesParam) : null;');
    expect(src).not.toMatch(/lockedQueriesParam as string\[\]/);
    expect(src).toContain('canonical = sanitizeQueryBasket(');
  });
  it('validates input type/length BEFORE input.toLowerCase()', () => {
    const validate = src.indexOf("if (typeof input !== 'string' || !input.trim())");
    const lower = src.indexOf('input.toLowerCase()');
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(lower);
    expect(src.indexOf('if (!isValidQueryText(input))')).toBeLessThan(lower);
  });
  it('other platform-query routes bound their free-text inputs', () => {
    for (const f of ['app/api/scan-personal/route.ts', 'app/api/competitor-scan/route.ts', 'app/api/outreach/run-scan/route.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).toContain('invalidQueryField(');
    }
    expect(readFileSync(join(process.cwd(), 'app/api/inbox/search/route.ts'), 'utf8')).toContain('isValidQueryText(trimmed)');
    expect(readFileSync(join(process.cwd(), 'app/api/rescan-weekly/route.ts'), 'utf8')).toContain('sanitizeQueryBasket(lockedQueries)');
  });
});
