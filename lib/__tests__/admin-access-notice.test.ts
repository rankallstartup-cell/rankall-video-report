import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b88m/b88n/b88p/b88q/b88r/b88v/b88w: blocked visitors are told why.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('admin-only notice', () => {
  it('signed-in non-admins land on the dashboard restricted notice', () => {
    expect(read('proxy.ts')).toContain("new URL('/dashboard?restricted=1', request.url)");
    expect(read('app/dashboard/page.tsx')).toContain('This page is restricted to Rankall admins only.');
  });
  it('logged-out visitors from /admin see an admin-only note on /login', () => {
    const login = read('app/login/page.tsx');
    expect(login).toContain("next.startsWith('/admin')");
    expect(login).toContain('That page is for Rankall admins only.');
  });
});
