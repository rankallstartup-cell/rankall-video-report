'use client';

import { useEffect, useRef, useState } from 'react';
import { calculateSimulation, SIMULATOR_DISCLAIMER, type ProjectionBasis, type SimulatorOutput } from '@/lib/simulator';
import { getBrowserClient } from '@/lib/supabase';

interface Props {
  currentScore: number;
  industry: string;
  city: string;
  countryCode: string;
  competitorScore: number | null; // b029: measured score when the scan recorded one; never a fallback
  platformsCovered: number;
  fixes: { id: string; title: string; fix_type: string; predicted_impact?: number }[];
  revenueGap: number;
  revenueSymbol: string;
  scanId: string;
  userId?: string | null;
}

const PURPLE = '#7c3aed';
const RED = '#ef4444';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const NAVY = '#0F172A';
const WHITE = '#fff';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export default function RecommendationSimulator({
  currentScore,
  industry,
  city,
  countryCode,
  competitorScore,
  platformsCovered,
  fixes,
  revenueGap,
  revenueSymbol,
  scanId,
  userId,
}: Props) {
  const output: SimulatorOutput = calculateSimulation({
    currentScore,
    industry,
    city,
    countryCode,
    competitorScore,
    platformsCovered,
    fixes: fixes.map(f => ({ id: f.id, title: f.title, fix_type: f.fix_type, predicted_impact: f.predicted_impact })),
    revenueGap,
    revenueSymbol,
  });

  const [visible, setVisible] = useState(false);
  const [basis, setBasis] = useState<ProjectionBasis | null>(null);
  // b86q: until the basis fetch SETTLES, the component rendered the
  // engine confidence + "Estimate Only" and then swapped in the basis
  // confidence + label whenever the fetch landed — so the same report
  // showed 85% on some loads and 55% on others, and flipped mid-view.
  // Basis-dependent text now renders only after settlement.
  const [basisSettled, setBasisSettled] = useState(false);

  // b02b: fetch the REAL data basis for this projection (verified
  // outcomes -> similar businesses -> industry average -> estimate
  // fallback). The old header/confidence lines quoted a hardcoded
  // '847 similar businesses' count as database evidence.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/simulator/basis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry, countryCode }),
    })
      .then(r => r.json())
      .then((b: ProjectionBasis) => { if (!cancelled && b && b.basisType) setBasis(b); })
      .catch(() => { /* basis stays null -> UI shows estimate fallback */ })
      .then(() => { if (!cancelled) setBasisSettled(true); });
    return () => { cancelled = true; };
  }, [industry, countryCode]);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Track the view once on mount (non-fatal).
  useEffect(() => {
    getBrowserClient()
      .from('simulation_views')
      .insert({
        scan_id: scanId,
        user_id: userId ?? null,
        current_score: currentScore,
        projected_score: output.projectedScoreMid,
        revenue_recovered: output.revenueRecovered,
        industry,
      })
      .then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate timeline bars when scrolled into view.
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxPoints = Math.max(1, ...output.fixProjections.map(f => f.pointsGained));
  // b02b: the real basis confidence wins when the basis API answered;
  // the engine's per-fix confidence is the fallback.
  const confidencePct = Math.max(0, Math.min(100, basis ? basis.confidence : output.confidence));

  const similarCards = [
    {
      title: `${industry} practice nearby`,
      line: `Score 19 → 51 (+32 pts)`,
      sub: `7 weeks · Now on 8 of 12 platforms`,
    },
    {
      title: `${industry} in your region`,
      line: `Score 31 → 58 (+27 pts)`,
      sub: `9 weeks · Revenue gap closed 65%`,
    },
    {
      title: `${industry}`,
      line: `Score 24 → 49 (+25 pts)`,
      sub: `8 weeks · Competitor no longer winning`,
    },
  ];

  function handlePrimary() {
    if (userId) {
      const el = document.getElementById('fixes');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      window.location.href = '/signup';
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
        background: WHITE,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* 1. HEADER */}
      <div
        style={{
          background: `linear-gradient(135deg, ${PURPLE} 0%, #6d28d9 100%)`,
          padding: '28px 32px',
          color: WHITE,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28, lineHeight: 1, display: 'inline-flex' }}><svg viewBox="0 0 576 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg></span>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            See Your Projected Improvement
          </h2>
        </div>
        <p style={{ fontSize: 14, margin: 0, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
          {!basisSettled ? 'Calculating the data basis for this projection…' : basis ? basis.label : 'General estimate — limited data for your specific market'}
        </p>
      </div>

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* 2. CURRENT VS PROJECTED */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: RED, lineHeight: 1 }}>{currentScore}</div>
            <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>Your Score Today</div>
            <span
              style={{
                display: 'inline-block',
                marginTop: 10,
                fontSize: 11,
                fontWeight: 700,
                color: RED,
                background: '#FEF2F2',
                border: `1px solid #FCA5A5`,
                borderRadius: 100,
                padding: '3px 12px',
              }}
            >
              {output.gradeBeforeLabel}
            </span>
          </div>

          <div
            className="sim-arrows"
            style={{ flex: '0 0 auto', fontSize: 32, fontWeight: 900, color: PURPLE, letterSpacing: 2 }}
          >
            <span style={{ display: 'inline-flex', gap: 2 }}><svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg><svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg><svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></span>
          </div>

          <div style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: GREEN, lineHeight: 1 }}>
              {output.projectedScoreMin}–{output.projectedScoreMax}
            </div>
            <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>{output.noFixesYet ? 'No fixes generated yet' : 'After All Fixes'}</div>
            <span
              style={{
                display: 'inline-block',
                marginTop: 10,
                fontSize: 11,
                fontWeight: 700,
                color: GREEN,
                background: '#ECFDF5',
                border: `1px solid #A7F3D0`,
                borderRadius: 100,
                padding: '3px 12px',
              }}
            >
              {output.gradeAfterLabel}
            </span>
            <div style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>In {output.totalWeeks} weeks</div>
          </div>
        </div>

        {/* 3. TIMELINE */}
        <div ref={timelineRef}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 14 }}>
            Your improvement timeline
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {output.fixProjections.map((p, i) => {
              const widthPct = Math.max(8, Math.round((p.pointsGained / maxPoints) * 100));
              return (
                <div key={`${p.fixNumber}-${i}`}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 5,
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                      <span style={{ color: GRAY, fontWeight: 600 }}>
                        Week {p.weekStart}-{p.weekEnd}:
                      </span>{' '}
                      {p.fixTitle}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>
                      {p.pointsGainedRange}
                    </span>
                  </div>
                  <div style={{ height: 12, background: BORDER, borderRadius: 100, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: visible ? `${widthPct}%` : '0%',
                        background: `linear-gradient(90deg, ${PURPLE}, #a855f7)`,
                        borderRadius: 100,
                        transition: `width 0.8s ease ${i * 0.15}s`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. CONFIDENCE */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
              {basisSettled ? <>Confidence level: {confidencePct}%</> : 'Confidence level: calculating…'}
            </span>
          </div>
          <div style={{ height: 10, background: BORDER, borderRadius: 100, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${confidencePct}%`,
                background: GREEN,
                borderRadius: 100,
                transition: 'width 0.8s ease',
              }}
            />
          </div>
          <p style={{ fontSize: 12, color: GRAY, marginTop: 8, lineHeight: 1.5 }}>
            <strong style={{ color: NAVY }}>{!basisSettled ? 'Data basis' : basis ? basis.badge : '🔴 Estimate Only'}</strong>
            {' — '}
            {!basisSettled ? 'calculating…' : basis ? basis.label : 'General estimate — limited data for your specific market'}
          </p>
        </div>

        {/* 5. REVENUE RECOVERY */}
        <div style={{ background: NAVY, borderRadius: 16, padding: '24px 26px' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: WHITE, margin: '0 0 16px' }}>
            Revenue Impact If You Fix This:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#94A3B8' }}>Current monthly loss</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: RED }}>
                {revenueSymbol}
                {fmt(output.revenueCurrentLoss)}/month going to competitor
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#94A3B8' }}>After fixes</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: AMBER }}>
                {revenueSymbol}
                {fmt(output.revenueAfterFixes)}/month
              </span>
            </div>
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: 14,
                marginTop: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>You recover</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: GREEN }}>
                  {revenueSymbol}
                  {fmt(output.revenueRecovered)}/month
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: GREEN }}>
                  {revenueSymbol}
                  {fmt(output.revenueRecoveredAnnual)}/year
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. SIMILAR BUSINESSES */}
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
            What businesses like yours could achieve <span style={{ fontWeight: 600, color: GRAY }}>(illustrative examples)</span>
          </p>
          <p style={{ fontSize: 12, color: GRAY, margin: '0 0 14px', lineHeight: 1.5 }}>
            Illustrative examples — not measured outcomes from real businesses.
          </p>
          <div
            className="sim-similar-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}
          >
            {similarCards.map((c, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 14,
                  padding: '16px 18px',
                  background: '#F8FAFC',
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, margin: '0 0 8px' }}>{c.title}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>{c.line}</p>
                <p style={{ fontSize: 12, color: GRAY, margin: 0, lineHeight: 1.5 }}>{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 7. CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handlePrimary}
            style={{
              flex: 1,
              minWidth: 220,
              background: PURPLE,
              color: WHITE,
              border: 'none',
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
            }}
          >
            {userId ? (<>Start Implementing Fix #1 Free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>) : (<>Create Free Account to Start <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
          </button>
          <a
            href="/dashboard/simulator"
            style={{
              flex: 1,
              minWidth: 220,
              textAlign: 'center',
              background: WHITE,
              color: PURPLE,
              border: `1.5px solid ${PURPLE}`,
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            See Full Improvement Plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
        </div>

        {/* 8. DISCLAIMER */}
        <p style={{ fontSize: 11, color: GRAY, margin: 0, lineHeight: 1.6 }}>
          {SIMULATOR_DISCLAIMER} Projection based on {!basisSettled ? 'your scan data' : basis ? basis.label : 'general estimates for your market'}.
        </p>
      </div>
    </div>
  );
}
