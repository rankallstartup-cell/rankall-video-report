// b8bg — /vs data honesty: canonical scoring weights (not "share"),
// illustrative labelling for the pattern numbers, softened generic
// claims; UserMenu: real button + always-redirect sign-out + Escape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/vs honesty (b8bg)', () => {
  it('platform list uses canonical scoring weights, never "share"', () => {
    const vs = read('app/vs/page.tsx');
    expect(vs).toContain('PLATFORM_SCORING_WEIGHTS');
    expect(vs).toContain('scoring weight');
    expect(vs).not.toContain('% share');
    expect(vs).not.toContain('Perplexity — 11%');
    expect(vs).not.toContain('+ 5 more platforms');
    expect(vs).not.toContain('Early patterns from our dataset');
  });

  it('pattern numbers are labelled illustrative, not measured', () => {
    const vs = read('app/vs/page.tsx');
    expect(vs).toContain('Patterns we are watching for');
    expect(vs).toContain('Illustrative examples — not measured results');
    expect(vs).toContain('Illustrative');
    expect(vs).not.toContain('in our dataset');
    expect(vs).not.toContain('we see consistently');
  });

  it('generic-competitor claims are softened + footnoted', () => {
    const vs = read('app/vs/page.tsx');
    expect(vs).toContain('not a measured claim about any named product');
    expect(vs).not.toContain('No trust signal correlation');
    expect(vs).not.toContain('No verified proof fixes worked');
  });
});

describe('UserMenu sign-out (b8bg)', () => {
  it('sign-out is a button, always redirects, Escape closes', () => {
    const menu = read('components/UserMenu.tsx');
    expect(menu).toContain('type="button"');
    expect(menu).toContain("e.key === 'Escape'");
    // try/finally shape: signOut in try, redirect in finally (so it
    // always redirects, even on signOut failure). The client is
    // getBrowserClient(), not a variable literally named supabase.
    expect(menu).toMatch(/try\s*{\s*await (?:supabase\.auth|getBrowserClient\(\)\.auth)\.signOut\(\)/);
    expect(menu).toContain('getBrowserClient().auth.signOut()');
    expect(menu).toContain('finally {');
    expect(menu).toContain('window.location.href =');
    expect(menu).toContain('aria-expanded');
  });
});
