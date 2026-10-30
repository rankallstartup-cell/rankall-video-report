'use client';

import Link from 'next/link';
import { SCAN_TIME_LABEL, TRUST_SIGNALS_LABEL, PLATFORMS_SCANNED, PLATFORM_SCORING_WEIGHTS } from '@/lib/publicStats';

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

export default function VsPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '72px 20px 64px', textAlign: 'center', background: '#F6F6FB', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 740, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF0FF', border: '1.5px solid #C9D4FF', borderRadius: 100, padding: '6px 18px', marginBottom: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>A different kind of product</span>
          </div>
          <h1 style={{ fontSize: 'clamp(30px,5.5vw,52px)', fontWeight: 900, color: NAVY, letterSpacing: '-2px', lineHeight: 1.1, marginBottom: 20 }}>
            Most products show you<br />
            what AI says.<br />
            <span style={{ color: BLUE }}>We show you why — and what to do about it.</span>
          </h1>
          <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.75, maxWidth: 560, margin: '0 auto' }}>
            AI visibility tools read outputs and show scores. Rankall.io correlates trust signals with AI recommendation behavior, predicts fix impact, and verifies that fixes actually worked. That is a fundamentally different approach.
          </p>
        </div>
      </section>

      {/* TOOL VS INFRASTRUCTURE */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '64px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>

          {/* Tools */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '32px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 100, padding: '5px 14px', marginBottom: 22 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>Typical AI visibility tools</span>
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 10, letterSpacing: '-0.5px', lineHeight: 1.3 }}>Read the output.<br />Show a score.<br />Leave you guessing.</h3>
            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginBottom: 22 }}>
              They query AI platforms, record the responses, and show you a number. What the number means and what to do about it — that part is usually left to you.
            </p>
            {[
              // b8bg: softened — these describe the typical generic
              // approach, not measured claims about any named product
              // (see the footnote below the columns).
              'A score, without the why',
              'Generic suggestions, not tied to your signals',
              'No link between trust signals and the score',
              'No predicted impact per fix',
              'No verification that fixes worked',
              'No learning from outcomes over time',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={{ color: RED, fontSize: 14, flexShrink: 0, fontWeight: 700 }}><svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>
                <span style={{ fontSize: 14, color: GRAY }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Rankall */}
          <div style={{ background: NAVY, border: '1.5px solid rgba(37,99,235,0.5)', borderRadius: 18, padding: '32px 28px', boxShadow: '0 8px 32px rgba(37,99,235,0.12)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 100, padding: '5px 14px', marginBottom: 22 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#60A5FA', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD' }}>Rankall.io</span>
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 800, color: '#FFFFFF', marginBottom: 10, letterSpacing: '-0.5px', lineHeight: 1.3 }}>Explain the why.<br />Predict the fix.<br />Verify it worked.</h3>
            <p style={{ fontSize: 14, color: '#8A8AA3', lineHeight: 1.7, marginBottom: 22 }}>
              We correlate {TRUST_SIGNALS_LABEL} trust signals with AI recommendation behavior — so you understand the gap, not just the score. Every fix comes with a predicted impact. Every improvement is verified.
            </p>
            {[
              'Explains exactly why your score is what it is',
              `Correlates ${TRUST_SIGNALS_LABEL} trust signals with AI behavior`,
              'Predicts fix impact before you apply anything',
              'Generates exact content to close each gap',
              'Timestamped before-and-after verification',
              'Prediction model improves with every scan',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#34D399', fontSize: 14, flexShrink: 0, fontWeight: 700 }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                <span style={{ fontSize: 14, color: '#CBD5E1' }}>{t}</span>
              </div>
            ))}
          </div>

          {/* Dataset */}
          <div style={{ background: W, border: '1.5px solid #DDD6FE', borderRadius: 18, padding: '32px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 100, padding: '5px 14px', marginBottom: 22 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE }}>Built to compound over time</span>
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 10, letterSpacing: '-0.5px', lineHeight: 1.3 }}>A dataset that grows more accurate with every scan.</h3>
            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginBottom: 22 }}>
              Every fix applied and its verified result feeds back into the prediction model. Over time the predictions get more accurate, the fix recommendations get more specific, and the gap intelligence gets deeper.
            </p>
            {[
              'Every scan adds signal correlation data',
              'Every verified fix refines the prediction model',
              'Accuracy improves as the dataset grows',
              'Industry-specific patterns emerge over time',
              'Platform-specific citation behavior tracked',
              'Gets more valuable the longer you use it',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={{ color: PURPLE, fontSize: 14, flexShrink: 0, fontWeight: 700 }}>◆</span>
                <span style={{ fontSize: 14, color: GRAY }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        {/* b8bg: the "Typical tools" column describes the generic approach, not a measured claim about any named product. */}
        <p style={{ fontSize: 12, color: LGRAY, maxWidth: 980, margin: '14px auto 0', padding: '0 20px' }}>
          The “Typical AI visibility tools” column describes the generic approach — a score without the why — not a measured claim about any named product.
        </p>
      </section>

      {/* THE GRAPH */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 0' }}>
        <div style={{ background: NAVY, borderRadius: 18, padding: '44px 36px', border: '1px solid rgba(37,99,235,0.2)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 10 }}>How it works under the hood</p>
          <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 900, color: '#FFFFFF', textAlign: 'center', marginBottom: 6, letterSpacing: '-0.5px' }}>
            We are not reading AI outputs.
          </h2>
          <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 900, color: '#60A5FA', textAlign: 'center', marginBottom: 36, letterSpacing: '-0.5px' }}>
            We are correlating what drives them.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            {[
              {
                label: `${TRUST_SIGNALS_LABEL} Trust Signals`,
                color: '#34D399',
                items: ['Google Business Profile', 'Yelp and Trustpilot', 'Reddit community signals', 'Schema and technical data', 'Industry directories', 'Website contact and NAP data'],
              },
              {
                label: 'Rankall Intelligence Engine',
                color: '#60A5FA',
                items: ['ML intent classification', 'Signal correlation mapping', 'Gap narrative generation', 'Fix impact prediction', 'Outcome verification', 'Continuous model refinement'],
              },
              {
                label: '12 AI Recommendation Platforms',
                color: '#A78BFA',
                // b8bg: canonical scoring weights from publicStats (single
                // source of truth, enforced by the consistency test) —
                // all 12 platforms, labelled weights not "share". The old
                // list had wrong numbers (Perplexity 11% not 9%, Grok 8%
                // not 7%, Claude 7% not 6%), omitted Google AI + Copilot,
                // and counted 5 + 5 = 10, not 11.
                items: PLATFORM_SCORING_WEIGHTS.map((p) => `${p.name} — ${p.weightPct}% scoring weight`),
              },
            ].map((col, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 18px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: col.color, marginBottom: 16 }}>{col.label}</p>
                {col.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 9, marginBottom: 9, alignItems: 'center' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#8A8AA3' }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EARLY SIGNALS */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 'clamp(22px,3.5vw,30px)', fontWeight: 800, color: NAVY, letterSpacing: '-1px', marginBottom: 10 }}>Patterns we are watching for</h2>
          {/* b8bg: the numbers below are ILLUSTRATIVE examples of the kind
              of pattern the dataset may show as it grows — not measured
              results. The old heading claimed them as patterns "from our
              dataset" with no sample, date, or methodology. */}
          <p style={{ fontSize: 15, color: GRAY, maxWidth: 500, margin: '0 auto' }}>Illustrative examples — not measured results. The kind of pattern we expect the data to show as the dataset grows.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          {[
            { stat: '89%',  label: 'Prediction confidence', tag: 'Illustrative', desc: 'Example: businesses with complete directory listings and FAQ schema appearing in ChatGPT recommendations across dental and legal queries.', color: BLUE   },
            { stat: '~0.8', label: 'Reddit-Perplexity link',  tag: 'Illustrative', desc: 'Example: Reddit community presence correlating with Perplexity local recommendations — more so than most other single signals.', color: PURPLE },
            { stat: '+20pts', label: 'Review response lift', tag: 'Illustrative', desc: 'Example: businesses that actively respond to Google reviews scoring higher on Gemini local queries.', color: GREEN  },
          ].map((s, i) => (
            <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '26px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 42, fontWeight: 900, color: s.color, marginBottom: 6, lineHeight: 1 }}>{s.stat}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{s.label} <span style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase' as const }}>· {s.tag}</span></p>
              <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHAT CANNOT BE REPLICATED QUICKLY */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 0' }}>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '40px 36px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>What takes time to build</p>
          <h2 style={{ fontSize: 'clamp(20px,3vw,26px)', fontWeight: 800, color: NAVY, letterSpacing: '-0.5px', marginBottom: 14 }}>
            You can copy an interface in a week.<br />
            You cannot copy a verified outcome dataset.
          </h2>
          <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.8, marginBottom: 32, maxWidth: 620 }}>
            Every fix we recommend, every business that applies it, and every score change that results — all stored and feeding the prediction model. A product starting from scratch starts with zero verified outcomes. We are building that dataset from day one.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {[
              { n: TRUST_SIGNALS_LABEL, l: 'Trust signals mapped', c: BLUE   },
              { n: String(PLATFORMS_SCANNED), l: 'AI platforms correlated', c: PURPLE },
              { n: '7',    l: 'Industry verticals tracked',   c: GREEN  },
              { n: 'Day 1', l: 'Dataset building started',    c: AMBER  },
            ].map(s => (
              <div key={s.l} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 32, fontWeight: 900, color: s.c, marginBottom: 6, lineHeight: 1 }}>{s.n}</p>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.4 }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHERE THIS IS GOING */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 0' }}>
        <div style={{ background: 'linear-gradient(135deg,#EEF0FF 0%,#F5F3FF 100%)', border: '1.5px solid #C9D4FF', borderRadius: 18, padding: '40px 36px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>The longer-term vision</p>
          <h2 style={{ fontSize: 'clamp(20px,3vw,26px)', fontWeight: 800, color: NAVY, letterSpacing: '-0.5px', marginBottom: 14 }}>
            At scale, this becomes something tools can never become.
          </h2>
          <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.8, marginBottom: 28, maxWidth: 620 }}>
            As the dataset grows, Rankall.io starts to answer questions that no other product can — which signals actually drive AI recommendations, which fixes have the highest cross-platform impact, which industries are most underserved by AI recommendation systems. That intelligence is what makes this infrastructure rather than a tool.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
            {[
              { name: 'Google',     why: 'AI recommendation signal data' },
              { name: 'OpenAI',     why: 'ChatGPT citation behavior data' },
              { name: 'Amazon',     why: 'Product recommendation signals' },
              { name: 'Salesforce', why: 'Trust intelligence for CRM' },
              { name: 'Semrush',    why: 'AI-era search intelligence' },
              { name: 'Shopify',    why: 'Merchant discoverability data' },
            ].map((a, i) => (
              <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '16px 14px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 5 }}>{a.name}</p>
                <p style={{ fontSize: 11, color: GRAY, lineHeight: 1.4 }}>{a.why}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '72px 20px', textAlign: 'center', background: '#EEF0FF', borderTop: `1px solid #C9D4FF`, marginTop: 56 }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 900, color: NAVY, letterSpacing: '-1.5px', lineHeight: 1.15, marginBottom: 14 }}>
          See the difference for yourself.
        </h2>
        <p style={{ fontSize: 16, color: GRAY, maxWidth: 380, margin: '0 auto 32px', lineHeight: 1.65 }}>
          7 days free. Card required. Real results in {SCAN_TIME_LABEL}.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: BLUE, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}>
            Get Started Free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          <Link href="/intelligence-graph" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 600, color: NAVY, textDecoration: 'none', display: 'inline-block' }}>
            See the Intelligence Graph <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </section>

    </div>
  );
}