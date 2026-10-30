'use client';

import Link from 'next/link';
import { PLATFORMS_SCANNED, TRUST_SIGNAL_COUNT, FIX_TYPE_COUNT } from '@/lib/publicStats';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

export default function AboutPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Our Story</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,64px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            We built the fix engine <span style={{ color: BLUE }}>nobody else would build</span>
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, lineHeight: 1.7, maxWidth: 620 }}>
            Every other AI visibility tool tells you the problem. Rankall.io gives you the solution — and proves it worked.
          </p>
        </div>
      </section>

      {/* STORY */}
      <section style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${BLUE}`, borderRadius: 20, padding: '40px 36px', boxShadow: '0 12px 32px rgba(10,10,20,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px' }}>The Story</p>
          <p style={{ fontSize: 16, color: BODY, lineHeight: 1.85, margin: '0 0 18px' }}>
            AI search changed everything overnight. ChatGPT crossed 800 million weekly active users (OpenAI, October 2025). Gemini integrated into every Google product. And suddenly the question every business owner needed to answer was not where do I rank on Google — it was what does AI say about me.
          </p>
          <p style={{ fontSize: 16, color: BODY, lineHeight: 1.85, margin: '0 0 18px' }}>
            We looked at every product in the market. They all showed you a score. None showed you how to fix it. None verified their recommendations actually worked. None mapped the full ecosystem of trust signals that drives AI recommendations.
          </p>
          <p style={{ fontSize: 16, color: BODY, lineHeight: 1.85, margin: 0 }}>
            That gap is why Rankall.io exists. We are building the Unified AI Trust and Recommendation Intelligence Graph — the operating system for AI-era business discoverability.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28, paddingTop: 24, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 8px 24px rgba(27,23,255,0.3)' }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: '#fff' }}>N</span>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>Nandish Patel</p>
              <p style={{ fontSize: 14, color: BODY, margin: 0 }}>Founder, Rankall.io</p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '72px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '48px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 32, textAlign: 'center', boxShadow: '0 12px 32px rgba(10,10,20,0.06)' }}>
          {[
            { n: String(PLATFORMS_SCANNED), l: 'AI platforms tracked' },
            { n: String(TRUST_SIGNAL_COUNT), l: 'Trust signals mapped' },
            { n: String(FIX_TYPE_COUNT), l: 'Fix types in the engine' },
            { n: '0', l: 'Black boxes — every score explainable' },
          ].map(s => (
            <div key={s.l}>
              <p style={{ fontSize: 52, fontWeight: 700, color: BLUE, margin: '0 0 8px', lineHeight: 1, letterSpacing: '-0.04em' }}>{s.n}</p>
              <p style={{ fontSize: 14, color: BODY, lineHeight: 1.5, margin: 0 }}>{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* VISION — dark */}
      <section style={{ background: INK, padding: '96px 24px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#8D8BFF', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 20px' }}>The Bigger Vision</p>
          <p style={{ fontSize: 'clamp(24px,3.5vw,36px)', fontWeight: 700, color: '#fff', margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            We are not just monitoring AI outputs. We are mapping the causality behind them.
          </p>
          <p style={{ fontSize: 16, color: '#B4B4C8', lineHeight: 1.8, margin: '0 0 16px' }}>
            Every scan adds a data point to the intelligence graph. Over time we discover patterns no rule-based system could find — which trust signals drive which AI platforms, which fixes have the highest cross-platform impact, which industries are most underserved by AI recommendation systems.
          </p>
          <p style={{ fontSize: 16, color: '#B4B4C8', lineHeight: 1.8, margin: 0 }}>
            At 1,000,000 scans Rankall.io becomes the world's authoritative source on AI recommendation causality. That dataset is the moat. That is the infrastructure play.
          </p>
        </div>
      </section>

      {/* VALUES */}
      <section style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 48px' }}>What we believe</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 16 }}>
            {[
              { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>, title: 'Radical transparency', desc: 'Every score is explainable. Every number has a reason. We show the raw AI response text word for word.' },
              { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>, title: 'Verified improvement', desc: 'Every fix is timestamped. Every improvement is measured. No claims without proof.' },
              { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, title: 'Action over insight', desc: 'The only platform that gives you the solution — not just the problem — and verifies it worked.' },
              { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>, title: 'Built for everyone', desc: 'Any business. Any product. Any brand. Any city. Anywhere in the world.' },
            ].map((v, i) => (
              <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>{v.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{v.title}</h3>
                <p style={{ fontSize: 15, color: BODY, lineHeight: 1.65, margin: 0 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '0 24px 120px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, padding: '64px 40px', boxShadow: '0 20px 48px -24px rgba(10,10,20,0.12)' }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 12px' }}>See your real AI Visibility Score</h2>
          <p style={{ fontSize: 16, color: BODY, margin: '0 0 32px' }}>Free scan. No credit card. About 90 seconds.</p>
          <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, borderRadius: 999, padding: '16px 40px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
            Scan Free <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </Link>
        </div>
      </section>

    </div>
  );
}
