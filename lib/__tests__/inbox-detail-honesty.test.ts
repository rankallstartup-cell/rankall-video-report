// b8an — /inbox/[id] honesty: the detail API must say "Not found."
// (proper sentence), never the lowercase bare "not found"; and the usage
// summary must display the REAL plan's limits (rawPlan), so the AI Inbox
// meter shows the true quota instead of the admin-upgraded 999999/∞.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canViewInboxSearch } from '@/lib/inboxShare';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('inbox detail honesty (b8an)', () => {
  it('the inbox detail API says "Not found." — never bare lowercase "not found"', () => {
    const src = read('app/api/inbox/[id]/route.ts');
    expect(src).toContain("error: 'Not found.'");
    expect(src).not.toMatch(/error: 'not found'/);
  });

  it('the usage summary displays the real plan (rawPlan), not the admin-upgraded plan', () => {
    const src = read('app/api/usage/summary/route.ts');
    expect(src).toContain('plan = resolved.rawPlan;');
    expect(src).not.toMatch(/plan = resolved\.plan;/);
  });

  it('inbox share rule: owner always, others only when explicitly shared, ownerless + unshared never public', () => {
    expect(canViewInboxSearch({ user_id: 'u1', is_shared: false }, 'u1')).toBe(true);
    expect(canViewInboxSearch({ user_id: 'u1', is_shared: false }, 'u2')).toBe(false);
    expect(canViewInboxSearch({ user_id: 'u1', is_shared: true }, 'u2')).toBe(true);
    expect(canViewInboxSearch({ user_id: 'u1', is_shared: true }, null)).toBe(true);
    expect(canViewInboxSearch({ user_id: null, is_shared: false }, 'u1')).toBe(false);
    expect(canViewInboxSearch(null, 'u1')).toBe(false);
  });
});
