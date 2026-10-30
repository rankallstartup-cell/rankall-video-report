import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8ax: homepage header + category CTA.
const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

describe('homepage header and category CTA — b8ax', () => {
  it('signed-in visitors get a Dashboard link instead of Log in / Sign up', () => {
    // The homepage header is the shared SiteHeader (components/SiteChrome.tsx).
    expect(src).toContain('<SiteHeader onWatchDemo=');
    const chrome = readFileSync(join(process.cwd(), 'components/SiteChrome.tsx'), 'utf8');
    expect(chrome).toContain('<Link href="/dashboard" className="rk-btn rk-btn-line">Dashboard</Link>');
    expect(chrome.match(/signedIn \? \(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it('plan card CTAs follow their plan link, not #pricing', () => {
    expect(src).toContain('<a href={p.href} style={css(p.btnStyle)}>');
  });
});
