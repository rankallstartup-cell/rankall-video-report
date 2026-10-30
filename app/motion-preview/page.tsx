'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Existing Rankall palette — no rebrand ──────────────────────────────────
const BG = '#F8FAFC';
const W = '#FFFFFF';
const NAVY = '#0F172A';
const BORDER = '#E2E8F0';
const BLUE = '#2563EB';
const GRAY = '#64748B';
const LGRAY = '#94A3B8';
const RED = '#DC2626';
const GREEN = '#059669';

// ─── Scroll-reveal hook ─────────────────────────────────────────────────────
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, style: {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(12px)',
    transition: 'opacity 400ms ease, transform 400ms ease',
  } as React.CSSProperties };
}

// ─── Animated Hero Demo ─────────────────────────────────────────────────────
const DEMO_BUSINESS = 'Anderson Plumbing, Chicago';
const PLATFORMS = ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot', 'Grok', 'DeepSeek', 'Google AI', 'Groq', 'Mistral', 'Kimi', 'Meta AI'];
const COMPETITORS = [
  { name: 'Clearwater Plumbing Co.' },
  { name: 'Summit Drain & Pipe' },
  { name: 'Northside Plumbing Services' },
];
const TARGET = 'Your Business';

type Phase = 'typing' | 'scanning' | 'building' | 'reveal';

function AnimatedHero() {
  const [phase, setPhase] = useState<Phase>('typing');
  const [typedChars, setTypedChars] = useState(0);
  const [scanIdx, setScanIdx] = useState(0);
  const [builtLines, setBuiltLines] = useState(0);
  const [showTarget, setShowTarget] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const reset = useCallback(() => {
    setPhase('typing');
    setTypedChars(0);
    setScanIdx(0);
    setBuiltLines(0);
    setShowTarget(false);
  }, []);

  // Typing phase
  useEffect(() => {
    if (phase !== 'typing' || reducedMotion) {
      if (reducedMotion && phase === 'typing') {
        setTypedChars(DEMO_BUSINESS.length);
        setPhase('scanning');
      }
      return;
    }
    if (typedChars < DEMO_BUSINESS.length) {
      timeoutRef.current = setTimeout(() => setTypedChars(c => c + 1), 55);
      return () => clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setPhase('scanning'), 400);
    return () => clearTimeout(timeoutRef.current);
  }, [phase, typedChars, reducedMotion]);

  // Scanning phase
  useEffect(() => {
    if (phase !== 'scanning') return;
    if (reducedMotion) { setPhase('building'); return; }
    if (scanIdx < PLATFORMS.length) {
      timeoutRef.current = setTimeout(() => setScanIdx(i => i + 1), 180);
      return () => clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setPhase('building'), 300);
    return () => clearTimeout(timeoutRef.current);
  }, [phase, scanIdx, reducedMotion]);

  // Building phase
  useEffect(() => {
    if (phase !== 'building') return;
    if (reducedMotion) {
      setBuiltLines(COMPETITORS.length);
      setShowTarget(true);
      setPhase('reveal');
      return;
    }
    if (builtLines < COMPETITORS.length) {
      timeoutRef.current = setTimeout(() => setBuiltLines(n => n + 1), 300);
      return () => clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => { setShowTarget(true); setPhase('reveal'); }, 600);
    return () => clearTimeout(timeoutRef.current);
  }, [phase, builtLines, reducedMotion]);

  // Reveal holds — no auto-loop

  const inputText = DEMO_BUSINESS.slice(0, typedChars);
  const showCursor = phase === 'typing';
  const isScanning = phase === 'scanning';
  const currentPlatform = PLATFORMS[Math.min(scanIdx, PLATFORMS.length - 1)];

  return (
    <div style={{
      background: W, borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${BORDER}`,
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      maxWidth: 480, width: '100%',
    }}>
      {/* Search input area */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 10,
          border: `1.5px solid ${isScanning ? BLUE : BORDER}`,
          transition: 'border-color 200ms',
          background: BG,
        }}>
          <span style={{ fontSize: 15, color: typedChars > 0 ? NAVY : LGRAY, flex: 1, fontFamily: 'inherit' }}>
            {typedChars > 0 ? inputText : 'Your business name, city'}
            {showCursor && <span style={{
              display: 'inline-block', width: 2, height: 18, background: BLUE,
              marginLeft: 1, verticalAlign: 'text-bottom',
              animation: 'blink 1s step-end infinite',
            }} />}
          </span>
          <span style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: BLUE, color: W, whiteSpace: 'nowrap' as const,
            transform: isScanning ? 'scale(0.97)' : 'scale(1)',
            transition: 'transform 150ms',
          }}>
            {isScanning ? 'Scanning…' : 'Run free scan'}
          </span>
        </div>
      </div>

      {/* Scanning indicator */}
      {(isScanning || phase === 'building' || phase === 'reveal') && (
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
          {isScanning ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: BLUE,
                animation: 'pulse 1s ease infinite',
              }} />
              <span style={{ fontSize: 13, color: GRAY }}>
                Scanning <strong style={{ color: NAVY }}>{currentPlatform}</strong>…
              </span>
              <span style={{ fontSize: 12, color: LGRAY, marginLeft: 'auto' }}>
                {scanIdx + 1}/{PLATFORMS.length}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
              <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>
                {PLATFORMS.length} platforms scanned
              </span>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {(builtLines > 0 || showTarget) && (
        <div style={{ padding: '16px 20px' }}>
          <p style={{
            fontSize: 12, fontWeight: 600, color: LGRAY, letterSpacing: '0.04em',
            marginBottom: 12, textTransform: 'uppercase' as const,
          }}>
            &quot;Best plumber in Chicago&quot; — AI recommends:
          </p>

          {COMPETITORS.slice(0, builtLines).map((c, i) => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0',
              borderBottom: i < COMPETITORS.length - 1 || showTarget ? `1px solid ${BORDER}` : 'none',
              opacity: 1,
              transform: 'translateY(0)',
              animation: reducedMotion ? 'none' : `slideUp 300ms ease ${i * 50}ms both`,
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 6, background: '#EFF6FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: BLUE, flexShrink: 0,
              }}>{i + 1}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: NAVY, flex: 1 }}>{c.name}</span>
            </div>
          ))}

          {showTarget && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', marginTop: 8,
              borderRadius: 10,
              background: '#FEF2F2', border: '1px solid #FECACA',
              animation: reducedMotion ? 'none' : 'slideUp 400ms ease both',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 6, background: '#FEE2E2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: RED, flexShrink: 0,
              }}>—</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: RED, flex: 1 }}>
                {TARGET}: not mentioned
              </span>
            </div>
          )}
        </div>
      )}

      {/* Replay */}
      {phase === 'reveal' && (
        <div style={{ padding: '12px 20px 16px', textAlign: 'center' as const }}>
          <button onClick={reset} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: BLUE, fontFamily: 'inherit',
            padding: '4px 8px',
          }}>
            ↻ Replay
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sections for scroll-reveal demo ────────────────────────────────────────

function StepsSection() {
  const r1 = useReveal<HTMLDivElement>();
  const r2 = useReveal<HTMLDivElement>();
  const r3 = useReveal<HTMLDivElement>();

  const steps = [
    { num: '01', title: 'See where you stand', desc: 'We scan 12 AI platforms for your business name. In 60 seconds you see exactly who AI recommends instead of you.' },
    { num: '02', title: 'Understand why', desc: 'Your report shows which platforms mention you, which don\'t, and what signals they\'re using to pick your competitors.' },
    { num: '03', title: 'Fix and verify', desc: 'Actionable fixes ranked by impact. Run a follow-up scan to verify the changes worked.' },
  ];
  const refs = [r1, r2, r3];

  return (
    <section style={{ padding: 'var(--section-pad) 24px', background: BG }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 'var(--h2)', fontWeight: 600, color: NAVY,
          letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 48, textAlign: 'center' as const,
        }}>
          How it works
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 40 }}>
          {steps.map((s, i) => (
            <div key={s.num} ref={refs[i].ref} style={{
              display: 'flex', gap: 20, alignItems: 'flex-start',
              ...refs[i].style,
            }}>
              <span style={{
                fontSize: 32, fontWeight: 800, color: BLUE, lineHeight: 1,
                opacity: 0.25, flexShrink: 0, width: 48,
              }}>{s.num}</span>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: GRAY, margin: 0 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformsSection() {
  const r = useReveal<HTMLDivElement>();
  const platforms = ['ChatGPT', 'Gemini', 'Google AI', 'Copilot', 'Perplexity', 'Grok', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Meta AI'];

  return (
    <section style={{ padding: 'var(--section-pad) 24px', background: W }}>
      <div ref={r.ref} style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' as const, ...r.style }}>
        <h2 style={{
          fontSize: 'var(--h2)', fontWeight: 600, color: NAVY,
          letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16,
        }}>
          12 AI platforms, scanned live
        </h2>
        <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.6, marginBottom: 32 }}>
          Every platform that matters for local business recommendations.
          No placeholders — these are the ones actually running.
        </p>
        <div style={{
          display: 'flex', flexWrap: 'wrap' as const, gap: 10, justifyContent: 'center',
        }}>
          {platforms.map(p => (
            <span key={p} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: BG, color: NAVY, border: `1px solid ${BORDER}`,
            }}>{p}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const r = useReveal<HTMLDivElement>();
  return (
    <section style={{ padding: 'var(--section-pad) 24px', background: BG }}>
      <div ref={r.ref} style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' as const, ...r.style }}>
        <h2 style={{
          fontSize: 'var(--h2)', fontWeight: 600, color: NAVY,
          letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16,
        }}>
          One plan. Cancel anytime.
        </h2>
        <div style={{
          background: W, borderRadius: 16, padding: '40px 32px',
          border: `1px solid ${BORDER}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 56, fontWeight: 800, color: NAVY, lineHeight: 1 }}>$39</span>
            <span style={{ fontSize: 16, color: GRAY, fontWeight: 500 }}>/mo</span>
          </div>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>
            Everything. All 12 platforms. Fix engine. Weekly rescans.
          </p>
          <button style={{
            width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
            background: BLUE, color: W, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'transform 100ms',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Get started
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── PAGE ───────────────────────────────────────────────────────────────────
export default function MotionPreviewPage() {
  const heroReveal = useReveal<HTMLDivElement>();

  return (
    <>
      <style>{`
        :root {
          --h1: 38px;
          --h2: 28px;
          --section-pad: 96px;
        }
        @media (min-width: 768px) {
          :root {
            --h1: 64px;
            --h2: 40px;
            --section-pad: 140px;
          }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Button press state */
        .motion-btn:active {
          transform: scale(0.97) !important;
        }
        /* Input focus ring */
        .motion-input:focus {
          outline: none;
          border-color: ${BLUE};
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div style={{
        minHeight: '100vh', background: BG,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        color: NAVY,
      }}>
        {/* Hero */}
        <section style={{
          padding: 'var(--section-pad) 24px',
          background: W,
        }}>
          <div ref={heroReveal.ref} style={{
            maxWidth: 640, margin: '0 auto', textAlign: 'center' as const,
            ...heroReveal.style,
          }}>
            <h1 style={{
              fontSize: 'var(--h1)', fontWeight: 600, lineHeight: 1.08,
              letterSpacing: '-0.02em', color: NAVY, marginBottom: 20,
            }}>
              Find out if AI recommends your business.
            </h1>
            <p style={{
              fontSize: 17, lineHeight: 1.65, color: GRAY,
              maxWidth: 480, margin: '0 auto 48px',
            }}>
              We scan ChatGPT, Gemini, Perplexity and 8 more AI platforms
              in 60 seconds. See who they recommend instead of you — and how to fix it.
            </p>

            {/* Animated demo */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AnimatedHero />
            </div>
          </div>
        </section>

        {/* Steps */}
        <StepsSection />

        {/* Platforms */}
        <PlatformsSection />

        {/* Pricing */}
        <PricingSection />

        {/* Final CTA */}
        <section style={{
          padding: 'var(--section-pad) 24px', background: W,
          textAlign: 'center' as const,
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <h2 style={{
              fontSize: 'var(--h2)', fontWeight: 600, color: NAVY,
              letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16,
            }}>
              Your competitors are already being recommended by AI.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: GRAY, marginBottom: 32 }}>
              Find out where you stand in 60 seconds.
            </p>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 0,
              maxWidth: 380, margin: '0 auto',
            }}>
              <input
                className="motion-input"
                placeholder="Your business, city"
                style={{
                  flex: 1, padding: '14px 16px', fontSize: 15, border: `1.5px solid ${BORDER}`,
                  borderRadius: '10px 0 0 10px', borderRight: 'none',
                  fontFamily: 'inherit', color: NAVY, minWidth: 0,
                  transition: 'border-color 200ms, box-shadow 200ms',
                }}
              />
              <button className="motion-btn" style={{
                padding: '14px 20px', borderRadius: '0 10px 10px 0', border: 'none',
                background: BLUE, color: W, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
                transition: 'transform 100ms',
              }}>
                Run free scan
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
