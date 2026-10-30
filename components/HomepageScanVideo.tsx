'use client';

import { useEffect, useRef, useState } from 'react';
import { canonicalFixImpact } from '@/lib/fixIntelligence';

interface Props {
  score?: number;
  competitor?: string;
  competitorScore?: number;
  revenueGap?: number;
  symbol?: string;
  city?: string;
  industry?: string;
  audioUrl?: string | null;
}

const BG = '#0f0f23';
const CARD = '#1a1a2e';
const PURPLE = '#7c3aed';
const RED = '#dc2626';
const GREEN = '#059669';

const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot', 'Claude',
  'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI',
];

// Phase boundaries in ms over a ~45s loop.
const P1 = 5000;   // typing
const P2 = 15000;  // scanning platforms
const P3 = 25000;  // score + competitor
const P4 = 35000;  // revenue gap
const P5 = 45000;  // fix card + CTA
const LOOP = P5;

// Item 5: this is an ILLUSTRATIVE demo, rendered with no props on the
// homepage and /demo. Every number is labelled "Example" on screen and the
// fix badge shows the canonical estimate — never "Verified" — so invented
// numbers are never presented as the visitor's results.
const EXAMPLE_FIX_TYPE = 'faq_schema';
const EXAMPLE_FIX_IMPACT = canonicalFixImpact(EXAMPLE_FIX_TYPE);

export default function HomepageScanVideo({
  score = 31,
  competitor = 'Example Dental Co.',
  competitorScore = 78,
  revenueGap = 4200,
  symbol = '$',
  city = 'Chicago',
  industry = 'dentist',
  audioUrl = null,
}: Props) {
  const fullQuery = `best ${industry} in ${city}`;

  // t = elapsed ms within the current loop
  const [t, setT] = useState(0);
  // count-up values
  const [scoreCount, setScoreCount] = useState(0);
  const [compCount, setCompCount] = useState(0);
  const [revCount, setRevCount] = useState(0);

  const [audioOn, setAudioOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // b8ah: pause/play + replay controls for the simulated animation.
  const [paused, setPaused] = useState(false);
  const startRef = useRef(Date.now());
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Master clock — single interval driving the whole timeline, looping.
  // When paused, the clock's start advances with real time so the
  // animation freezes instead of jumping ahead on resume.
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) {
        startRef.current += 80;
        return;
      }
      setT((Date.now() - startRef.current) % LOOP);
    }, 80);
    return () => clearInterval(id);
  }, []);

  function replay() {
    startRef.current = Date.now();
    setT(0);
    setScoreCount(0);
    setCompCount(0);
    setRevCount(0);
    setPaused(false);
  }

  // Derived phase
  const phase = t < P1 ? 1 : t < P2 ? 2 : t < P3 ? 3 : t < P4 ? 4 : 5;

  // Phase 3: count score 0->score, then competitor 0->competitorScore
  useEffect(() => {
    if (phase < 3) {
      setScoreCount(0);
      setCompCount(0);
      return;
    }
    if (phase > 4) return;
    // score ramps over first ~3.5s of phase 3
    const scoreProg = Math.min(1, (t - P2) / 3500);
    setScoreCount(Math.round(score * easeOut(scoreProg)));
    // competitor appears after 5s into phase 3
    const compProg = Math.min(1, (t - (P2 + 5000)) / 3500);
    setCompCount(compProg > 0 ? Math.round(competitorScore * easeOut(compProg)) : 0);
  }, [t, phase, score, competitorScore]);

  // Phase 4: revenue count-up
  useEffect(() => {
    if (phase < 4) {
      setRevCount(0);
      return;
    }
    if (phase > 4) return;
    const prog = Math.min(1, (t - P3) / 4500);
    setRevCount(Math.round(revenueGap * easeOut(prog)));
  }, [t, phase, revenueGap]);

  // Keep counts pinned at final values once we've passed their phase (during phase 5).
  const displayScore = phase >= 3 ? (phase > 4 ? score : scoreCount) : 0;
  const compVisible = phase > 4 || (phase >= 3 && t >= P2 + 5000);
  const displayComp = phase > 4 ? competitorScore : compCount;
  const displayRev = phase >= 4 ? (phase > 4 ? revenueGap : revCount) : 0;

  // Typing progress for phase 1
  const typedLen = phase === 1
    ? Math.min(fullQuery.length, Math.floor((t / P1) * fullQuery.length))
    : fullQuery.length;
  const typedText = fullQuery.slice(0, typedLen);

  // Platforms revealed in phase 2 (~0.9s apart). In later phases, all shown.
  const platformsRevealed = phase < 2 ? 0
    : phase > 2 ? PLATFORMS.length
    : Math.min(PLATFORMS.length, Math.floor((t - P1) / 900) + 1);

  function toggleAudio() {
    const el = audioRef.current;
    if (!el) return;
    if (audioOn) {
      el.pause();
      setAudioOn(false);
    } else {
      el.play().then(() => setAudioOn(true), () => {});
    }
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 640,
        margin: '0 auto',
        background: BG,
        borderRadius: 16,
        border: '1px solid #4c1d95',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'inherit',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
      }}
    >
      <style>{`
        @keyframes hsv-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
        @keyframes hsv-pulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(124,58,237,0.5) }
          50% { transform: scale(1.03); box-shadow: 0 0 0 10px rgba(124,58,237,0) }
        }
        @keyframes hsv-slidein {
          from { opacity: 0; transform: translateY(16px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes hsv-fadein { from { opacity: 0 } to { opacity: 1 } }
        .hsv-card { padding: clamp(16px, 4vw, 28px); }
        .hsv-num { font-size: clamp(40px, 11vw, 64px); }
        .hsv-rev { font-size: clamp(32px, 9vw, 48px); }
      `}</style>

      {/* Audio control */}
      {audioUrl && (
        <>
          <button
            onClick={toggleAudio}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 5,
              background: 'rgba(124,58,237,0.9)', color: '#fff', border: 'none',
              borderRadius: 100, padding: '6px 12px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {audioOn ? (<><svg viewBox="0 0 640 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z"/></svg> Narration on</>) : (<><svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3zM425 167l55 55 55-55c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-55 55 55 55c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-55-55-55 55c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l55-55-55-55c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0z"/></svg> Click to hear narration</>)}
          </button>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={audioUrl} onEnded={() => setAudioOn(false)} />
        </>
      )}

      <div className="hsv-card">
        <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>
          RANKALL.IO — EXAMPLE SCAN (ILLUSTRATIVE NUMBERS)
        </div>
        {/* b8ah: the typing + checkmarks simulate a live scan that is not
            happening — label the animation as simulated. */}
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 14 }}>
          Simulated animation — not a live scan. Run your own free scan for real numbers.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              background: '#2a2a3e', color: '#d1d5db', border: '1px solid #4c1d95',
              borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {paused ? '▶ Play' : '⏸ Pause'}
          </button>
          <button
            onClick={replay}
            style={{
              background: '#2a2a3e', color: '#d1d5db', border: '1px solid #4c1d95',
              borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ↺ Replay
          </button>
        </div>

        {/* Search bar — always visible */}
        <div
          style={{
            background: '#0f0f1a', border: `2px solid ${PURPLE}`, borderRadius: 10,
            padding: '12px 16px', color: '#d1d5db', fontSize: 'clamp(13px, 3.5vw, 16px)',
            marginBottom: 18, minHeight: 22,
          }}
        >
          {typedText}
          {phase === 1 && (
            <span
              style={{
                display: 'inline-block', width: 2, height: '1em', background: PURPLE,
                marginLeft: 2, verticalAlign: 'text-bottom', animation: 'hsv-blink 1s step-end infinite',
              }}
            />
          )}
        </div>

        {/* Phase 2+: platform scan */}
        {phase >= 2 && (
          <div style={{ marginBottom: 18, animation: 'hsv-fadein 0.4s ease' }}>
            <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>
              Scanning 12 AI platforms...
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PLATFORMS.map((p, i) => {
                const shown = i < platformsRevealed;
                return (
                  <div
                    key={p}
                    style={{
                      background: '#0f0f1a',
                      border: `1px solid ${shown ? PURPLE : '#2a2a3e'}`,
                      borderRadius: 8, padding: '6px 8px',
                      fontSize: 'clamp(10px, 2.6vw, 12px)',
                      color: shown ? '#a78bfa' : '#3f3f5a',
                      textAlign: 'center', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'border-color 0.3s, color 0.3s',
                    }}
                  >
                    <span>{p}</span>
                    {shown && <span style={{ color: GREEN, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 3+: scores */}
        {phase >= 3 && (
          <div style={{ display: 'flex', gap: 14, marginBottom: 18, animation: 'hsv-fadein 0.4s ease' }}>
            <div style={{ flex: 1, background: '#0f0f1a', borderRadius: 10, padding: '16px 8px', textAlign: 'center' }}>
              <div className="hsv-num" style={{ fontWeight: 900, color: RED, lineHeight: 1 }}>{displayScore}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Example AI Visibility Score</div>
            </div>
            {compVisible && (
              <div style={{ flex: 1, background: '#0f0f1a', borderRadius: 10, padding: '16px 8px', textAlign: 'center', animation: 'hsv-fadein 0.5s ease' }}>
                <div className="hsv-num" style={{ fontWeight: 900, color: GREEN, lineHeight: 1 }}>{displayComp}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Example competitor: {competitor}</div>
              </div>
            )}
          </div>
        )}

        {/* Phase 4+: revenue gap */}
        {phase >= 4 && (
          <div
            style={{
              background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 10,
              padding: 16, marginBottom: 18, textAlign: 'center', animation: 'hsv-fadein 0.4s ease',
            }}
          >
            <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>Example estimated monthly revenue at stake:</div>
            <div className="hsv-rev" style={{ fontWeight: 900, color: RED, lineHeight: 1 }}>
              {symbol}{displayRev.toLocaleString()}/mo
            </div>
          </div>
        )}

        {/* Phase 5: fix card + CTA */}
        {phase >= 5 && (
          <div style={{ animation: 'hsv-slidein 0.5s ease' }}>
            <div style={{ background: '#064e3b', border: '1px solid #065f46', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <span style={{ background: GREEN, color: '#fff', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>
                Fix #1 — FREE
              </span>
              <p style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: 15, color: '#fff' }}>
                FAQ Schema <span style={{ color: '#6ee7b7', display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
              </p>
              {/* b8ah: "Takes 20 minutes" was an unsourced claim — label it an estimate. */}
              <p style={{ fontSize: 13, color: '#6ee7b7', margin: '0 0 10px' }}>Est. ~20 minutes</p>
              {EXAMPLE_FIX_IMPACT != null && (
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, background: PURPLE,
                  color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                }}
              >
                Est. +{EXAMPLE_FIX_IMPACT} points (estimate)
              </div>
              )}
            </div>
            {/* b8ah: this button had NO onClick — a dead control. It now goes to the scan form. */}
            <button
              onClick={() => { window.location.href = '/#scan'; }}
              style={{
                width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 12,
                padding: '14px 20px', fontSize: 'clamp(14px, 4vw, 17px)', fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit', animation: 'hsv-pulse 1.8s ease-in-out infinite',
              }}
            >
              Scan your business free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function easeOut(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - c, 3);
}
