'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CASES } from '@/lib/constants';
import { canonicalFixImpact } from '@/lib/fixIntelligence';
import { projectScore } from '@/lib/projection';

// Illustrative composites: per-fix numbers are the canonical estimate for the
// fix type, and "after" is the shared projection of their sum — never a
// hand-typed result.
const STUDIES = CASES.map(c => {
  const fixes = c.fixes.map(f => ({ ...f, pts: canonicalFixImpact(f.fixType) ?? 0 }));
  const after = projectScore(c.before, fixes.reduce((t, f) => t + f.pts, 0));
  return { ...c, fixes, after };
});

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const RED    = '#DC2626';
const GRAY   = '#55556A';
const LGRAY  = '#8A8AA3';

export default function CaseStudiesPage() {
  const [active, setActive] = useState(0);
  const cs = STUDIES[active];

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '72px 20px 48px', textAlign: 'center', background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px', marginBottom: 24 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Illustrative Results</span>
        </div>
        <h1 style={{ fontSize: 'clamp(36px,5vw,56px)', fontWeight: 700, color: NAVY, letterSpacing: '-0.04em', marginBottom: 14 }}>
          Illustrative outcomes. Real playbook.
        </h1>
        <p style={{ fontSize: 17, color: GRAY, maxWidth: 480, margin: '0 auto' }}>
          Each example shows the fixes a typical business of that type would apply first and the score Rankall would estimate. These are illustrative composites, not real customers: the estimate is the sum of each fix&apos;s standard estimated impact, capped at the same ceiling the product uses. Real results vary and are confirmed by a verification rescan after you mark a fix applied.
        </p>
      </section>

      {/* CASE STUDIES */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '56px 20px 72px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, overflowX: 'auto', paddingBottom: 4 }}>
          {STUDIES.map((c, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                flexShrink: 0, minWidth: 170, padding: '16px 18px',
                border: `${active === i ? 2 : 1.5}px solid ${active === i ? c.color : BORDER}`,
                borderRadius: 13, cursor: 'pointer',
                background: active === i ? `${c.color}10` : W,
                textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s',
                boxShadow: active === i ? `0 2px 12px ${c.color}20` : '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 700, color: active === i ? c.color : GRAY, marginBottom: 4 }}>{c.ind}</p>
              <p style={{ fontSize: 12, color: GRAY, marginBottom: 8 }}>{c.loc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: RED }}>{c.before}</span>
                <span style={{ fontSize: 14, color: GRAY }}>→</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: GREEN }}>{c.after}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Active case */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Header */}
          <div style={{ background: `${cs.color}08`, padding: '28px 28px', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: cs.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{cs.ind} — {cs.loc}</p>
              <h2 style={{ fontSize: 'clamp(16px,3vw,22px)', fontWeight: 800, color: NAVY, lineHeight: 1.3 }}>{cs.headline}</h2>
            </div>
            <div style={{ display: 'flex', gap: 28, flexShrink: 0 }}>
              {[{ l: 'Before', v: cs.before, c: RED }, { l: 'Est. after', v: cs.after, c: GREEN }].map(s => (
                <div key={s.l} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>{s.l}</p>
                  <p style={{ fontSize: 'clamp(32px,5vw,44px)', fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '28px' }}>
            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.75, marginBottom: 24 }}>{cs.summary}</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>The 3 fixes to apply first</p>
            {cs.fixes.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 18, borderBottom: i < cs.fixes.length - 1 ? `1px solid ${BORDER}` : 'none', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${cs.color}15`, border: `1px solid ${cs.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: cs.color }}>{i + 1}</span>
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{f.fix}</p>
                  </div>
                  <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, paddingLeft: 34 }}>{f.desc}</p>
                </div>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '5px 14px', fontSize: 13, fontWeight: 800, color: GREEN, flexShrink: 0, whiteSpace: 'nowrap' }}>Est. +{f.pts} pts</div>
              </div>
            ))}
          </div>
        </div>

        {/* b894: how the estimates are produced — the ticket asked
            for the values/ceiling to be documented on the page. */}
        <div style={{ marginTop: 28, background: W, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 22px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>How these estimates work</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, margin: 0 }}>
            Each &quot;Est. +N pts&quot; is the standard estimated impact for that fix type from Rankall&apos;s current estimate table — the same values the product&apos;s fix queue and Simulator show. &quot;Est. after&quot; is the product&apos;s own projection of their sum, capped at the same projection ceiling the product uses and never below the starting score. These are estimates, not measured outcomes: a real result is only confirmed by a verification rescan after a fix is applied.
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <p style={{ fontSize: 15, color: GRAY, marginBottom: 20 }}>See where your business stands today.</p>
          <Link href="/signup" style={{ background: BLUE, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(37,99,235,0.3)' }}>
            Get My Free Score →
          </Link>
        </div>
      </section>

    </div>
  );
}