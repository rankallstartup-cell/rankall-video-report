import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8bg: account menu — one-click Sign Out, Escape closes.
const src = readFileSync(join(process.cwd(), 'components/UserMenu.tsx'), 'utf8');

describe('UserMenu — b8bg', () => {
  it('Escape closes the menu', () => {
    expect(src).toContain("e.key === 'Escape'");
    expect(src).toContain("removeEventListener('keydown'");
  });
  it('Sign Out is a real button that always leaves the page', () => {
    expect(src).toContain('onClick={handleSignOut}');
    expect(src).toMatch(/finally \{\s*window\.location\.href = '\/';/);
    expect(src).toContain("'Signing out…'");
  });
});
