import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8b0: every "Scan Free" / "Scan for free" link opens the scan box.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Scan Free destination — b8b0', () => {
  // Header, announcement bar and footer all live in components/SiteChrome.tsx.
  const chrome = read('components/SiteChrome.tsx');
  it('site header Scan Free goes to /#scan', () => {
    expect(chrome).toMatch(/href="\/#scan" className="rk-btn rk-btn-blue rk-cta">Scan Free/);
  });
  it('announcement bar goes to /#scan', () => {
    expect(chrome).toMatch(/href="\/#scan"[^>]*>Scan for free/);
  });
  it('footer goes to /#scan', () => {
    expect(chrome).toMatch(/href="\/#scan" className="rk-btn rk-btn-blue" style=\{[^}]*\}\}>Scan Free/);
  });
  it('layout wrappers render the shared chrome', () => {
    expect(read('components/Nav.tsx')).toContain('<SiteHeader />');
    expect(read('components/Footer.tsx')).toContain('<SiteFooter />');
    expect(read('components/AnnouncementBar.tsx')).toContain('<SiteAnnouncement />');
  });
});
