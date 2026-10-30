'use client';

// One header, announcement bar and footer for the whole marketing site.
// This is the landing-page design (app/page.tsx V2 nav + footer), moved here
// so every public page renders exactly the same chrome. The homepage and the
// root layout both render these components; there is no second copy.
//
// Links use "/#how", "/#pricing", "/#results", "/#scan" so they work from
// any page (on the homepage they scroll to the section).

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { SOCIAL_PROFILES } from '@/lib/socialLinks';
import { topCategoryGroups, topCities } from '@/lib/topCategories';
import { FOOTER_GRID_CSS } from '@/lib/footerLayout';
import UserMenu from './UserMenu';

const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BORDER = '#EDEDF4';

export const HEADER_LINKS: [string, string][] = [
  ['How It Works', '/#how'],
  ['Case Studies', '/case-studies'],
  ['Verified Results', '/#results'],
  ['Pricing', '/#pricing'],
];
export const MORE_LINKS: ([string, string] | null)[] = [
  ['Personal Brand', '/personal'],
  ['Agency', '/agency'],
  null,
  ['Blog', '/blog'],
  ['Leaderboard', '/leaderboard'],
  ['Methodology', '/methodology'],
  null,
  ['About', '/about'],
  ['vs Competitors', '/vs'],
];

const Arrow = () => (
  <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
);

// Shared styles. Prefixed "rk-" so they never collide with page CSS.
export const SITE_CHROME_CSS = `
.rk-wrap{width:100%;max-width:1200px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.rk-chrome{font-family:'Geist','Inter','Helvetica Neue',Arial,sans-serif}
.rk-mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.rk-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 22px;border-radius:12px;font-weight:700;font-size:15px;border:0;cursor:pointer;font-family:inherit;text-decoration:none;white-space:nowrap;transition:transform .2s ease,background .2s ease,border-color .2s ease}
.rk-btn-blue{background:${BLUE};color:#fff;box-shadow:0 8px 24px -10px rgba(27,23,255,.7)}
.rk-btn-blue:hover{background:#1310C4;color:#fff;transform:translateY(-1px)}
.rk-btn-line{background:#fff;color:${INK};border:1px solid ${BORDER}}
.rk-btn-line:hover{color:${INK};border-color:${INK}}
.rk-navbtn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;min-height:44px;padding:0 12px;border-radius:10px;background:transparent;border:0;color:#2A2A3C;font-family:inherit;font-size:15px;font-weight:500;cursor:pointer}
.rk-navbtn:hover,.rk-navbtn[aria-expanded="true"]{background:#F2F2F8;color:${INK}}
.rk-navlinks{display:flex;align-items:center;gap:2px}
.rk-burger{display:none;width:44px;height:44px;border-radius:10px;border:1px solid #E7E7F0;background:#fff;cursor:pointer;align-items:center;justify-content:center;flex-direction:column;gap:5px}
.rk-burger span{display:block;width:18px;height:2px;background:${INK};border-radius:2px}
.rk-mobile{display:none;border-top:1px solid ${BORDER};background:#fff;padding:12px 24px 20px}
.rk-mobile a{display:block;padding:14px 4px;font-size:16px;font-weight:600;color:${INK};text-decoration:none;border-bottom:1px solid #F2F2F8}
.rk-mobile a:last-child{border-bottom:0}
.rk-more a{display:block;padding:12px 14px;border-radius:10px;color:${INK};font-weight:600;font-size:15px;text-decoration:none}
.rk-more a:hover{background:#F6F6FB}
.rk-more hr{height:1px;background:#F2F2F8;border:0;margin:6px 8px}
.rk-fcol a{color:#B4B4C8;font-size:15px;text-decoration:none}
.rk-fcol a:hover{color:#fff}
.rk-ind-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:28px 24px;margin-top:18px}
.rk-ind-col{display:flex;flex-direction:column;gap:9px;min-width:0}
.rk-ind-h{color:#fff;font-size:13px;font-weight:700;margin-bottom:2px}
.rk-ind-col a{color:#B4B4C8;font-size:14px;text-decoration:none}
.rk-ind-col a:hover{color:#fff}
@media (max-width:960px){.rk-ind-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:560px){.rk-ind-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 16px}}
.rk-chip{display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;background:#14142A;border:1px solid #2A2A44;color:#DCDCE8;font-size:13px;font-weight:700}
@media (max-width:1199px){.rk-signup{display:none!important}}
@media (max-width:1100px){.rk-navlinks,.rk-hnav{display:none!important}.rk-burger{display:inline-flex}.rk-mobile{display:block}}
@media (max-width:480px){.rk-logo img{height:24px!important}.rk-cta{min-height:40px!important;padding:0 14px!important;font-size:14px!important}}
`;

// null = still checking, so neither Log in nor Dashboard flashes.
function useSessionUser(): { ready: boolean; user: { email?: string } | null } {
  const [state, setState] = useState<{ ready: boolean; user: { email?: string } | null }>({ ready: false, user: null });
  useEffect(() => {
    const supabase = getBrowserClient();
    let alive = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setState({ ready: true, user: data.user ?? null }); })
      .catch(() => { if (alive) setState({ ready: true, user: null }); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setState({ ready: true, user: session?.user ?? null });
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return state;
}

export function SiteAnnouncement() {
  return (
    <div className="rk-chrome" style={{ background: BLUE, color: '#fff' }}>
      <div className="rk-wrap" style={{ minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14, paddingTop: 8, paddingBottom: 8, textAlign: 'center' }}>
        <span><strong>Free scan:</strong> See who AI recommends instead of your business right now —</span>
        <Link href="/#scan" style={{ color: '#fff', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Scan for free <Arrow /></Link>
      </div>
    </div>
  );
}

export function SiteHeader({ onWatchDemo }: { onWatchDemo?: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { ready, user } = useSessionUser();
  const signedIn = ready ? !!user : null;

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-rk-more]')) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

  // Watch Demo opens the homepage video when the page provides it,
  // otherwise it goes to the /demo page.
  const demoClick = (e: React.MouseEvent, close: () => void) => {
    close();
    if (onWatchDemo) { e.preventDefault(); onWatchDemo(); }
  };

  return (
    <header className="rk-chrome" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${BORDER}` }}>
      <style>{SITE_CHROME_CSS}</style>
      <nav className="rk-wrap" style={{ height: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }} aria-label="Main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, minWidth: 0 }}>
          <Link href="/" aria-label="Rankall home" className="rk-logo" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <img src="/rankall-logo-dark.png" alt="RankAll" width={140} height={28} style={{ height: 28, width: 'auto', display: 'block' }} />
          </Link>
          <div className="rk-navlinks">
            {HEADER_LINKS.map(([label, href]) => (
              <Link key={label} href={href} className="rk-navbtn">{label}</Link>
            ))}
            <div data-rk-more style={{ position: 'relative', display: 'inline-flex' }}>
              <button type="button" className="rk-navbtn" aria-expanded={moreOpen} aria-haspopup="true" onClick={() => setMoreOpen(o => !o)}>
                More
                <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ transform: moreOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>
              </button>
              {moreOpen && (
                <div role="menu" className="rk-more" style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, width: 248, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: '0 24px 48px -12px rgba(10,10,20,.18), 0 4px 12px rgba(10,10,20,.06)', padding: 8, zIndex: 60 }}>
                  {MORE_LINKS.map((l, i) => l
                    ? <Link key={l[1]} href={l[1]} role="menuitem" onClick={() => setMoreOpen(false)}>{l[0]}</Link>
                    : <hr key={`d${i}`} />)}
                  <hr />
                  <Link href="/demo" role="menuitem" onClick={(e) => demoClick(e, () => setMoreOpen(false))}>Watch Demo</Link>
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* b8ax: a signed-in visitor sees Dashboard, not Log in / Sign up. */}
          {signedIn ? (
            <span className="rk-hnav" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Link href="/dashboard" className="rk-btn rk-btn-line">Dashboard</Link>
              {user ? <UserMenu user={user} /> : null}
            </span>
          ) : signedIn === false ? (
            <>
              <Link href="/login" className="rk-navbtn rk-hnav">Log in</Link>
              <Link href="/signup" className="rk-btn rk-btn-line rk-hnav rk-signup">Sign up</Link>
            </>
          ) : null}
          <Link href="/#scan" className="rk-btn rk-btn-blue rk-cta">Scan Free <Arrow /></Link>
          <button type="button" className="rk-burger" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(o => !o)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>
      {mobileOpen && (
        <div className="rk-mobile">
          {[...HEADER_LINKS, ...MORE_LINKS.filter((l): l is [string, string] => !!l)].map(([label, href]) => (
            <Link key={label} href={href} onClick={() => setMobileOpen(false)}>{label}</Link>
          ))}
          {signedIn ? (
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</Link>
          ) : (
            <>
              <Link href="/login" onClick={() => setMobileOpen(false)}>Log in</Link>
              <Link href="/signup" onClick={() => setMobileOpen(false)}>Sign up</Link>
            </>
          )}
          <Link href="/demo" onClick={(e) => demoClick(e, () => setMobileOpen(false))}>Watch Demo</Link>
        </div>
      )}
    </header>
  );
}

const SOCIAL_ICONS: Record<string, { vb: string; d: string }> = {
  LinkedIn: { vb: '0 0 448 512', d: 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z' },
  Facebook: { vb: '0 0 320 512', d: 'M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z' },
  X: { vb: '0 0 512 512', d: 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z' },
  YouTube: { vb: '0 0 576 512', d: 'M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z' },
};

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ra-fcol rk-fcol">
      <span className="rk-mono" style={{ fontSize: 11, letterSpacing: '.12em', color: '#8A8AA3' }}>{title}</span>
      {children}
    </div>
  );
}

export function SiteFooter({ onWatchDemo }: { onWatchDemo?: () => void }) {
  return (
    <footer className="rk-chrome" style={{ background: INK, color: '#fff' }}>
      <style>{SITE_CHROME_CSS}</style>
      <style>{FOOTER_GRID_CSS}</style>
      <div className="rk-wrap" style={{ paddingTop: 72, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 56 }}>
        <div className="ra-fgrid">
          <div className="ra-fbrand">
            <img src="/rankall-logo-white.png" alt="RankAll" width={160} height={32} style={{ height: 32, width: 'auto', alignSelf: 'flex-start', display: 'block' }} />
            <p style={{ margin: 0, color: '#B4B4C8', fontSize: 15, lineHeight: 1.6 }}>The Unified AI Trust and Recommendation Intelligence Graph. Every business. Every product. Every brand.</p>
            <Link href="/#scan" className="rk-btn rk-btn-blue" style={{ alignSelf: 'flex-start', minHeight: 48, padding: '0 24px' }}>Scan Free <Arrow /></Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              {/* b86p: social profiles come from the canonical list
                  (lib/socialLinks) — empty until the profiles exist. */}
              {SOCIAL_PROFILES.map(p => {
                const icon = SOCIAL_ICONS[p.label];
                return icon ? (
                  <a key={p.label} href={p.href} target="_blank" rel="noopener" aria-label={p.label} style={{ width: 36, height: 36, borderRadius: '50%', background: '#14142A', border: '1px solid #2A2A44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg aria-hidden="true" width="16" height="16" viewBox={icon.vb} fill="#fff"><path d={icon.d} /></svg></a>
                ) : null;
              })}
            </div>
            <a href="https://www.google.com/preferences/source" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 4, padding: '10px 16px', borderRadius: 999, background: '#14142A', border: '1px solid #2A2A44', color: '#DCDCE8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 488 512" fill="#fff"><path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" /></svg>
              Add Rankall as a preferred source
            </a>
          </div>
          <FooterCol title="PRODUCT">
            <Link href="/#how">How It Works</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/demo" onClick={(e) => { if (onWatchDemo) { e.preventDefault(); onWatchDemo(); } }}>Watch Demo</Link>
          </FooterCol>
          <FooterCol title="RESOURCES">
            <Link href="/blog">Blog</Link>
            <Link href="/#results">Verified Results</Link>
            <Link href="/case-studies">Case Studies</Link>
            <Link href="/personal">Personal Brand</Link>
            <Link href="/agency">Agency</Link>
            <Link href="/vs">vs Competitors</Link>
            <Link href="/industries">Industry Hubs</Link>
            <Link href="/cities">City Hubs</Link>
          </FooterCol>
          <FooterCol title="COMPANY">
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </FooterCol>
        </div>
        {/* Top 20 categories (lib/topCategories); "More industries" opens
            /industries, which links every hub. */}
        <div style={{ borderTop: '1px solid #2A2A44', paddingTop: 28 }}>
          <span className="rk-mono" style={{ fontSize: 11, letterSpacing: '.12em', color: '#8A8AA3' }}>AI VISIBILITY BY INDUSTRY</span>
          {/* Top 20 categories grouped by sector, plus the biggest US/UK
              city hubs. Every link is a real hub page. */}
          <div className="rk-ind-grid">
            {topCategoryGroups().map(g => (
              <div key={g.title} className="rk-ind-col">
                <span className="rk-ind-h">{g.title}</span>
                {g.items.map(c => (
                  <Link key={c.slug} href={`/${c.slug}`} title={`AI visibility for ${c.plural}`}>{c.plural}</Link>
                ))}
              </div>
            ))}
            <div className="rk-ind-col">
              <span className="rk-ind-h">Top Cities</span>
              {topCities().map(c => (
                <Link key={c.slug} href={`/cities/${c.slug}`} title={`AI visibility in ${c.label}`}>{c.label}</Link>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 22 }}>
            <Link href="/industries" style={{ color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>More industries →</Link>
            <Link href="/cities" style={{ color: '#B4B4C8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>All cities →</Link>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['SSL Secured', 'GDPR', 'Free scan · No card needed', '14-day money back'].map(t => (
            <span key={t} className="rk-chip">{t}</span>
          ))}
        </div>
        <div className="ra-fbottom" style={{ paddingTop: 24, borderTop: '1px solid #2A2A44', fontSize: 13, color: '#8A8AA3' }}>
          <span>© 2026 Rankall.io — The AI Trust and Recommendation Intelligence Graph</span>
          <div className="ra-flegal rk-fcol">
            <Link href="/privacy" style={{ fontSize: 13 }}>Privacy Policy</Link>
            <Link href="/terms" style={{ fontSize: 13 }}>Terms & Conditions</Link>
            <Link href="/cookie-policy" style={{ fontSize: 13 }}>Cookie Policy</Link>
            <Link href="/sitemap" style={{ fontSize: 13 }}>Sitemap</Link>
            <Link href="/entity-map" style={{ fontSize: 13 }}>EntityMap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
