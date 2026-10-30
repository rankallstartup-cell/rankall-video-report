import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hasAppShell, hideSiteChrome } from '../appShell';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('signed-in app pages do not stack the website menu on the app menu', () => {
  it('dashboard and admin routes have their own shell', () => {
    for (const p of ['/dashboard', '/dashboard/fix', '/dashboard/client/reports', '/admin', '/admin/dashboard']) {
      expect(hasAppShell(p), p).toBe(true);
      expect(hideSiteChrome(p), p).toBe(true);
    }
    for (const p of ['/pricing', '/case-studies', '/settings', '/agency', '/dashboards-guide', '/administration']) {
      expect(hasAppShell(p), p).toBe(false);
    }
    for (const p of ['/', '/demo', '/r/abc']) expect(hideSiteChrome(p), p).toBe(true);
    expect(hideSiteChrome('/case-studies')).toBe(false);
  });

  it('header, footer, announcement bar and exit pop-up all use the rule', () => {
    expect(src('components/Nav.tsx')).toContain('hideSiteChrome(path)');
    expect(src('components/Footer.tsx')).toContain('hideSiteChrome(pathname)');
    expect(src('components/AnnouncementBar.tsx')).toContain('hasAppShell(pathname)');
    expect(src('components/ExitIntentPopup.tsx')).toContain('hasAppShell(pathname)');
  });

  it('dashboard shell: real logo, trial banner once', () => {
    const layout = src('app/dashboard/layout.tsx');
    expect(layout.match(/rankall-logo-dark\.png/g)?.length).toBe(2);
    expect(layout.match(/<TrialCountdownBanner /g)?.length).toBe(1);
  });

  it('overview: one "What to do next", consistent buttons', () => {
    const page = src('app/dashboard/page.tsx');
    expect(page.match(/>What to do next</g)?.length).toBe(1);
    expect(page).toMatch(/className="btn btn-line"\s*>\s*Share score card/);
    expect(page).toContain('maxWidth: 1280');
  });
});

describe('overview on phones', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
  it('scan history rows have inner padding and stack the buttons under the title', () => {
    expect(page).toContain('padding:14px 20px;border-top:1px solid #E7E7F0');
    expect(page).toContain('.hrow .acts > *{flex:1}');
  });
  it('platform names never run under the status dot', () => {
    expect(page).toContain('<span className="pname">{platform}</span>');
    expect(page).toContain('.pname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
  });
  it('the chat button never covers the last row', () => {
    expect(page).toContain('.dash-page{padding-bottom:96px!important}');
  });
});
