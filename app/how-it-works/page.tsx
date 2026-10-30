'use client';

import Link from 'next/link';
import Image from 'next/image';
import { PLATFORM_SCORING_WEIGHTS, TRUST_SIGNALS_LABEL } from '@/lib/publicStats';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

// b8am: platform weights come from PLATFORM_SCORING_WEIGHTS (the single
// source of truth in lib/publicStats.ts) — never hardcoded here. These
// are Rankall's SCORING weights (each platform's share of the composite
// score), NOT market-share measurements; the page used to mislabel them
// as weighted-by-market-share with no source.
const PLATFORM_META: Record<string, { color: string; logo: string }> = {
  'ChatGPT':    { color: '#10A37F', logo: '/platforms/chatgpt.png' },
  'Gemini':     { color: '#4285F4', logo: '/platforms/gemini.png' },
  'Google AI':  { color: '#EA4335', logo: '/platforms/google-ai.png' },
  'Copilot':    { color: '#0078D4', logo: '/platforms/copilot.png' },
  'Perplexity': { color: '#20B2AA', logo: '/platforms/perplexity.png' },
  'Grok':       { color: '#1DA1F2', logo: '/platforms/grok.png' },
  'Claude':     { color: '#D4774A', logo: '/platforms/claude.png' },
  'DeepSeek':   { color: '#6366F1', logo: '/platforms/deepseek.svg' },
  'Mistral':    { color: '#FF7000', logo: '/platforms/mistral.svg' },
  'Kimi':       { color: '#A855F7', logo: '/platforms/kimi.svg' },
  'Groq':       { color: '#059669', logo: '/platforms/groq.png' },
};
const TOP_WEIGHTS = PLATFORM_SCORING_WEIGHTS.slice(0, 4)
  .map((p) => `${p.weightPct}% weight — ${p.name}`);
const TOP3 = PLATFORM_SCORING_WEIGHTS.slice(0, 3)
  .map((p) => `${p.name} ${p.weightPct}%`).join(', ');

const STEPS: { n: string; title: string; desc: string; ex: string[]; exLabel?: string }[] = [
  {
    n: '01',
    title: 'Type anything into the scanner',
    desc: 'A business name, URL, product, or search prompt. No dropdowns. No category selection. Our ML intent engine classifies what you mean automatically — exactly like ChatGPT understands natural language.',
    ex: ['best dentist in Austin', 'nike.com', 'Trek road bikes', 'Dr Sarah Johnson cardiologist'],
    exLabel: 'Examples — illustrative inputs, not real businesses or scans',
  },
  {
    n: '02',
    title: 'We query all 12 AI platforms simultaneously',
    desc: 'ChatGPT, Gemini, Google AI, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, and Groq — all at the same time. Each query runs with the variant that platform responds best to.',
    ex: TOP_WEIGHTS,
  },
  {
    n: '03',
    title: 'ML analyses every response',
    desc: 'Brand detection via semantic matching. Sentiment scoring — positive, neutral, negative, mixed. Rank position extraction. Competitor identification. Citation source detection. All automated.',
    ex: ['Brand mentioned — yes or no', 'Rank position — 1st, 2nd, 3rd', 'Competitor names extracted', 'Sources cited identified'],
  },
  {
    n: '04',
    title: `${TRUST_SIGNALS_LABEL} trust signals collected in parallel`,
    desc: 'Google Business Profile, Yelp, Reddit, Trustpilot, Tripadvisor, Healthgrades, Avvo, G2, and more — all pulled simultaneously while the AI platforms are scanning.',
    ex: ['Reviews and ratings', 'Social presence', 'Directory listings', 'Schema and technical'],
  },
  {
    n: '05',
    title: 'Your AI Visibility Score is calculated',
    desc: `Each platform carries a scoring weight (${TOP3}, and so on) — Rankall's scoring configuration, not a market-share measurement. Your score is the weighted share of queries where AI recommended you, across the platforms that responded — a platform that fails to respond is excluded, never counted as zero. Transparent. Auditable. Every number explainable.`,
    ex: ['0–100 composite score', 'Trust score calculated', 'Market position ranked', 'Competitor gap identified'],
  },
  {
    n: '06',
    title: 'ML generates your Gap Narrative',
    desc: 'Claude API takes the full scan context and generates a plain English explanation — personalised to your exact business, city, and category. Not a template. Real intelligence.',
    ex: ['Why your score is what it is', 'Which competitor is beating you', 'Specific signals you are missing', 'Predicted improvement range'],
  },
  {
    n: '07',
    title: 'Fix with AI-generated content',
    desc: 'Generative AI tools produce the exact content needed to close every gap. Every fix shows the predicted score improvement before you apply it. Timestamped before-and-after verification.',
    ex: ['FAQ schema markup', 'Review response drafts', 'Reddit contribution drafts', 'LocalBusiness JSON-LD'],
  },
  {
    n: '08',
    title: 'Verified outcomes sharpen our predictions',
    desc: 'Every fix applied and its verified result feeds the confidence of our predictions — verified-outcome history contributes up to +10 to a fix\u2019s confidence score. The prediction formula itself does not change; no model is retrained on your data.',
    ex: ['Fix applied + timestamped', 'Rescan in 7 days', 'Before vs after verified', 'Prediction confidence improves'],
  },
];

const PLATFORMS = PLATFORM_SCORING_WEIGHTS.map((p) => ({
  name: p.name,
  w: `${p.weightPct}%`,
  color: PLATFORM_META[p.name]?.color ?? '#64748B',
  logo: PLATFORM_META[p.name]?.logo ?? '/platforms/chatgpt.png',
}));

export default function HowItWorksPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>How Rankall.io Works</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,64px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            From invisible to <span style={{ color: BLUE }}>recommended</span> in 8 steps
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, lineHeight: 1.7, maxWidth: 600 }}>
            The complete intelligence loop — from scanning to fixing to verified proof it worked.
          </p>
        </div>
      </section>

      {/* STEPS */}
      <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '32px', display: 'grid', gridTemplateColumns: '72px 1fr', gap: 24, alignItems: 'start', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: i === 0 ? BLUE : BG, border: `1px solid ${i === 0 ? BLUE : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: i === 0 ? '0 8px 24px rgba(27,23,255,0.3)' : 'none' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: i === 0 ? '#fff' : BLUE, letterSpacing: '-0.02em' }}>{s.n}</span>
              </div>
              <div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: INK, margin: '0 0 10px', letterSpacing: '-0.02em' }}>{s.title}</h3>
                <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 16px' }}>{s.desc}</p>
                {s.exLabel && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>{s.exLabel}</p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {s.ex.map(e => (
                    <span key={e} style={{ fontSize: 13, color: BODY, background: BG, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '6px 14px', fontWeight: 500 }}>{e}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PLATFORMS — dark */}
      <section style={{ background: INK, padding: '96px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#8D8BFF', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', margin: '0 0 16px' }}>
            All 12 platforms — Rankall scoring weights
          </p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 48px' }}>
            Every model that matters
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: 12 }}>
            {PLATFORMS.map(p => (
              <div key={p.name} style={{ background: '#14142A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px 16px', textAlign: 'center' }}>
                <Image src={p.logo} alt={p.name} width={48} height={48} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'contain', background: '#fff', padding: 4, margin: '0 auto 12px', display: 'block' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>{p.name}</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: p.color, margin: 0 }}>{p.w}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#8A8AA3', textAlign: 'center', margin: '24px 0 0' }}>
            Scoring weights from Rankall&apos;s scoring configuration, October 2026 — each platform&apos;s share of the composite score, not a market-share measurement. Weights sum to 100% across the platforms that respond.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '96px 24px 120px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, padding: '64px 40px', boxShadow: '0 20px 48px -24px rgba(10,10,20,0.12)' }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 12px' }}>See your score in under 90 seconds</h2>
          <p style={{ fontSize: 16, color: BODY, margin: '0 0 32px' }}>Free scan. No credit card. All 8 steps, live.</p>
          <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, borderRadius: 999, padding: '16px 40px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
            Get My Free Score →
          </Link>
        </div>
      </section>

    </div>
  );
}
