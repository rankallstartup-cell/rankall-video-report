'use client';

import Link from 'next/link';

const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';

const GROUPS: { title: string; links: { label: string; href: string; desc?: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Home', href: '/', desc: 'Free AI visibility scan' },
      { label: 'How It Works', href: '/how-it-works' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Leaderboard', href: '/leaderboard' },
      { label: 'Watch Demo', href: '/demo' },
      { label: 'Demo Video', href: '/demo-video' },
      { label: 'Case Studies', href: '/case-studies' },
      { label: 'Intelligence Graph', href: '/intelligence-graph' },
      { label: 'Market Index', href: '/market-index' },
    ],
  },
  {
    title: 'Audiences',
    links: [
      { label: 'Local Business', href: '/' }, // b8bc: the homepage is the local-business page
      { label: 'Personal Brand', href: '/personal' },
      { label: 'Agency', href: '/agency' },
      { label: 'Brands', href: '/brands' },
      { label: 'City Intelligence', href: '/city-intelligence' },
    ],
  },
  {
    // azxg: hub indexes — industry hubs (/dentist, /hvac, …) and city hubs
    // (/cities/chicago, …) link down to all 21,975 programmatic pages.
    title: 'Hubs',
    links: [
      { label: 'Industry Hubs', href: '/industries', desc: 'AI visibility by industry — every industry, every city' },
      { label: 'City Hubs', href: '/cities', desc: 'AI visibility by city — every city, every industry' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'vs Competitors', href: '/vs' },
      { label: 'EntityMap', href: '/entity-map', desc: 'Rankall entity intelligence graph' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Press', href: '/press' },
      { label: 'Join', href: '/join' },
      { label: 'Referrals', href: '/referrals' },
      { label: 'Waitlist', href: '/waitlist' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms & Conditions', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookie-policy' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign Up', href: '/signup' },
      { label: 'Log In', href: '/login' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '80px 24px', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ fontSize: 14, color: BODY, textDecoration: 'none', fontWeight: 500, alignSelf: 'flex-start' }}>← Back to home</Link>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Site Map</span>
          {/* b8bc: the old headline claimed this page listed all pages — false:
              it lists 31 entries and omits the business profiles, the 75
              industry pages and the hundreds of city pages (those live
              under the hubs below). Honest headline + subhead. */}
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,60px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Key pages, one place</h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.6 }}>The main pages on Rankall.io, organized by section. Industry and city pages live under the hubs below.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px,100%),1fr))', gap: 16 }}>
          {GROUPS.map(g => (
            <div key={g.title} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '28px' }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>{g.title}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {g.links.map(l => (
                  <Link key={l.href + l.label} href={l.href} style={{ fontSize: 15, color: BODY, textDecoration: 'none', fontWeight: 500 }}>
                    <span style={{ color: INK, fontWeight: 600 }}>{l.label}</span>
                    {l.desc && <span style={{ display: 'block', fontSize: 13, fontWeight: 400 }}>{l.desc}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
