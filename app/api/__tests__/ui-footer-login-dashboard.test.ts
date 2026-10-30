import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// UI pass, rebased onto staging HEAD 5e134e89 (post PR #56):
// footer grid, login polish, chatbot/sticky-bar overlap, and the one
// remaining fake weekly promise on the dashboard. PR #56 already fixed
// the dashboard "Next Rescan" countdown and the pricing FAQ, so this
// branch does not touch those.
describe('ui-footer-login-dashboard (rebase onto 5e134e89)', () => {
  it('footers: explicit 4-col grid, no auto-fit + span-2 wrap', () => {
    // Grid behaviour extracted, not removed: it now lives in
    // lib/footerLayout.ts (FOOTER_GRID_CSS) and renders via SiteChrome /
    // SiteFooter. The old footer-grid class exists nowhere anymore.
    const gridFile = readFileSync(join(process.cwd(), 'lib/footerLayout.ts'), 'utf-8');
    // No-auto-fit / no-span-2 guards apply to the CSS itself, not the
    // file's header comment (which describes the old grid it replaced).
    const grid = gridFile.slice(gridFile.indexOf('export const FOOTER_GRID_CSS'));
    expect(grid).toContain('.ra-fgrid');
    expect(grid).toContain('1.6fr');
    expect(grid).toContain('repeat(3');
    expect(grid).not.toContain('auto-fit');
    expect(grid).not.toContain('span 2');
    expect(grid).toContain('grid-column:1/-1');
    const chrome = readFileSync(join(process.cwd(), 'components/SiteChrome.tsx'), 'utf-8');
    expect(chrome).toContain('FOOTER_GRID_CSS');
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf-8');
    expect(home).toContain('<SiteFooter');
  });
  it('login: light loading state + real form + autocomplete + show/hide', () => {
    const src = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf-8');
    expect(src).not.toContain("background: '#0a0a1a'");
    expect(src).toContain('<form');
    expect(src).toContain('autoComplete="email"');
    expect(src).toContain('autoComplete="current-password"');
    expect(src).toContain('Show password');
    expect(src).toContain('htmlFor="login-email"');
  });
  it('Ask Alina pill floats above the sticky bar when it is visible', () => {
    const chat = readFileSync(join(process.cwd(), 'components/Chatbot.tsx'), 'utf-8');
    expect(chat).toContain('chatbot-float');
    expect(chat).toContain('body.has-sticky-bar .chatbot-float { bottom: 80px !important; }');
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf-8');
    expect(home).toContain("document.body.classList.toggle('has-sticky-bar', stickyVisible && !stickyDismissed)");
  });
  it('dashboard: no fake weekly competitor tracking promise', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf-8');
    expect(src).not.toContain('Competitor score tracked weekly');
    expect(src).toContain('Competitor score after every rescan');
  });
});
