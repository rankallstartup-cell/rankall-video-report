'use client';

import { useState } from 'react';
import { PLATFORMS_SCANNED, MARKETS_COVERED, TRUST_SIGNALS_LABEL, INDUSTRIES_TRACKED, PRICE_PERSONAL_USD } from '@/lib/publicStats';

const BG = '#0a0a1a';
const CARD = '#0f1629';
const BORDER = '#1f2937';
const PURPLE = '#1B17FF';
const TEXT = '#ffffff';
const SUBTLE = '#9ca3af';

// ax75/azxh: platform/market counts and the entry price come from
// lib/publicStats.ts. Stats/hooks that could not be traced to data
// ("1,000+ scanned", "91% score below 50", "+36 average improvement",
// "$38 billion") were removed — journalists repeat press-kit numbers.
const SHORT_BOILERPLATE =
  `Rankall.io is the AI visibility platform for local businesses. We scan ${PLATFORMS_SCANNED} AI platforms across ${MARKETS_COVERED} countries to show businesses why ChatGPT, Gemini, and ${PLATFORMS_SCANNED - 2} other AI systems recommend their competitor instead of them — and how to fix it.`;

const LONG_BOILERPLATE =
  `Rankall.io is an AI visibility platform built specifically for local businesses. As AI platforms like ChatGPT, Gemini, and Perplexity become the primary way consumers discover local services, Rankall helps businesses understand and improve how they appear in AI recommendations. Our platform scans ${PLATFORMS_SCANNED} AI systems across ${MARKETS_COVERED} countries, provides actionable fix recommendations, and verifies improvements — giving local businesses the tools to compete in the AI-first discovery era. Rankall serves dentists, lawyers, HVAC companies, restaurants, and other local service businesses.`;

const STATS = [
  { value: String(PLATFORMS_SCANNED), label: 'AI Platforms Tracked' },
  { value: String(MARKETS_COVERED), label: 'Countries' },
  { value: TRUST_SIGNALS_LABEL, label: 'Trust Signals Checked' },
  { value: String(INDUSTRIES_TRACKED), label: 'Industries Covered' },
];

const FAST_FACTS: [string, string][] = [
  ['Founding', '2026'],
  ['Headquarters', 'Chicago, Illinois'],
  ['Founder', 'Nandish'],
  ['Category', 'AI Visibility / Local SEO'],
  ['Tech Stack', 'Next.js, Supabase, Anthropic AI'],
  ['Platforms Tracked', 'ChatGPT, Gemini, Perplexity, Grok, Copilot, Claude, DeepSeek, Mistral, Kimi, Groq, Google AI'],
  ['Countries', 'US, UK, Australia, Canada, India, UAE, Singapore, Ireland, Nigeria, Kenya, Ghana, South Africa, Philippines, New Zealand'],
  ['Pricing', `From $${PRICE_PERSONAL_USD}/month`],
  ['Free Scan', 'rankall.io'],
];

const STORY_ANGLES = [
  { title: 'The AI Visibility Gap', hook: 'Ranking on Google does not mean ChatGPT recommends you. Many local businesses never show up in AI answers.' },
  { title: 'The New Local SEO', hook: 'Google rankings no longer guarantee customers. Here\'s what does in 2026.' },
  { title: 'David vs Goliath', hook: 'How small local businesses can compete with national chains in AI recommendations.' },
  { title: 'The Invisible Competitor', hook: 'When AI names a competitor instead of you, the customer never sees your business at all.' },
];

const PURPLE_LOGO_SVG = `<svg width="200" height="40" xmlns="http://www.w3.org/2000/svg"><text x="0" y="30" font-family="Arial" font-size="28" font-weight="900" fill="#1B17FF">rankall</text></svg>`;
const DARK_LOGO_SVG = `<svg width="200" height="40" xmlns="http://www.w3.org/2000/svg"><text x="0" y="30" font-family="Arial" font-size="28" font-weight="900" fill="#0a0a1a">rankall</text></svg>`;

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        // b8az: only claim "Copied" when the write succeeds (b8b3 pattern).
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard unavailable — leave the button as-is */ });
      }}
      style={{
        background: copied ? '#22c55e' : 'transparent',
        border: `1px solid ${copied ? '#22c55e' : PURPLE}`,
        color: copied ? '#0a0a1a' : PURPLE,
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Copied</>) : (<><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM112 192l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg> {label}</>)}
    </button>
  );
}

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PressPageClient() {
  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px 96px' }}>

        {/* SECTION 1: Hero */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h1 style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
            Rankall in the Press
          </h1>
          <p style={{ fontSize: 17, color: SUBTLE, maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.6 }}>
            Resources for journalists, bloggers, and media professionals covering AI visibility and local business.
          </p>
          {/* b8az: honest empty state — the heading "Rankall in the Press"
              implied coverage that does not exist yet. No coverage is
              claimed or shown anywhere on this page. */}
          <p style={{ fontSize: 14, color: TEXT, maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.6 }}>
            No press coverage yet — Rankall launched in 2026. If you are covering AI visibility, we would love to talk.
          </p>
          <a
            href="mailto:press@rankall.io"
            style={{ display: 'inline-block', background: PURPLE, color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 32px', borderRadius: 10, textDecoration: 'none' }}
          >
            <svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg> press@rankall.io
          </a>
        </div>

        {/* SECTION 2: Company Boilerplate */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>About Rankall</h2>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Short ({SHORT_BOILERPLATE.split(/\s+/).filter(Boolean).length} words)</p>
              <CopyButton text={SHORT_BOILERPLATE} />
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT, margin: 0 }}>{SHORT_BOILERPLATE}</p>
          </div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Long ({LONG_BOILERPLATE.split(/\s+/).filter(Boolean).length} words)</p>
              <CopyButton text={LONG_BOILERPLATE} />
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: TEXT, margin: 0 }}>{LONG_BOILERPLATE}</p>
          </div>
        </section>

        {/* SECTION 3: Key Statistics */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>Key Statistics</h2>
          {/* b8az: the stats were unsourced. All four come from
              lib/publicStats.ts (live platform configuration) — the
              source is now stated, with the date. */}
          <p style={{ fontSize: 13, color: SUBTLE, margin: '0 0 16px', lineHeight: 1.6 }}>
            From Rankall&apos;s platform configuration, October 2026 — the counts the product itself runs on.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ background: CARD, border: `1px solid ${PURPLE}44`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 32, fontWeight: 900, color: PURPLE, margin: '0 0 6px' }}>{s.value}</p>
                <p style={{ fontSize: 13, color: SUBTLE, margin: 0, lineHeight: 1.4 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: Logo Downloads */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>Brand Assets</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: SUBTLE, marginBottom: 16 }}>Dark background</p>
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: PURPLE, fontFamily: 'Arial, sans-serif' }}>rankall</span>
              </div>
              <button
                onClick={() => downloadSvg(PURPLE_LOGO_SVG, 'rankall-logo-purple.svg')}
                style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg> Download SVG
              </button>
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: SUBTLE, marginBottom: 16 }}>Light background</p>
              <div style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#0a0a1a', fontFamily: 'Arial, sans-serif' }}>rankall</span>
              </div>
              <button
                onClick={() => downloadSvg(DARK_LOGO_SVG, 'rankall-logo-dark.svg')}
                style={{ width: '100%', background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg> Download SVG
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 5: Fast Facts */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>Fast Facts</h2>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '8px 24px' }}>
            {FAST_FACTS.map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: i === FAST_FACTS.length - 1 ? 'none' : `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                <p style={{ width: 160, flexShrink: 0, fontSize: 13, fontWeight: 700, color: SUBTLE, margin: 0 }}>{k}</p>
                <p style={{ fontSize: 14, color: TEXT, margin: 0, lineHeight: 1.6 }}>{v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 6: Story Angles */}
        <section style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>Story Ideas</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {STORY_ANGLES.map((a, i) => (
              <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{a.title}</h3>
                  <CopyButton text={a.title} label="" />
                </div>
                <p style={{ fontSize: 13.5, color: SUBTLE, lineHeight: 1.6, margin: '0 0 16px' }}>{a.hook}</p>
                {/* b8az: each pitch link now names its story in the subject
                    + body — the four links were identical blank mailtos. */}
                <a href={`mailto:press@rankall.io?subject=${encodeURIComponent(`Story pitch: ${a.title}`)}&body=${encodeURIComponent(`Hi Rankall press team,\n\nI'd like to cover: ${a.title}\n${a.hook}\n\n— `)}`} style={{ fontSize: 13, color: PURPLE, fontWeight: 700, textDecoration: 'none' }}>
                  Pitch this story <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 7: Contact */}
        <section>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>Media Inquiries</h2>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>press@rankall.io</p>
              <CopyButton text="press@rankall.io" />
            </div>
            <p style={{ fontSize: 13, color: SUBTLE, margin: '0 0 20px' }}>Response time: within 24 hours</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href="https://linkedin.com/company/rankall" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: PURPLE, fontWeight: 700, textDecoration: 'none' }}>
                LinkedIn <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              <a href="https://twitter.com/rankallai" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: PURPLE, fontWeight: 700, textDecoration: 'none' }}>
                X / Twitter <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
