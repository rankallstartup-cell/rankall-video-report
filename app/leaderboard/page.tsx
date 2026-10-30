'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { jsonLdString } from '@/lib/jsonLd';

const NAVY   = '#0A0A14';
const BLUE   = '#1B17FF';
const GOLD   = '#F59E0B';
const BORDER = '#EDEDF4';
const GRAY   = '#55556A';
const LGRAY  = '#8A8AA3';
const W      = '#FFFFFF';
const BG     = '#F6F6FB';
const GREEN  = '#059669';

const INDUSTRIES = [
  { label: 'All Industries', value: '' },
  { label: 'Dentist',        value: 'dentist'      },
  { label: 'Restaurant',     value: 'restaurant'   },
  { label: 'Lawyer',         value: 'lawyer'       },
  { label: 'HVAC',           value: 'hvac'         },
  { label: 'Plumber',        value: 'plumber'      },
  { label: 'Med Spa',        value: 'medspa'       },
  { label: 'Real Estate',    value: 'realestate'   },
  { label: 'Gym',            value: 'gym'          },
  { label: 'Chiropractor',   value: 'chiropractor' },
  { label: 'Veterinarian',   value: 'veterinarian' },
  { label: 'Auto Repair',    value: 'autorepair'   },
  { label: 'Hotel',          value: 'hotel'        },
  { label: 'Electrician',    value: 'electrician'  },
  { label: 'Landscaping',    value: 'landscaping'  },
  { label: 'Photographer',   value: 'photographer' },
  { label: 'Wedding Venue',  value: 'weddingvenue' },
  { label: 'Therapist',      value: 'therapist'    },
  { label: 'Accountant',     value: 'accountant'   },
  { label: 'General',        value: 'general'      },
];

const STATES = [
  { label: 'All States', value: '' },
  ...['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
      'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
      'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
      'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
      'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
      'Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
      'Virginia','Washington','West Virginia','Wisconsin','Wyoming'].map(s => ({ label: s, value: s })),
];

interface LeaderboardEntry {
  rank: number;
  // No id, no competitorName: the API returns anonymized rows only — no
  // customer identity and no links to other customers' reports.
  businessName: string;
  city: string;
  overallScore: number;
  trustScore: number;
  mentionedCount: number;
  industry: string;
  updatedAt: string;
}

function scoreColor(s: number) {
  return s >= 75 ? GREEN : s >= 50 ? '#D97706' : '#DC2626';
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 28, lineHeight: 1 }}><svg viewBox="0 0 512 512" width="28" height="28" fill="#F59E0B" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg></span>;
  if (rank === 2) return <span style={{ fontSize: 28, lineHeight: 1 }}><svg viewBox="0 0 512 512" width="28" height="28" fill="#94A3B8" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg></span>;
  if (rank === 3) return <span style={{ fontSize: 28, lineHeight: 1 }}><svg viewBox="0 0 512 512" width="28" height="28" fill="#B45309" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg></span>;
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: '#EEF0FF', border: '1.5px solid #C9D4FF',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, color: BLUE,
    }}>
      {rank}
    </div>
  );
}

function TrustBar({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 100, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${value}%`, background: scoreColor(value), borderRadius: 100, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(value), minWidth: 28 }}>{value}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const [industry, setIndustry]   = useState('');
  const [state,    setState]      = useState('');
  const [entries,  setEntries]    = useState<LeaderboardEntry[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [visible,  setVisible]    = useState<boolean[]>([]);

  const fetchLeaderboard = useCallback(async (ind: string, st: string) => {
    setLoading(true);
    setVisible([]);
    try {
      const params = new URLSearchParams();
      if (ind) params.set('industry', ind);
      if (st)  params.set('state', st);
      const res = await fetch(`/api/leaderboard?${params}`);
      const data = await res.json();
      setEntries(data.ranked ?? []);
      setUpdatedAt(data.updatedAt ?? null);
      // Stagger row animations
      const rows = data.ranked ?? [];
      rows.forEach((_: unknown, i: number) => {
        setTimeout(() => setVisible(v => { const n = [...v]; n[i] = true; return n; }), i * 70);
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeaderboard(industry, state); }, [industry, state, fetchLeaderboard]);

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      {/* b87g: ItemList schema for the rankings — built from the
          SAME anonymized rows the page displays (the API returns
          no customer identity and no per-row links, so the schema
          carries positions + displayed labels only). */}
      {entries.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'AI Visibility Leaderboard',
          itemListElement: entries.map(e => ({
            '@type': 'ListItem',
            position: e.rank,
            name: e.businessName,
          })),
        }) }} />
      )}
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #1E293B 100%)`,
        padding: 'clamp(48px,8vw,80px) 20px clamp(40px,6vw,56px)',
        textAlign: 'center',
        borderTop: `4px solid ${GOLD}`,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.4)', borderRadius: 100, padding: '6px 18px', marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Rankings</span>
        </div>

        <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 900, color: W, letterSpacing: '-1.5px', marginBottom: 14, lineHeight: 1.1 }}>
          AI Visibility Leaderboard
        </h1>
        <p style={{ fontSize: 'clamp(15px,2vw,18px)', color: LGRAY, maxWidth: 520, margin: '0 auto 0', lineHeight: 1.6 }}>
          See which businesses dominate AI recommendations in your area
        </p>
        <p style={{ fontSize: 13, color: LGRAY, maxWidth: 520, margin: '10px auto 0', lineHeight: 1.6 }}>
          Businesses are shown anonymously — names are never published without consent.
        </p>
        <p style={{ fontSize: 13, color: LGRAY, maxWidth: 520, margin: '10px auto 0', lineHeight: 1.6 }}>
          Ranked by AI Score — each business&apos;s overall score across 12 AI platforms, from its highest-scoring scan.
        </p>
      </section>

      {/* ── FILTER BAR ───────────────────────────────────────────────── */}
      <section style={{ background: W, borderBottom: `1.5px solid ${BORDER}`, padding: '18px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: GRAY, whiteSpace: 'nowrap' }}>Filter by:</span>
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={{
              background: W, border: `1.5px solid ${BORDER}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 14,
              color: NAVY, fontFamily: 'inherit', cursor: 'pointer',
              minWidth: 160, flex: '1 1 160px', maxWidth: 260,
            }}
          >
            {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <select
            value={state}
            onChange={e => setState(e.target.value)}
            style={{
              background: W, border: `1.5px solid ${BORDER}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 14,
              color: NAVY, fontFamily: 'inherit', cursor: 'pointer',
              minWidth: 160, flex: '1 1 160px', maxWidth: 260,
            }}
          >
            {STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </section>

      {/* ── TABLE ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px 64px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${BORDER}`, borderTopColor: BLUE, margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: GRAY, fontSize: 14 }}>Loading rankings…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: W, borderRadius: 16, border: `1.5px solid ${BORDER}` }}>
            <p style={{ fontSize: 40, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="#0A0A14" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></p>
            <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 8 }}>No results yet for this filter</p>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>Be the first business in this category to appear on the leaderboard.</p>
            <Link href="/" style={{ background: BLUE, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: W, textDecoration: 'none' }}>
              Scan your business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }} className="desktop-table">
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 110px 110px 100px', gap: 0, padding: '12px 20px', background: BG, borderBottom: `1.5px solid ${BORDER}` }}>
                {['Rank','Business','City','AI Score','Trust Score','Platforms'].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                ))}
              </div>

              {entries.map((entry, i) => (
                <div
                  key={entry.rank}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 120px 110px 110px 100px',
                    gap: 0,
                    padding: '16px 20px',
                    borderBottom: i < entries.length - 1 ? `1px solid ${BORDER}` : 'none',
                    alignItems: 'center',
                    background: entry.rank === 1 ? 'linear-gradient(90deg,rgba(245,158,11,0.05),transparent)' : W,
                    opacity: visible[i] ? 1 : 0,
                    transform: visible[i] ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'opacity 0.35s ease, transform 0.35s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <RankBadge rank={entry.rank} />
                  </div>

                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>
                      {entry.rank === 1 && <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}><svg viewBox="0 0 576 512" width="14" height="14" fill="#F59E0B" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg></span>}
                      {entry.businessName}
                    </p>
                  </div>

                  <span style={{ fontSize: 13, color: GRAY }}>{entry.city || '—'}</span>

                  <div>
                    <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor(entry.overallScore) }}>{entry.overallScore}</span>
                    <span style={{ fontSize: 12, color: LGRAY }}>/100</span>
                  </div>

                  <TrustBar value={entry.trustScore} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>{entry.mentionedCount}</span>
                    <span style={{ fontSize: 12, color: LGRAY }}>/ 12</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
              {entries.map((entry, i) => (
                <div
                  key={entry.rank}
                  style={{
                    background: W, border: `1.5px solid ${entry.rank <= 3 ? GOLD : BORDER}`,
                    borderRadius: 14, padding: '16px 18px',
                    boxShadow: entry.rank === 1 ? `0 4px 16px rgba(245,158,11,0.2)` : '0 1px 4px rgba(0,0,0,0.05)',
                    opacity: visible[i] ? 1 : 0,
                    transform: visible[i] ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'opacity 0.35s ease, transform 0.35s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <RankBadge rank={entry.rank} />
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
                          {entry.rank === 1 && (<svg viewBox="0 0 576 512" width="14" height="14" fill="#F59E0B" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg>)}{entry.businessName}
                        </p>
                        <p style={{ fontSize: 12, color: GRAY, margin: '2px 0 0' }}>{entry.city || '—'}</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '8px 4px' }}>
                      <p style={{ fontSize: 20, fontWeight: 900, color: scoreColor(entry.overallScore), margin: 0, lineHeight: 1 }}>{entry.overallScore}</p>
                      <p style={{ fontSize: 10, color: LGRAY, margin: '3px 0 0' }}>AI Score</p>
                    </div>
                    <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '8px 4px' }}>
                      <p style={{ fontSize: 20, fontWeight: 900, color: scoreColor(entry.trustScore), margin: 0, lineHeight: 1 }}>{entry.trustScore}</p>
                      <p style={{ fontSize: 10, color: LGRAY, margin: '3px 0 0' }}>Trust</p>
                    </div>
                    <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '8px 4px' }}>
                      <p style={{ fontSize: 20, fontWeight: 900, color: BLUE, margin: 0, lineHeight: 1 }}>{entry.mentionedCount}/12</p>
                      <p style={{ fontSize: 10, color: LGRAY, margin: '3px 0 0' }}>Platforms</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Newest scan in the ranking (data-derived, not the fetch time) */}
            {formattedDate && (
              <p style={{ fontSize: 12, color: LGRAY, textAlign: 'right', marginTop: 12 }}>
                Newest scan in this ranking: {formattedDate}
              </p>
            )}
          </>
        )}

        {/* CTA */}
        <div style={{
          marginTop: 48,
          background: `linear-gradient(135deg, ${NAVY}, #1E293B)`,
          borderRadius: 20, padding: 'clamp(28px,5vw,40px) clamp(24px,5vw,48px)',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${GOLD}, #FBBF24)` }} />
          <p style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 900, color: W, marginBottom: 10, lineHeight: 1.2 }}>
            Get your business on this leaderboard
          </p>
          <p style={{ fontSize: 15, color: LGRAY, marginBottom: 28, lineHeight: 1.6, maxWidth: 440, margin: '0 auto 28px' }}>
            Find out your current AI visibility score and see exactly what it takes to rank #1 in your area.
          </p>
          <Link href="/" style={{
            display: 'inline-block', background: GOLD, borderRadius: 12,
            padding: '15px 36px', fontSize: 15, fontWeight: 800, color: NAVY,
            textDecoration: 'none', boxShadow: '0 4px 16px rgba(245,158,11,0.4)',
          }}>
            Scan your business for free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </section>


      <style>{`
        @media (max-width: 768px) {
          .desktop-table { display: none !important; }
          .mobile-cards  { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
