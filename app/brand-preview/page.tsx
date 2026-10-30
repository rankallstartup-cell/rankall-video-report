'use client';

import { useState } from 'react';

// ─── Three brand directions for Rankall ─────────────────────────────────────
// Each direction: palette, type pairing, hero treatment, card style.
// Logo mark is a placeholder — treat as a separate problem.
//
// Ground-truth docs: docs/DESIGN-BRIEF.md and the Local-First plan do NOT exist
// in this repo. If they live elsewhere (Notion, Google Doc), paste them in and
// I'll check for contradictions. Proceeded without them.

type Theme = 'light' | 'dark';

// Font loader — Instrument Serif replaces Georgia in Signal
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap';

// Serif family constant used everywhere in Signal
const DISPLAY_SERIF = "'Instrument Serif', Georgia, serif";
const BODY_SANS = "'Inter', system-ui, sans-serif";

// ─── DIRECTION 1: SIGNAL ────────────────────────────────────────────────────
// Warm authority. "Your business has a signal in AI — we measure it."
// Deep navy + warm amber/gold. Display serif headlines + geometric sans body.
const Signal = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const bg = dark ? '#0C1220' : '#FAFAF7';
  const cardBg = dark ? '#151E2E' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,0.08)' : '#E8E5DE';
  const textPrimary = dark ? '#F5F3EE' : '#1A1A2E';
  const textSecondary = dark ? '#9CA3AF' : '#6B6B7B';
  const accent = '#D4A017';
  const accentLight = dark ? 'rgba(212,160,23,0.15)' : 'rgba(212,160,23,0.08)';

  return (
    <section style={{ background: bg, padding: '80px 24px', fontFamily: BODY_SANS }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 20, marginBottom: 40,
          background: accentLight, color: accent,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          DIRECTION 1 — SIGNAL
        </div>

        <div style={{
          fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em',
          color: textPrimary, marginBottom: 8, fontFamily: DISPLAY_SERIF,
        }}>
          Rank<span style={{ color: accent }}>all</span>
        </div>
        <p style={{ fontSize: 13, color: textSecondary, marginBottom: 48, letterSpacing: '0.02em' }}>
          Warm authority · Instrument Serif headlines · Gold accent · Navy depth
        </p>

        {/* Hero */}
        <div style={{
          background: dark
            ? 'linear-gradient(160deg, #0C1220 0%, #1A1A2E 50%, #1E1B2E 100%)'
            : 'linear-gradient(160deg, #1A1A2E 0%, #2D2B55 50%, #1A1A2E 100%)',
          borderRadius: 16, padding: '64px 40px', marginBottom: 32,
          border: dark ? '1px solid rgba(212,160,23,0.2)' : 'none',
        }}>
          <p style={{
            fontSize: 14, fontWeight: 600, letterSpacing: '0.06em',
            color: accent, marginBottom: 16, textTransform: 'uppercase' as const,
            fontFamily: BODY_SANS,
          }}>
            AI Visibility Platform
          </p>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 400, lineHeight: 1.15,
            color: '#F5F3EE', marginBottom: 20, letterSpacing: '-0.01em',
            fontFamily: DISPLAY_SERIF,
          }}>
            Is your business visible<br />
            to AI search?
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.6, color: 'rgba(245,243,238,0.7)',
            maxWidth: 480, marginBottom: 32, fontFamily: BODY_SANS,
          }}>
            ChatGPT, Gemini, and Perplexity are replacing Google for millions of searches.
            Rankall scans 12 AI platforms to show where you stand.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <div style={{
              background: accent, color: '#1A1A2E', padding: '14px 28px',
              borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>
              Scan Your Business Free
            </div>
            <div style={{
              background: 'transparent', color: '#F5F3EE', padding: '14px 28px',
              borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer',
              border: '1px solid rgba(245,243,238,0.25)',
            }}>
              See Example Report
            </div>
          </div>
        </div>

        {/* Score card */}
        <div style={{
          background: cardBg, borderRadius: 12, padding: '28px 24px',
          border: `1px solid ${border}`, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: textSecondary, letterSpacing: '0.04em' }}>
              YOUR AI VISIBILITY SCORE
            </span>
            <span style={{ fontSize: 13, color: textSecondary }}>4 of 8 platforms</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{
              fontSize: 48, fontWeight: 400, color: accent, lineHeight: 1,
              fontFamily: DISPLAY_SERIF,
            }}>37</span>
            <span style={{ fontSize: 18, color: textSecondary }}>/100</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3, background: dark ? '#1E2D45' : '#E8E5DE',
            overflow: 'hidden',
          }}>
            <div style={{
              width: '37%', height: '100%', borderRadius: 3,
              background: `linear-gradient(90deg, ${accent}, #E8B931)`,
            }} />
          </div>
        </div>

        {/* Palette */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[
            { color: '#1A1A2E', label: 'Navy' },
            { color: '#2D2B55', label: 'Deep Purple' },
            { color: '#D4A017', label: 'Gold' },
            { color: '#E8B931', label: 'Amber' },
            { color: '#F5F3EE', label: 'Warm White' },
            { color: '#6B6B7B', label: 'Stone' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' as const }}>
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: s.color,
                border: `1px solid ${border}`, marginBottom: 4,
              }} />
              <span style={{ fontSize: 10, color: textSecondary }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── DIRECTION 2: PRISM ─────────────────────────────────────────────────────
const Prism = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const bg = dark ? '#0A0F1A' : '#F7F9FC';
  const cardBg = dark ? '#111827' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const textPrimary = dark ? '#F3F4F6' : '#111827';
  const textSecondary = dark ? '#9CA3AF' : '#6B7280';
  const primary = '#0D9488';
  const primaryLight = dark ? 'rgba(13,148,136,0.15)' : 'rgba(13,148,136,0.08)';
  const violet = '#7C3AED';

  return (
    <section style={{ background: bg, padding: '80px 24px', fontFamily: BODY_SANS }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 20, marginBottom: 40,
          background: primaryLight, color: primary,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          DIRECTION 2 — PRISM
        </div>

        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em',
          color: textPrimary, marginBottom: 8,
        }}>
          rank<span style={{ color: primary }}>all</span>
        </div>
        <p style={{ fontSize: 13, color: textSecondary, marginBottom: 48, letterSpacing: '0.02em' }}>
          Clean SaaS · Geometric sans · Teal + violet · Light and airy
        </p>

        <div style={{
          background: cardBg, borderRadius: 20, padding: '64px 40px',
          border: `1px solid ${border}`, marginBottom: 32,
          boxShadow: dark ? 'none' : '0 4px 24px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20, marginBottom: 24,
            background: primaryLight, color: primary, fontSize: 13, fontWeight: 500,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: primary, display: 'inline-block' }} />
            Scanning 12 AI platforms
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 46px)', fontWeight: 800, lineHeight: 1.12,
            color: textPrimary, marginBottom: 20, letterSpacing: '-0.03em',
          }}>
            Find out if AI<br />
            recommends{' '}
            <span style={{
              background: `linear-gradient(135deg, ${primary}, ${violet})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>your business</span>
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.65, color: textSecondary, maxWidth: 460, marginBottom: 32,
          }}>
            When customers ask ChatGPT or Gemini for a recommendation, do they
            hear your name? Scan now — it takes 30 seconds.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 440 }}>
            <div style={{
              flex: 1, padding: '14px 16px', borderRadius: '10px 0 0 10px',
              border: `1px solid ${border}`, borderRight: 'none',
              background: dark ? '#1F2937' : '#F9FAFB', fontSize: 15, color: textSecondary,
            }}>
              e.g. &quot;Joe&apos;s Plumbing, Denver&quot;
            </div>
            <div style={{
              padding: '14px 24px', borderRadius: '0 10px 10px 0',
              background: primary, color: '#FFFFFF', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap' as const,
            }}>
              Scan Free
            </div>
          </div>
        </div>

        <div style={{
          background: cardBg, borderRadius: 16, padding: '28px 24px',
          border: `1px solid ${border}`, marginBottom: 24,
          boxShadow: dark ? 'none' : '0 2px 12px rgba(0,0,0,0.03)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: textSecondary, letterSpacing: '0.03em', textTransform: 'uppercase' as const }}>
              Visibility Score
            </span>
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 12,
              background: 'rgba(220,38,38,0.1)', color: '#DC2626', fontWeight: 500,
            }}>Needs work</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: textPrimary, lineHeight: 1 }}>37</span>
            <span style={{ fontSize: 18, color: textSecondary, fontWeight: 500 }}>/100</span>
          </div>
          <div style={{
            height: 8, borderRadius: 4, background: dark ? '#1F2937' : '#F3F4F6', overflow: 'hidden',
          }}>
            <div style={{
              width: '37%', height: '100%', borderRadius: 4,
              background: `linear-gradient(90deg, ${primary}, ${violet})`,
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[
            { color: '#0D9488', label: 'Teal' },
            { color: '#7C3AED', label: 'Violet' },
            { color: '#111827', label: 'Ink' },
            { color: '#6B7280', label: 'Slate' },
            { color: '#F7F9FC', label: 'Cloud' },
            { color: '#FFFFFF', label: 'White' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' as const }}>
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: s.color,
                border: `1px solid ${border}`, marginBottom: 4,
              }} />
              <span style={{ fontSize: 10, color: textSecondary }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── DIRECTION 3: FORGE ─────────────────────────────────────────────────────
const Forge = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const bg = dark ? '#09090B' : '#FAFAFA';
  const cardBg = dark ? '#18181B' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';
  const textPrimary = dark ? '#FAFAFA' : '#09090B';
  const textSecondary = dark ? '#A1A1AA' : '#71717A';
  const green = '#10B981';
  const greenLight = dark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)';

  return (
    <section style={{ background: bg, padding: '80px 24px', fontFamily: BODY_SANS }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 20, marginBottom: 40,
          background: greenLight, color: green,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          DIRECTION 3 — FORGE
        </div>

        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em',
          color: textPrimary, marginBottom: 8, textTransform: 'uppercase' as const,
        }}>
          RANK<span style={{ color: green }}>ALL</span>
        </div>
        <p style={{ fontSize: 13, color: textSecondary, marginBottom: 48, letterSpacing: '0.02em' }}>
          Bold tool · High contrast · Electric green · Mono-accented
        </p>

        <div style={{
          background: dark ? '#09090B' : '#18181B',
          borderRadius: 16, padding: '64px 40px', marginBottom: 32,
          border: `1px solid ${dark ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          <div style={{
            display: 'inline-block', padding: '4px 10px', borderRadius: 4, marginBottom: 24,
            background: greenLight, color: green,
            fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            12 PLATFORMS · REAL-TIME
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1,
            color: '#FAFAFA', marginBottom: 20, letterSpacing: '-0.03em',
          }}>
            Your AI visibility<br />
            score in{' '}
            <span style={{ color: green }}>30 seconds</span>
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.6, color: 'rgba(250,250,250,0.55)',
            maxWidth: 440, marginBottom: 32,
          }}>
            AI is eating Google Search. When someone asks ChatGPT for a plumber,
            a dentist, a lawyer — do they say your name? Find out now.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <div style={{
              background: green, color: '#09090B', padding: '14px 28px',
              borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>
              Scan Your Business
            </div>
            <div style={{
              background: 'rgba(250,250,250,0.06)', color: '#FAFAFA', padding: '14px 28px',
              borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer',
              border: '1px solid rgba(250,250,250,0.12)',
            }}>
              Watch Demo
            </div>
          </div>
        </div>

        <div style={{
          background: cardBg, borderRadius: 12, padding: '28px 24px',
          border: `1px solid ${border}`, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: textSecondary, letterSpacing: '0.08em',
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}>
              VISIBILITY_SCORE
            </span>
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: greenLight, color: green, fontWeight: 600,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}>4/8 PLATFORMS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 52, fontWeight: 800, color: green, lineHeight: 1 }}>37</span>
            <span style={{ fontSize: 16, color: textSecondary, fontWeight: 500 }}>/100</span>
          </div>
          <div style={{
            height: 4, borderRadius: 2, background: dark ? '#27272A' : '#F4F4F5', overflow: 'hidden',
          }}>
            <div style={{ width: '37%', height: '100%', borderRadius: 2, background: green }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {[
            { color: '#09090B', label: 'Black' },
            { color: '#18181B', label: 'Zinc 900' },
            { color: '#10B981', label: 'Emerald' },
            { color: '#34D399', label: 'Mint' },
            { color: '#FAFAFA', label: 'White' },
            { color: '#71717A', label: 'Zinc 500' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' as const }}>
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: s.color,
                border: `1px solid ${border}`, marginBottom: 4,
              }} />
              <span style={{ fontSize: 10, color: textSecondary }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};


// ─── PHONE HERO MOCKUPS (390px) ─────────────────────────────────────────────
// Real copy, real CTA, real layout. This is the conversion surface.
// Screenshot placeholder = grey box with aspect ratio of a phone screenshot.

const PhoneFrame = ({ label, children, theme }: { label: string; children: React.ReactNode; theme: Theme }) => {
  const dark = theme === 'dark';
  return (
    <div style={{ marginBottom: 48 }}>
      <p style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
        color: dark ? '#6B7280' : '#9CA3AF', marginBottom: 12,
        fontFamily: BODY_SANS,
      }}>{label}</p>
      <div style={{
        width: 390, maxWidth: '100%', margin: '0 auto',
        borderRadius: 20, overflow: 'hidden',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : '#D1D5DB'}`,
        boxShadow: dark
          ? '0 8px 40px rgba(0,0,0,0.5)'
          : '0 8px 40px rgba(0,0,0,0.12)',
      }}>
        {children}
      </div>
    </div>
  );
};

const SignalPhoneHero = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const heroBg = dark ? '#0C1220' : '#FAFAF7';
  const accent = '#D4A017';
  const textSec = dark ? '#9CA3AF' : '#6B6B7B';

  return (
    <div style={{ background: heroBg, fontFamily: BODY_SANS }}>
      {/* Status bar placeholder */}
      <div style={{ height: 44, background: dark ? '#0C1220' : '#1A1A2E' }} />

      {/* Nav */}
      <div style={{
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: dark ? '#0C1220' : '#1A1A2E',
        borderBottom: '1px solid rgba(212,160,23,0.15)',
      }}>
        <span style={{ fontSize: 20, fontWeight: 400, color: '#F5F3EE', fontFamily: DISPLAY_SERIF }}>
          Rank<span style={{ color: accent }}>all</span>
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: accent, padding: '6px 14px',
          border: `1px solid ${accent}`, borderRadius: 6,
        }}>Sign In</span>
      </div>

      {/* Hero content */}
      <div style={{
        padding: '40px 20px 32px',
        background: dark
          ? 'linear-gradient(180deg, #0C1220 0%, #1A1A2E 100%)'
          : 'linear-gradient(180deg, #1A1A2E 0%, #2D2B55 100%)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20, marginBottom: 20,
          background: 'rgba(212,160,23,0.12)', color: accent,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          SCANNING 12 AI PLATFORMS
        </div>

        <h1 style={{
          fontSize: 30, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.01em',
          color: '#F5F3EE', marginBottom: 14, fontFamily: DISPLAY_SERIF,
        }}>
          Find out if AI recommends your business.
        </h1>

        <p style={{
          fontSize: 14, lineHeight: 1.6, color: 'rgba(245,243,238,0.6)', marginBottom: 24,
        }}>
          We scan ChatGPT, Gemini, Perplexity and 8 more AI platforms in 60 seconds.
          See who they recommend instead of you — and how to fix it.
        </p>

        <p style={{
          fontSize: 11, color: 'rgba(245,243,238,0.4)', marginBottom: 8,
          fontWeight: 600, letterSpacing: '0.04em',
        }}>
          ENTER YOUR BUSINESS NAME
        </p>

        {/* Search input */}
        <div style={{
          background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(212,160,23,0.3)',
          borderRadius: 12, padding: 6,
        }}>
          <div style={{
            padding: '12px 14px', fontSize: 15, color: 'rgba(245,243,238,0.35)',
          }}>
            e.g. Anderson Plumbing, Chicago
          </div>
          <div style={{
            background: accent, color: '#1A1A2E', padding: '13px 0',
            borderRadius: 8, fontSize: 15, fontWeight: 600, textAlign: 'center' as const,
            cursor: 'pointer',
          }}>
            Run free scan
          </div>
        </div>

        <p style={{
          fontSize: 11, color: 'rgba(245,243,238,0.35)', marginTop: 12, textAlign: 'center' as const,
        }}>
          Trusted by businesses across 14 countries
        </p>
      </div>

      {/* Screenshot placeholder */}
      <div style={{
        margin: '0 20px 24px', borderRadius: 12, overflow: 'hidden',
        background: dark ? '#151E2E' : 'rgba(245,243,238,0.08)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(245,243,238,0.1)'}`,
        aspectRatio: '390/280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, color: textSec, fontStyle: 'italic' }}>
          Report screenshot placeholder
        </span>
      </div>
    </div>
  );
};

const PrismPhoneHero = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const bg = dark ? '#0A0F1A' : '#F7F9FC';
  const cardBg = dark ? '#111827' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const textPrimary = dark ? '#F3F4F6' : '#111827';
  const textSec = dark ? '#9CA3AF' : '#6B7280';
  const primary = '#0D9488';
  const primaryLight = dark ? 'rgba(13,148,136,0.15)' : 'rgba(13,148,136,0.08)';
  const violet = '#7C3AED';

  return (
    <div style={{ background: bg, fontFamily: BODY_SANS }}>
      <div style={{ height: 44, background: bg }} />
      <div style={{
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: cardBg, borderBottom: `1px solid ${border}`,
      }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: textPrimary, letterSpacing: '-0.03em' }}>
          rank<span style={{ color: primary }}>all</span>
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: primary, padding: '6px 14px',
          background: primaryLight, borderRadius: 6,
        }}>Sign In</span>
      </div>

      <div style={{ padding: '40px 20px 32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20, marginBottom: 20,
          background: primaryLight, color: primary, fontSize: 12, fontWeight: 500,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: primary, display: 'inline-block' }} />
          Scanning 12 AI platforms
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em',
          color: textPrimary, marginBottom: 14,
        }}>
          Find out if AI recommends your business.
        </h1>

        <p style={{
          fontSize: 14, lineHeight: 1.6, color: textSec, marginBottom: 24,
        }}>
          We scan ChatGPT, Gemini, Perplexity and 8 more AI platforms in 60 seconds.
          See who they recommend instead of you — and how to fix it.
        </p>

        {/* Search */}
        <div style={{
          background: cardBg, border: `1.5px solid ${border}`,
          borderRadius: 14, padding: 6,
          boxShadow: dark ? 'none' : '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          <div style={{
            padding: '12px 14px', fontSize: 15, color: textSec,
          }}>
            e.g. Anderson Plumbing, Chicago
          </div>
          <div style={{
            background: primary, color: '#FFFFFF', padding: '13px 0',
            borderRadius: 10, fontSize: 15, fontWeight: 600, textAlign: 'center' as const,
            cursor: 'pointer',
          }}>
            Run free scan
          </div>
        </div>

        <p style={{
          fontSize: 11, color: textSec, marginTop: 12, textAlign: 'center' as const,
        }}>
          Trusted by businesses across 14 countries
        </p>
      </div>

      {/* Screenshot placeholder */}
      <div style={{
        margin: '0 20px 24px', borderRadius: 12, overflow: 'hidden',
        background: dark ? '#1F2937' : '#F3F4F6',
        border: `1px solid ${border}`, aspectRatio: '390/280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, color: textSec, fontStyle: 'italic' }}>
          Report screenshot placeholder
        </span>
      </div>
    </div>
  );
};

const ForgePhoneHero = ({ theme }: { theme: Theme }) => {
  const dark = theme === 'dark';
  const bg = dark ? '#09090B' : '#09090B';
  const textSec = '#A1A1AA';
  const green = '#10B981';
  const greenLight = 'rgba(16,185,129,0.12)';

  return (
    <div style={{ background: bg, fontFamily: BODY_SANS }}>
      <div style={{ height: 44, background: bg }} />
      <div style={{
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#FAFAFA', letterSpacing: '-0.04em', textTransform: 'uppercase' as const }}>
          RANK<span style={{ color: green }}>ALL</span>
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: green, padding: '6px 14px',
          background: greenLight, borderRadius: 4,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>SIGN IN</span>
      </div>

      <div style={{ padding: '40px 20px 32px' }}>
        <div style={{
          display: 'inline-block', padding: '4px 10px', borderRadius: 4, marginBottom: 20,
          background: greenLight, color: green,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>
          12 PLATFORMS · REAL-TIME
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em',
          color: '#FAFAFA', marginBottom: 14,
        }}>
          Find out if AI recommends your business.
        </h1>

        <p style={{
          fontSize: 14, lineHeight: 1.6, color: 'rgba(250,250,250,0.5)', marginBottom: 24,
        }}>
          We scan ChatGPT, Gemini, Perplexity and 8 more AI platforms in 60 seconds.
          See who they recommend instead of you — and how to fix it.
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(16,185,129,0.2)',
          borderRadius: 10, padding: 6,
        }}>
          <div style={{
            padding: '12px 14px', fontSize: 15, color: 'rgba(250,250,250,0.3)',
          }}>
            e.g. Anderson Plumbing, Chicago
          </div>
          <div style={{
            background: green, color: '#09090B', padding: '13px 0',
            borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'center' as const,
            cursor: 'pointer',
          }}>
            Run free scan
          </div>
        </div>

        <p style={{
          fontSize: 11, color: 'rgba(250,250,250,0.3)', marginTop: 12, textAlign: 'center' as const,
        }}>
          Trusted by businesses across 14 countries
        </p>
      </div>

      <div style={{
        margin: '0 20px 24px', borderRadius: 10, overflow: 'hidden',
        background: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
        aspectRatio: '390/280',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, color: textSec, fontStyle: 'italic' }}>
          Report screenshot placeholder
        </span>
      </div>
    </div>
  );
};


// ─── PAGE ───────────────────────────────────────────────────────────────────
export default function BrandPreviewPage() {
  const [theme, setTheme] = useState<Theme>('light');

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONT_LINK} />
      <div style={{ minHeight: '100vh', background: theme === 'dark' ? '#000' : '#F0F0F0' }}>
        {/* Sticky toggle */}
        <div style={{
          position: 'sticky' as const, top: 0, zIndex: 50,
          display: 'flex', justifyContent: 'center', padding: '12px 0',
          background: theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, fontFamily: BODY_SANS,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
            }}>
              RANKALL BRAND PREVIEW
            </span>
            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              style={{
                padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 500, border: 'none',
                background: theme === 'dark' ? '#27272A' : '#E5E7EB',
                color: theme === 'dark' ? '#FAFAFA' : '#111827',
              }}
            >
              {theme === 'light' ? '◐ Dark' : '◑ Light'}
            </button>
          </div>
        </div>

        {/* ─── SWATCHES + SAMPLE CARDS ───────────────────────────────── */}
        <Signal theme={theme} />
        <div style={{ height: 2, background: theme === 'dark' ? '#1F1F23' : '#D1D5DB' }} />
        <Prism theme={theme} />
        <div style={{ height: 2, background: theme === 'dark' ? '#1F1F23' : '#D1D5DB' }} />
        <Forge theme={theme} />

        {/* ─── PHONE HERO MOCKUPS (390px) ─────────────────────────────── */}
        <div style={{
          padding: '80px 24px 40px', textAlign: 'center' as const,
          borderTop: `2px solid ${theme === 'dark' ? '#1F1F23' : '#D1D5DB'}`,
        }}>
          <h2 style={{
            fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
            color: theme === 'dark' ? '#F3F4F6' : '#111827',
            marginBottom: 8, fontFamily: BODY_SANS,
          }}>
            Phone Hero — 390px
          </h2>
          <p style={{
            fontSize: 14, color: theme === 'dark' ? '#6B7280' : '#9CA3AF',
            marginBottom: 48, fontFamily: BODY_SANS,
          }}>
            Real headline, real subhead, real CTA. This is the conversion surface.
          </p>
        </div>

        <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 16px 80px' }}>
          <PhoneFrame label="SIGNAL — PHONE HERO" theme={theme}>
            <SignalPhoneHero theme={theme} />
          </PhoneFrame>

          <PhoneFrame label="PRISM — PHONE HERO" theme={theme}>
            <PrismPhoneHero theme={theme} />
          </PhoneFrame>

          <PhoneFrame label="FORGE — PHONE HERO" theme={theme}>
            <ForgePhoneHero theme={theme} />
          </PhoneFrame>
        </div>

        {/* Footer */}
        <div style={{
          padding: '40px 24px', textAlign: 'center' as const, fontFamily: BODY_SANS,
        }}>
          <p style={{
            fontSize: 13, color: theme === 'dark' ? '#6B7280' : '#9CA3AF',
            maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
          }}>
            Logo marks are placeholders — treat as a separate problem.
            Pick a direction from the phone heroes, then we refine.
          </p>
        </div>
      </div>
    </>
  );
}
