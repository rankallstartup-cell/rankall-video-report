'use client';

import { MARKETS_COVERED, PLATFORMS_SCANNED, tierPrice } from '@/lib/publicStats';

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const LGRAY  = '#8A8AA3';

const DEMO_HREF = 'mailto:demo@rankall.io?subject=Brand Demo Request';
// b892: the sample-report button pointed at the DEMO mailto while
// promising a report. It now requests what it labels.
const SAMPLE_HREF = 'mailto:demo@rankall.io?subject=Sample Report Request';


const PROBLEMS = [
  {
    icon: <svg viewBox="0 0 512 512" width="32" height="32" fill="#1B17FF" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>,
    title: 'Global inconsistency',
    body: 'ChatGPT recommends you in the US but your competitor in Germany and Brazil. Your global brand spend is undermined by AI at the local level.',
  },
  {
    icon: <svg viewBox="0 0 448 512" width="32" height="32" fill="#1B17FF" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg>,
    title: 'Challenger speed',
    body: "A common scenario: a new competitor launched 6 months ago and has already captured AI recommendations in 4 markets. You found out by accident.",
  },
  {
    icon: <svg viewBox="0 0 512 512" width="32" height="32" fill="#1B17FF" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>,
    title: 'No visibility',
    body: "You're running brand campaigns with no idea if AI platforms are reinforcing or contradicting your message — and no way to measure it.",
  },
];

const FEATURES = [
  { icon: <svg viewBox="0 0 512 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>, title: 'Brand AI Share by Country',  desc: '% of AI recommendations your brand captures per market, updated weekly.' },
  { icon: <svg viewBox="0 0 576 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg>, title: 'Competitor Tracking',          desc: 'Which challengers are winning AI citations and in which markets — with trend data.' },
  { icon: <svg viewBox="0 0 512 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/></svg>, title: 'Sentiment per Platform',       desc: 'How each AI platform describes your brand vs competitors. Verbatim.' },
  { icon: <svg viewBox="0 0 512 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>, title: 'Crisis Monitoring',            desc: 'Detect negative AI narratives before they reach consumers. Weekly alerts.' },
  { icon: <svg viewBox="0 0 576 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>, title: 'Category Leadership Score',    desc: 'Are you the default AI recommendation in your category per country?' },
  { icon: <svg viewBox="0 0 384 512" width="26" height="26" fill="#1B17FF" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM112 256l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>, title: 'Executive Report',             desc: 'Monthly PDF for CMO/CEO with market-by-market breakdown and recommendations.' },
];

const TIERS = [
  {
    // Round 2: founder-set price (lib/publicStats). The old 15k /
    // 50k-per-month tiers were not founder tiers; anything beyond the published
    // tier is quoted on request.
    name: 'Global Brand Intelligence',
    price: `$${tierPrice('Global Brand Intelligence').toLocaleString('en-US')}`,
    period: '/month',
    features: ['Up to 5 markets', '3 competitors tracked', 'Monthly reports', 'All 12 AI platforms'],
    highlight: false,
  },
  {
    name: 'Brand Pro',
    price: 'Contact us',
    period: '',
    features: ['Unlimited markets', '10 competitors tracked', 'Weekly reports', 'Dedicated analyst', 'Sentiment monitoring'],
    highlight: true,
  },
  {
    name: 'Brand Enterprise',
    price: 'Contact us',
    period: '',
    features: ['White-glove service', 'Full API access', 'Custom platforms', 'Real-time alerts', 'Board-level reporting'],
    highlight: false,
  },
];

const CATEGORIES = ['Fortune 500', 'Global Retail', 'Healthcare', 'Financial Services', 'Technology', 'Consumer Goods'];

export default function BrandsClient() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header: the shared site header (components/SiteChrome.tsx) renders above. */}

      {/* HERO */}
      <section style={{ background: NAVY, padding: 'clamp(64px,10vw,120px) clamp(20px,4vw,48px)', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 100, padding: '5px 20px', marginBottom: 32 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Enterprise Brand Intelligence</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,58px)', fontWeight: 900, color: W, letterSpacing: '-2px', lineHeight: 1.08, marginBottom: 24 }}>
            How does AI represent your brand across {MARKETS_COVERED} countries and {PLATFORMS_SCANNED} platforms?
          </h1>
          <p style={{ fontSize: 17, color: LGRAY, lineHeight: 1.7, marginBottom: 48, maxWidth: 620, margin: '0 auto 48px' }}>
            When consumers ask AI about your category, who do they find? You — or the challenger brand that launched 6 months ago in Brazil?
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={DEMO_HREF} style={{ background: W, color: NAVY, borderRadius: 10, padding: '15px 32px', fontSize: 15, fontWeight: 800, textDecoration: 'none', display: 'inline-block' }}>
              Request a Demo <svg viewBox="0 0 448 512" width="14" height="14" fill="#0A0A14" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </a>
            <a href={SAMPLE_HREF} style={{ background: 'transparent', color: W, border: '2px solid rgba(255,255,255,0.35)', borderRadius: 10, padding: '15px 32px', fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
              Request a Sample Report
            </a>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section style={{ background: W, padding: 'clamp(56px,8vw,96px) clamp(20px,4vw,48px)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 800, color: NAVY, letterSpacing: '-1px', textAlign: 'center', marginBottom: 48 }}>
            The challenge brands face in the AI era
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 24 }}>
            {PROBLEMS.map((p, i) => (
              <div key={i} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 28 }}>
                <p style={{ fontSize: 34, marginBottom: 16 }}>{p.icon}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 10 }}>{p.title}</p>
                <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.65, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU GET — dark navy, white cards */}
      <section style={{ background: NAVY, padding: 'clamp(56px,8vw,96px) clamp(20px,4vw,48px)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 800, color: W, letterSpacing: '-1px', textAlign: 'center', marginBottom: 48 }}>
            Complete brand intelligence
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: W, borderRadius: 14, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{f.title}</p>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ background: W, padding: 'clamp(56px,8vw,96px) clamp(20px,4vw,48px)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 800, color: NAVY, letterSpacing: '-1px', textAlign: 'center', marginBottom: 48 }}>
            Brand Intelligence pricing
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 24 }}>
            {TIERS.map((tier, i) => (
              <div
                key={i}
                style={{
                  background: tier.highlight ? NAVY : BG,
                  border: `2px solid ${tier.highlight ? NAVY : BORDER}`,
                  borderRadius: 20,
                  padding: 32,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: tier.highlight ? '#93C5FD' : GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                  {tier.name}
                </p>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: tier.highlight ? W : NAVY }}>{tier.price}</span>
                  {tier.period && <span style={{ fontSize: 15, color: tier.highlight ? LGRAY : GRAY }}>{tier.period}</span>}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {tier.features.map((feat, j) => (
                    <li key={j} style={{ fontSize: 14, color: tier.highlight ? LGRAY : GRAY, display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ color: tier.highlight ? '#86EFAC' : BLUE, fontWeight: 700, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a
                  href={DEMO_HREF}
                  style={{
                    background: tier.highlight ? W : BLUE,
                    color: tier.highlight ? NAVY : W,
                    borderRadius: 10,
                    padding: '13px 20px',
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'block',
                  }}
                >
                  Request a Demo <svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LOGOS */}
      <section style={{ background: BG, padding: 'clamp(40px,6vw,64px) clamp(20px,4vw,48px)', borderBottom: `1px solid ${BORDER}`, textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>
          Trusted for brand intelligence
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {CATEGORIES.map((cat, i) => (
            <span
              key={i}
              style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 100, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: GRAY }}
            >
              {cat}
            </span>
          ))}
        </div>
      </section>

      {/* DEMO CTA */}
      <section style={{ background: NAVY, padding: 'clamp(64px,10vw,100px) clamp(20px,4vw,48px)', textAlign: 'center' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, color: W, letterSpacing: '-1.5px', marginBottom: 20 }}>
            See your brand&apos;s AI footprint
          </h2>
          <p style={{ fontSize: 16, color: LGRAY, lineHeight: 1.7, marginBottom: 40 }}>
            We&apos;ll run a live scan of your brand across {PLATFORMS_SCANNED} platforms in {MARKETS_COVERED} countries and show you the results in a 30-minute call.
          </p>
          <a
            href={DEMO_HREF}
            style={{ background: BLUE, color: W, borderRadius: 12, padding: '18px 44px', fontSize: 16, fontWeight: 800, textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 20px rgba(37,99,235,0.4)' }}
          >
            Request a Demo <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
        </div>
      </section>

      {/* Footer: the shared site footer (components/SiteChrome.tsx) renders below. */}

    </div>
  );
}
