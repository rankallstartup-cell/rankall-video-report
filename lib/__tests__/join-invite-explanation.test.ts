// b8ar — /join: the no-token state explains the invite flow and gives
// every visitor a working path instead of a dead end.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/join no-token state (b8ar)', () => {
  it('explains that /join is the agency-invite flow and links signup + login', () => {
    const page = read('app/join/page.tsx');
    expect(page).toContain('This page is for clients accepting an invitation from their agency.');
    expect(page).toContain('Invites arrive as a link');
    expect(page).toContain('href="/signup"');
    expect(page).toContain('href="/login"');
  });
});
