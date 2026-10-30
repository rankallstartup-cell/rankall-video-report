'use client';

import Link from 'next/link';
import { TRUST_SIGNALS_LABEL, PLATFORMS_SCANNED, PLATFORM_SCORING_WEIGHTS, TRUST_SIGNAL_COUNT, INDUSTRIES_TRACKED } from '@/lib/publicStats';

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const AMBER  = '#D97706';
const PURPLE = '#1B17FF';
const RED    = '#DC2626';
const GRAY   = '#55556A';
const LGRAY  = '#8A8AA3';

const SIGNALS = [
  { cat: 'Reviews & Ratings',     color: BLUE,   pct: '30%', sources: ['Google Business Profile', 'Yelp', 'Trustpilot', 'Tripadvisor', 'BBB'] },
  { cat: 'Social Presence',       color: PURPLE, pct: '20%', sources: ['Reddit', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'X/Twitter'] },
  { cat: 'Directories',           color: GREEN,  pct: '15%', sources: ['Healthgrades', 'Avvo', 'G2', 'Clutch', 'Zocdoc', 'Martindale'] },
  { cat: 'Schema & Technical',    color: AMBER,  pct: '15%', sources: ['LocalBusiness JSON-LD', 'FAQ Schema', 'Product Schema', 'PageSpeed'] },
  { cat: 'Citations & Press',     color: RED,    pct: '10%', sources: ['Google News', 'Local Press', 'Industry Publications', 'Authority Links'] },
  { cat: 'E-Commerce Signals',    color: BLUE,   pct: '10%', sources: ['Amazon', 'Etsy', 'Google Shopping', 'TikTok Shop', 'Shopify'] },
];

const PLATFORM_META: Record<string, { color: string; signals: string[] }> = {
  ChatGPT: { color: '#10A37F', signals: ['FAQ Schema', 'Authority Press', 'Structured Data'] },
  Gemini: { color: '#4285F4', signals: ['Google Business', 'Reviews', 'Google News'] },
  'Google AI': { color: '#34A853', signals: ['AI Overviews', 'Search', 'Knowledge Graph'] },
  Copilot: { color: '#0F6CBD', signals: ['Bing', 'Edge', 'Windows'] },
  Perplexity: { color: '#20B2AA', signals: ['Reddit', 'Citations', 'Community Forums'] },
  Grok: { color: '#1DA1F2', signals: ['X/Twitter', 'Social Mentions', 'Trending'] },
  Claude: { color: '#D4774A', signals: ['Structured Data', 'Authority Sources'] },
  DeepSeek: { color: '#4D6BFE', signals: ['Reasoning', 'Citations'] },
  Mistral: { color: '#FF7000', signals: ['Le Chat', 'European Sources'] },
  Kimi: { color: '#A855F7', signals: ['E-Commerce', 'Product Reviews'] },
  Groq: { color: '#059669', signals: ['General Trust Signals'] },
};

// b8aq: platform weights come from the single canonical table
// (lib/publicStats.ts PLATFORM_SCORING_WEIGHTS — the same table /vs and
// /how-it-works use). The old hardcoded list showed only 7 platforms with
// stale weights summing to 76% (Perplexity 11 vs 9, Grok 8 vs 7, Claude 7
// vs 6, Kimi 4 vs 2, Groq 3 vs 1) and omitted Google AI, Copilot, DeepSeek,
// Mistral entirely.
const PLATFORMS = PLATFORM_SCORING_WEIGHTS.map((p) => ({
  name: p.name,
  w: `${p.weightPct}%`,
  ...(PLATFORM_META[p.name] ?? { color: '#8A8AA3', signals: ['General Trust Signals'] }),
}));

const LOOP = [
  { n: '01', title: 'Scan runs',           desc: `All 12 AI platforms queried simultaneously. ${TRUST_SIGNALS_LABEL} trust signals pulled in parallel.`,                           color: BLUE   },
  { n: '02', title: 'Correlation mapped',  desc: 'ML engine correlates which signals drove which platform recommendations for this business type and location.',   color: PURPLE },
  { n: '03', title: 'Fix predicted',       desc: 'Based on verified outcomes from similar businesses, fix impact is predicted before anything is applied.',        color: GREEN  },
  { n: '04', title: 'Fix applied',         desc: 'Business applies the recommended fix using AI-generated content from the Fix Engine.',                          color: AMBER  },
  { n: '05', title: 'Outcome verified',    desc: 'Verification rescan runs ~7 days after you apply a fix. Before and after scores compared. Timestamped proof stored.',                            color: RED    },
  { n: '06', title: 'Model improves',      desc: 'Verified outcome feeds back into the prediction model. Next similar business gets a more accurate prediction.',  color: BLUE   },
];

export default function IntelligenceGraphPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '72px 20px 64px', textAlign: 'center', background: 'linear-gradient(180deg,#EEF0FF 0%,#F6F6FB 100%)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF0FF', border: '1.5px solid #C9D4FF', borderRadius: 100, padding: '6px 18px', marginBottom: 24 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>The Intelligence Graph</span>
          </div>
          <h1 style={{ fontSize: 'clamp(30px,5.5vw,54px)', fontWeight: 900, color: NAVY, letterSpacing: '-2px', lineHeight: 1.08, marginBottom: 20 }}>
            We are not reading<br />AI outputs.<br />
            <span style={{ color: BLUE }}>We are correlating<br />what drives them.</span>
          </h1>
          <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.75, maxWidth: 540, margin: '0 auto' }}>
            Rankall.io maps the relationship between {TRUST_SIGNALS_LABEL} trust signals and AI recommendation behavior across 12 platforms. Every scan adds to that map. Every verified outcome makes it more accurate.
          </p>
          {/* b8aq: honest dataset-state declaration (S2) — this is a direction
              page, not a data page. No correlations have been published yet. */}
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, maxWidth: 540, margin: '16px auto 0' }}>
            Dataset status: building — no correlations published yet. The patterns below are illustrative examples of what the graph will surface.
          </p>
        </div>
      </section>

      {/* THE GRAPH VISUAL */}
      <section style={{ background: NAVY, padding: '64px 20px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 48 }}>
            How the intelligence graph works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, alignItems: 'start' }}>

            {/* Left — Trust Signals */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Trust signal categories</p>
              <p style={{ fontSize: 11, color: '#8A8AA3', marginBottom: 16 }}>{TRUST_SIGNAL_COUNT} signals across 6 categories — example sources shown.</p>
              {SIGNALS.map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.cat}</p>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}22`, padding: '2px 8px', borderRadius: 100 }}>{s.pct}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {s.sources.map(src => (
                      <span key={src} style={{ fontSize: 11, color: '#8A8AA3', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 8px' }}>{src}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Center — Engine */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Rankall Engine</p>
              <div style={{ background: 'rgba(37,99,235,0.12)', border: '1.5px solid rgba(37,99,235,0.3)', borderRadius: 16, padding: '28px 24px', width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(37,99,235,0.2)', border: '2px solid rgba(37,99,235,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <span style={{ fontSize: 22, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="22" height="22" fill="#93C5FD" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg></span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>Intelligence Engine</p>
                  <p style={{ fontSize: 12, color: '#8A8AA3' }}>7-layer ML pipeline</p>
                </div>
                {['Intent Classification', 'Signal Correlation', 'Gap Diagnosis', 'Fix Prediction', 'Content Generation', 'Outcome Verification', 'Model Retraining'].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(37,99,235,0.3)', border: '1px solid rgba(37,99,235,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: '#93C5FD' }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#CBD5E1' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — AI Platforms */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>{PLATFORMS_SCANNED} AI Recommendation Platforms</p>
              {PLATFORMS.map((p, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRight: `3px solid ${p.color}`, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}88` }} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{p.name}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.w}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.signals.map(sig => (
                      <span key={sig} style={{ fontSize: 11, color: '#8A8AA3', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 8px' }}>{sig}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* THE COMPOUNDING LOOP */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '64px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, color: NAVY, letterSpacing: '-1px', marginBottom: 12 }}>The compounding loop</h2>
          <p style={{ fontSize: 15, color: GRAY, maxWidth: 480, margin: '0 auto' }}>Every scan, fix, and verified outcome makes the next prediction more accurate. The product gets more valuable over time.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          {LOOP.map((step, i) => (
            <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '22px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'relative' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: `${step.color}12`, border: `1.5px solid ${step.color}33`, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: step.color }}>{step.n}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{step.title}</h3>
              <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65 }}>{step.desc}</p>
              {i < LOOP.length - 1 && (
                <div style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: LGRAY, display: 'none' }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px'}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></div>
              )}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF0FF', border: '1.5px solid #C9D4FF', borderRadius: 100, padding: '8px 20px' }}>
            <span style={{ fontSize: 14, color: BLUE, display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg></span>
            <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Loop repeats — model improves with every scan</span>
          </div>
        </div>
      </section>

      {/* WHAT THIS DISCOVERS */}
      <section style={{ background: W, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '64px 20px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(22px,3.5vw,32px)', fontWeight: 800, color: NAVY, letterSpacing: '-1px', marginBottom: 12 }}>Patterns the graph surfaces</h2>
            <p style={{ fontSize: 15, color: GRAY, maxWidth: 500, margin: '0 auto' }}>Illustrative examples of the patterns the graph is built to surface — not measured results from our dataset.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {[
              { color: BLUE,   bg: '#EEF0FF', bd: '#C9D4FF', stat: '89%', label: 'FAQ schema correlation', body: 'Businesses with complete FAQ schema markup consistently appear in ChatGPT recommendations for service queries. Those without it rarely do.' },
              { color: PURPLE, bg: '#F5F3FF', bd: '#DDD6FE', stat: '~0.8', label: 'Reddit-Perplexity link', body: 'Reddit community presence shows a strong correlation with Perplexity local recommendations — stronger than most other individual signals.' },
              { color: GREEN,  bg: '#ECFDF5', bd: '#A7F3D0', stat: '+20pts', label: 'Review response impact', body: 'Businesses that actively respond to Google reviews consistently score higher on Gemini local queries across multiple categories and cities.' },
              { color: AMBER,  bg: '#FFFBEB', bd: '#FDE68A', stat: '62%', label: 'Tripadvisor citation rate', body: 'Tripadvisor is cited in 62% of Austin restaurant queries across all platforms we track — making it the highest-leverage missing signal for restaurants.' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, border: `1.5px solid ${s.bd}`, borderRadius: 14, padding: '24px 20px' }}>
                <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: s.color, background: '#FFFFFF', border: `1px solid ${s.bd}`, borderRadius: 100, padding: '2px 10px', marginBottom: 10 }}>Illustrative</span>
                <p style={{ fontSize: 40, fontWeight: 900, color: s.color, marginBottom: 6, lineHeight: 1 }}>{s.stat}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{s.label}</p>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.7 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY THIS MATTERS AT SCALE */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '64px 20px' }}>
        <div style={{ background: NAVY, borderRadius: 18, padding: '48px 40px', border: '1px solid rgba(37,99,235,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 40, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>The longer view</p>
              <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, color: '#FFFFFF', marginBottom: 14, letterSpacing: '-0.5px', lineHeight: 1.3 }}>
                The graph becomes more valuable the more it grows.
              </h2>
              <p style={{ fontSize: 14, color: '#8A8AA3', lineHeight: 1.8, marginBottom: 20 }}>
                A product that shows you a score is useful today. A system that maps why AI recommends one business over another — and gets more accurate with every data point — becomes something more durable over time.
              </p>
              <p style={{ fontSize: 14, color: '#8A8AA3', lineHeight: 1.8 }}>
                That is the direction we are building in. Not a dashboard. A correlation engine that gets smarter with every scan, every fix, and every verified outcome.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { n: TRUST_SIGNALS_LABEL, l: 'Trust signals mapped', c: '#60A5FA' },
                { n: String(PLATFORMS_SCANNED), l: 'AI platforms correlated', c: '#A78BFA' },
                { n: String(INDUSTRIES_TRACKED), l: 'Industries tracked', c: '#34D399' },
                { n: 'Day 1', l: 'Dataset building started',  c: '#FCD34D' },
              ].map(s => (
                <div key={s.l} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 30, fontWeight: 900, color: s.c, marginBottom: 6, lineHeight: 1 }}>{s.n}</p>
                  <p style={{ fontSize: 12, color: '#8A8AA3', lineHeight: 1.4 }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '72px 20px', textAlign: 'center', background: '#EEF0FF', borderTop: `1px solid #C9D4FF` }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 900, color: NAVY, letterSpacing: '-1.5px', lineHeight: 1.15, marginBottom: 14 }}>
          See the graph working<br />on your business.
        </h2>
        <p style={{ fontSize: 16, color: GRAY, maxWidth: 380, margin: '0 auto 32px', lineHeight: 1.65 }}>
          7 days free. Card required. Real signals. Real score.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: BLUE, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}>
            Get Started Free <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </Link>
          <Link href="/how-it-works" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 600, color: NAVY, textDecoration: 'none', display: 'inline-block' }}>
            How It Works <svg viewBox="0 0 448 512" width="14" height="14" fill="#0A0A14" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </Link>
        </div>
      </section>

    </div>
  );
}