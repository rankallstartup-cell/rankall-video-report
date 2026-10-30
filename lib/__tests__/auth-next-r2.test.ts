import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loginNextFromSearch, signupNextFromSearch } from '../authNext';

// Fix round 2: /login used ?next= unvalidated; lib/safeNext.ts (signup)
// turned dot-segment vectors into //evil.com. Both pages now share
// lib/safeRedirect via lib/authNext.
const O = 'https://rankall.io';
const q = (next: string) => `?next=${encodeURIComponent(next)}`;

const VECTORS = [
  'https://evil.com',
  '/\\evil.com',
  '/%5Cevil.com',
  '//evil.com',
  '/%09/evil.com',
  '/%0a/evil.com',
  'https:evil.com',
  '/.//evil.com',
  '/a/..//evil.com',
  '/%2e//evil.com',
  'javascript:alert(1)',
];

describe('login ?next=', () => {
  it.each(VECTORS)('rejects %s', (v) => {
    const out = loginNextFromSearch(q(v), O);
    expect(out).toBe('/dashboard');
    expect(new URL(out, O).origin).toBe(O);
  });
  it('rejects raw (un-encoded) query vectors too', () => {
    expect(loginNextFromSearch('?next=/%2e//evil.com', O)).toBe('/dashboard');
    expect(loginNextFromSearch('?next=/%5Cevil.com', O)).toBe('/dashboard');
  });
  it('keeps safe paths', () => {
    expect(loginNextFromSearch(q('/dashboard/fix?x=1#y'), O)).toBe('/dashboard/fix?x=1#y');
    expect(loginNextFromSearch('', O)).toBe('/dashboard');
  });
});

describe('signup ?next=', () => {
  it.each(VECTORS)('rejects %s', (v) => {
    expect(signupNextFromSearch(q(v), O)).toBeNull();
  });
  it('keeps safe paths, null when absent', () => {
    expect(signupNextFromSearch(q('/pricing?plan=agency'), O)).toBe('/pricing?plan=agency');
    expect(signupNextFromSearch('', O)).toBeNull();
  });
});

describe('wiring', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');
  it('login + signup use lib/authNext; lib/safeNext.ts is gone', () => {
    expect(read('app/login/page.tsx')).toContain('loginNextFromSearch(window.location.search, window.location.origin)');
    expect(read('app/login/page.tsx')).not.toMatch(/get\('next'\)\s*\|\|/);
    expect(read('app/signup/page.tsx')).toContain('signupNextFromSearch(');
    expect(existsSync(join(process.cwd(), 'lib/safeNext.ts'))).toBe(false);
  });
});
