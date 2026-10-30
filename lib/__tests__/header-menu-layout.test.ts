import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HEADER_LINKS, MORE_LINKS, SITE_CHROME_CSS } from '../../components/SiteChrome';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('one landing-page header/footer on every page', () => {
  it('homepage and layout both render the shared chrome', () => {
    const home = src('app/page.tsx');
    expect(home).toContain('<SiteAnnouncement />');
    expect(home).toContain('<SiteHeader onWatchDemo=');
    expect(home).toContain('<SiteFooter onWatchDemo=');
    expect(home).not.toContain('className="navlinks"');
    expect(src('components/Nav.tsx')).toContain('<SiteHeader />');
    expect(src('components/Footer.tsx')).toContain('<SiteFooter />');
  });

  it('header links match the landing page; extra pages live under More', () => {
    expect(HEADER_LINKS.map(l => l[0])).toEqual(['How It Works', 'Case Studies', 'Verified Results', 'Pricing']);
    const more = MORE_LINKS.filter(Boolean).map(l => l![0]);
    expect(more).toEqual(expect.arrayContaining(['Personal Brand', 'Agency', 'Blog', 'Leaderboard', 'Methodology', 'About', 'vs Competitors']));
  });

  it('labels never wrap, logo never shrinks, burger from 1100px', () => {
    expect(SITE_CHROME_CSS).toMatch(/\.rk-navbtn\{[^}]*white-space:nowrap/);
    expect(SITE_CHROME_CSS).toContain('@media (max-width:1100px){.rk-navlinks,.rk-hnav{display:none!important}.rk-burger{display:inline-flex}');
    expect(src('components/SiteChrome.tsx')).toMatch(/className="rk-logo" style=\{\{[^}]*flexShrink: 0/);
  });

  it('pages no longer render their own second navbar or mini footer', () => {
    for (const f of ['app/brands/BrandsClient.tsx', 'app/personal/PersonalClient.tsx', 'app/[industry]/[city]/page.tsx', 'app/city-intelligence/CityIntelligenceClient.tsx']) {
      const s = src(f);
      expect(s, f).not.toMatch(/<footer/);
      expect(s, f).not.toMatch(/<nav style=/);
    }
  });
});
