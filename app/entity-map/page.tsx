'use client';

import Link from 'next/link';
import { FIX_TYPE_COUNT, TRUST_SIGNAL_COUNT } from '@/lib/publicStats';

const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';

type Entity = {
  name: string;
  kind: string;
  desc: string;
  relations: string[];
};

const ENTITIES: Entity[] = [
  {
    name: 'Rankall Organization',
    kind: 'Organization',
    desc: 'An AI visibility monitoring platform that scans 12 AI platforms to show businesses whether AI recommends them or their competitors.',
    relations: ['OFFERS → AI Visibility Scan', 'OFFERS → Fix Engine', 'OFFERS → Agency White-Label Reports', 'PUBLISHES → Market Index'],
  },
  {
    name: 'AI Visibility Scan',
    kind: 'Product',
    desc: 'A scan (about 90 seconds) across ChatGPT, Gemini, Perplexity, Claude, Grok, Copilot, DeepSeek, Mistral, Kimi, Groq, and Google AI Overviews.',
    relations: ['MEASURES → AI Visibility Score', 'MEASURES → Share of Recommendation', 'PRODUCES → Visibility Report'],
  },
  {
    name: 'AI Visibility Score',
    kind: 'Metric',
    desc: 'A 0–100 score representing how often AI platforms recommend a business when customers ask for its category.',
    relations: ['DERIVED_FROM → Mention Detection', 'COMPARED_AGAINST → Competitor Score'],
  },
  {
    name: 'Share of Recommendation',
    kind: 'Metric',
    desc: 'The percentage of AI responses in a category that recommend your business versus competitors.',
    relations: ['TRACKED_OVER → Time', 'SEGMENTED_BY → Platform'],
  },
  {
    name: 'Fix Engine',
    kind: 'Product',
    // b8aj: the count is the canonical fix-type count (FixType union
    // members), not the unsourced "131" the page used to print.
    desc: `${FIX_TYPE_COUNT} fix types across schema, reviews, citations, content, and profiles — each mapped to the trust signals AI models read.`,
    relations: ['IMPROVES → AI Visibility Score', 'VERIFIED_BY → Rescan'],
  },
  {
    name: 'Trust Signals',
    kind: 'Concept',
    // b8aj: canonical signal count (TRUST_SIGNAL_COUNT), not the stale
    // "32" — /about and the homepage already say 35.
    desc: `The ${TRUST_SIGNAL_COUNT} structured signals (reviews, schema, citations, freshness, authority) that AI models weigh when recommending businesses.`,
    relations: ['READ_BY → AI Platforms', 'IMPROVED_BY → Fix Engine'],
  },
  {
    name: 'Local Business',
    kind: 'Audience',
    desc: 'Dentists, lawyers, HVAC, restaurants, med spas — businesses competing for "near me" recommendations in AI answers.',
    relations: ['USES → Local Business Plan', 'TRACKED_IN → Market Index'],
  },
  {
    name: 'Agency',
    kind: 'Audience',
    desc: 'Marketing agencies managing AI visibility for client portfolios with white-label reporting.',
    relations: ['USES → Agency Plan', 'RESELLS → AI Visibility Scan'],
  },
  {
    name: 'Personal Brand',
    kind: 'Audience',
    desc: 'Doctors, lawyers, consultants, and executives tracking whether AI recommends them by name.',
    relations: ['USES → Personal Brand Plan'],
  },
  {
    name: 'AI Platforms',
    kind: 'Concept',
    desc: 'The 11 monitored AI systems: ChatGPT, Gemini, Perplexity, Claude, Grok, Copilot, DeepSeek, Mistral, Kimi, Groq, Google AI.',
    relations: ['QUERIED_BY → AI Visibility Scan'],
  },
  {
    name: 'Market Index',
    kind: 'Research',
    desc: 'Rankall\'s ongoing research into AI recommendation patterns by category and metro.',
    relations: ['PUBLISHED_BY → Rankall Organization'],
  },
  {
    name: 'Wound-First Reporting',
    kind: 'Concept',
    desc: 'Rankall\'s reporting philosophy: lead with quantified invisible loss — e.g. an illustrative "AI sent 47 customers to competitors" — before showing the score.',
    relations: ['SHAPES → Visibility Report'],
  },
];

export default function EntityMapPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '80px 24px', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ fontSize: 14, color: BODY, textDecoration: 'none', fontWeight: 500, alignSelf: 'flex-start' }}>← Back to home</Link>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Intelligence Graph</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,60px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Rankall — EntityMap</h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.6, maxWidth: 640 }}>A structured map of the entities Rankall tracks, measures, and serves — built so both humans and AI systems can understand exactly what Rankall is and how its parts relate.</p>
        </div>
        <p style={{ fontSize: 14, color: BODY, marginBottom: 48, opacity: 0.8 }}>Last updated: October 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ENTITIES.map(e => (
            <div key={e.name} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '28px 32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: INK, letterSpacing: '-0.02em', margin: 0 }}>{e.name}</h2>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '4px 12px' }}>{e.kind}</span>
              </div>
              <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, marginBottom: 14 }}>{e.desc}</p>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK, marginBottom: 8, opacity: 0.6 }}>Relations</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {e.relations.map(r => (
                    <span key={r} style={{ fontSize: 13, fontWeight: 500, color: BODY, background: BG, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '6px 14px' }}>{r}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, background: INK, borderRadius: 20, padding: '40px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>See your entity the way AI sees it</h2>
          <p style={{ fontSize: 15, color: '#B4B4C8', marginBottom: 24 }}>Run a free scan and discover how AI platforms describe your business.</p>
          <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 32px', borderRadius: 999, textDecoration: 'none' }}>Scan Free →</Link>
        </div>
      </div>
    </div>
  );
}
