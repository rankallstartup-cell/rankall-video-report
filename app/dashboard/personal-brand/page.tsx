'use client';

import { useState, useEffect } from 'react';
import { usePlan } from '@/lib/usePlan';
import { isStarterPlan, isAdminUser, getPlanConfig, normalizePlan } from '@/lib/planConfig';
import { getBrowserClient } from '@/lib/supabase';
import UpgradePrompt from '@/components/UpgradePrompt';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import type { PersonalScanResult, PersonalQueryResult, PersonalTrustSignal, ReputationAlert } from '@/app/api/scan-personal/route';
import type { LinkedInResult } from '@/app/api/personal-linkedin/route';
import type { CompetitorResult, PeerComparisonResult } from '@/app/api/personal-competitor/route';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const supabase = getBrowserClient();

const BG    = '#F6F6FB';
const W     = '#FFFFFF';
const NAVY  = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE  = '#1B17FF';
const GREEN = '#12A150';
const RED   = '#B4232A';
const AMBER = '#D97706';
const PURPLE = '#7C3AED';
const GRAY  = '#55556A';
const LGRAY = '#5F5F78';

const QUERY_LABELS: Record<PersonalQueryResult['query_type'], string> = {
  name_recognition: 'Name Recognition',
  expertise:        'Expertise Queries',
  recommendation:   'Recommendation Queries',
  authority:        'Authority Queries',
  comparison:       'Comparison Queries',
};

const QUERY_WEIGHTS: Record<PersonalQueryResult['query_type'], number> = {
  name_recognition: 25,
  expertise:        20,
  recommendation:   30,
  authority:        15,
  comparison:       10,
};

const SHORT_PLATFORMS = ['ChatGPT','Gemini','Perplx.','Grok','Claude','Copilot','DeepSeek','Mistral','Kimi','Groq','G.AI'];
const FULL_PLATFORMS  = ['ChatGPT','Gemini','Perplexity','Grok','Claude','Copilot','DeepSeek','Mistral','Kimi','Groq','Google AI'];

interface AuthoritySnapshot {
  id: string;
  scan_date: string;
  wikipedia_exists: boolean;
  knowledge_panel_exists: boolean;
  healthgrades_score: number;
  pubmed_citations: number;
  press_mentions: number;
  podcast_appearances: number;
  linkedin_followers: number;
  personal_ai_score: number;
  created_at: string;
}

interface PitchKit {
  press_pitch: string;
  podcast_bio: string;
  wikipedia_draft: string;
  linkedin_about: string;
}

// ── HELPERS ───────────────────────────────────────────────────────────

function pctColor(pct: number): { bg: string; text: string } {
  if (pct === 0)      return { bg: '#FEF2F2', text: RED };
  if (pct <= 40)      return { bg: '#FEF3C7', text: '#92400E' };
  if (pct <= 70)      return { bg: '#FEF9C3', text: '#713F12' };
  return              { bg: '#DCFCE7', text: '#14532D' };
}

function ScoreRing({ score, label, size = 'md', color }: { score: number | null; label: string; size?: 'sm' | 'md' | 'lg'; color: string }) {
  const dim = size === 'lg' ? 140 : size === 'md' ? 100 : 76;
  const r = (dim / 2) - 9;
  const circ = 2 * Math.PI * r;
  const dash = score != null ? (score / 100) * circ : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: dim, height: dim }}>
        <svg width={dim} height={dim} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="9" />
          <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke={score != null ? color : BORDER} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {score != null
            ? <span style={{ fontSize: size === 'lg' ? 32 : size === 'md' ? 24 : 18, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
            : <span style={{ fontSize: 13, color: LGRAY }}>—</span>}
          <span style={{ fontSize: 9, color: LGRAY, fontWeight: 600 }}>/100</span>
        </div>
      </div>
      <p style={{ fontSize: size === 'lg' ? 13 : 12, fontWeight: 700, color: NAVY, textAlign: 'center', margin: 0 }}>{label}</p>
    </div>
  );
}

function QueryBar({ qr }: { qr: PersonalQueryResult }) {
  const weight = QUERY_WEIGHTS[qr.query_type];
  const color = qr.mention_rate >= 60 ? GREEN : qr.mention_rate >= 30 ? AMBER : RED;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{QUERY_LABELS[qr.query_type]}</span>
          <span style={{ fontSize: 11, color: LGRAY, marginLeft: 8 }}>{weight}% of score</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{qr.mention_rate}%</span>
      </div>
      <div style={{ background: '#F6F6FB', borderRadius: 100, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${qr.mention_rate}%`, background: color, borderRadius: 100, transition: 'width 0.6s ease' }} />
      </div>
      <p style={{ fontSize: 11, color: LGRAY, marginTop: 4 }}>
        Mentioned in {qr.mentioned_count}/{qr.total_platforms} platforms · {qr.recommended_count} recommended
      </p>
    </div>
  );
}

function TrustSignalRow({ signal, onFix }: { signal: PersonalTrustSignal; onFix: (key: string) => void }) {
  const priorityColor = signal.fix_priority === 'high' ? RED : signal.fix_priority === 'medium' ? AMBER : GRAY;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BORDER}`, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{signal.exists ? <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> : <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>}</span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: 0 }}>{signal.label}</p>
          <p style={{ fontSize: 11, color: LGRAY, margin: 0 }}>+{signal.score_impact} pts if present</p>
        </div>
      </div>
      {!signal.exists && signal.fix_available && (
        <button onClick={() => onFix(signal.key)} className="btn btn-blue btn-sm" style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Fix <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
      )}
      {!signal.exists && !signal.fix_available && (
        <span style={{ fontSize: 11, fontWeight: 600, color: priorityColor, flexShrink: 0 }}>{signal.fix_priority} priority</span>
      )}
    </div>
  );
}

// ── FEATURE 1: RECOMMENDATION SHARE GRID ─────────────────────────────

function RecommendationShareGrid({ result }: { result: PersonalScanResult }) {
  const queryTypes: PersonalQueryResult['query_type'][] = [
    'name_recognition', 'expertise', 'recommendation', 'authority', 'comparison'
  ];

  // Build summary insight for the top gap
  const nameRec = result.query_results.find(q => q.query_type === 'name_recognition');
  const recQuery = result.query_results.find(q => q.query_type === 'recommendation');
  const nameRecRate = nameRec?.mention_rate ?? 0;
  const recRate = recQuery?.mention_rate ?? 0;

  let insight = '';
  if (nameRecRate > 60 && recRate < 30) {
    insight = `AI knows you by name but rarely recommends you in category searches. Fix: claim your Google Knowledge Panel and add a Wikipedia stub to build entity authority.`;
  } else if (nameRecRate < 30) {
    insight = `AI platforms don't yet recognize your name. Fix: optimize your LinkedIn bio with your exact name + specialty, and build a Wikipedia presence to establish entity recognition.`;
  } else if (recRate > 60) {
    insight = `Strong recommendation rate across platforms. Focus on authority queries to push your score higher with board certifications and published work signals.`;
  } else {
    insight = `Mixed recognition across platforms. Perplexity and ChatGPT typically respond best to Wikipedia and press mention signals — those are your highest-leverage fixes.`;
  }

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4 }}>AI Recommendation Share by Query Type</p>
      <p style={{ fontSize: 12, color: LGRAY, marginBottom: 20 }}>How often each platform mentions you, per query type. Green = strong, Red = missing.</p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontSize: 11, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: LGRAY, fontWeight: 700, fontSize: 10, width: 140, whiteSpace: 'nowrap' }}>Query Type</th>
              {FULL_PLATFORMS.map((p, i) => (
                <th key={p} style={{ textAlign: 'center', padding: '6px 4px', color: LGRAY, fontWeight: 700, fontSize: 9, whiteSpace: 'nowrap' }}>{SHORT_PLATFORMS[i]}</th>
              ))}
              <th style={{ textAlign: 'center', padding: '6px 4px', color: LGRAY, fontWeight: 700, fontSize: 10 }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {queryTypes.map(qt => {
              const qr = result.query_results.find(q => q.query_type === qt);
              return (
                <tr key={qt}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: NAVY, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {QUERY_LABELS[qt].replace(' Queries', '').replace(' Recognition', ' Recog.')}
                  </td>
                  {FULL_PLATFORMS.map(platform => {
                    const detail = qr?.platform_details.find(p => p.platform === platform);
                    const pct = detail?.mentioned ? (detail.recommended ? 100 : 50) : 0;
                    const { bg, text } = pctColor(pct);
                    const label = detail?.mentioned ? (detail.recommended ? <svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg> : <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>) : '—';
                    return (
                      <td key={platform} style={{ padding: '3px', textAlign: 'center' }}>
                        <div style={{ background: bg, borderRadius: 4, padding: '4px 2px', fontSize: 10, fontWeight: 700, color: text }}>
                          {label}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '3px', textAlign: 'center' }}>
                    {(() => {
                      const rate = qr?.mention_rate ?? 0;
                      const { bg, text } = pctColor(rate);
                      return <div style={{ background: bg, borderRadius: 4, padding: '4px 2px', fontSize: 10, fontWeight: 800, color: text }}>{rate}%</div>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '12px 16px', marginTop: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Insight</p>
        <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: 0 }}>{insight}</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {[{ icon: <svg viewBox="0 0 576 512" width="9" height="9" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>, label: 'Recommended by name', color: '#14532D', bg: '#DCFCE7' }, { icon: <svg viewBox="0 0 448 512" width="9" height="9" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>, label: 'Mentioned', color: '#713F12', bg: '#FEF9C3' }, { icon: null, label: 'Not found', color: LGRAY, bg: '#F6F6FB' }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 16, borderRadius: 4, background: l.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: l.color }}>{l.icon ?? '—'}</span>
            </div>
            <span style={{ fontSize: 11, color: GRAY }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FEATURE 2: AUTHORITY TIMELINE ────────────────────────────────────

function AuthorityTimeline({ snapshots, onFix }: { snapshots: AuthoritySnapshot[]; onFix: (fixType: string) => void }) {
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // SVG line chart
  const VW = 600, VH = 160, PL = 36, PR = 16, PT = 12, PB = 28;
  const CW = VW - PL - PR, CH = VH - PT - PB;
  const n = snapshots.length;

  const xPos = (i: number) => n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW;
  const yPos = (s: number) => PT + CH - (Math.max(0, Math.min(100, s)) / 100) * CH;

  const pts = snapshots.map((s, i) => ({ x: xPos(i), y: yPos(s.personal_ai_score), score: s.personal_ai_score, date: fmtDate(s.scan_date) }));

  let path = '';
  if (pts.length > 1) {
    path = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
  }

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Personal Authority Timeline</p>
      <p style={{ fontSize: 12, color: LGRAY, marginBottom: 20 }}>Your AI visibility score over time as signals build up.</p>

      {snapshots.length < 2 ? (
        <div style={{ background: BG, borderRadius: 12, padding: '20px', textAlign: 'center', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>Run more scans to see your authority timeline. Each scan captures a snapshot.</p>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[0, 25, 50, 75, 100].map(g => {
              const y = yPos(g);
              return (
                <g key={g}>
                  <line x1={PL} y1={y} x2={PL+CW} y2={y} stroke={BORDER} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={PL-4} y={y+4} textAnchor="end" fontSize={9} fill={LGRAY} fontFamily="inherit">{g}</text>
                </g>
              );
            })}
            {path && (
              <>
                <path d={`${path} L ${pts[pts.length-1].x} ${PT+CH} L ${pts[0].x} ${PT+CH} Z`} fill={PURPLE} fillOpacity={0.08} />
                <path d={path} fill="none" stroke={PURPLE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={4} fill={PURPLE} stroke={W} strokeWidth={2} />
                {i === pts.length - 1 && (
                  <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fill={PURPLE} fontWeight="700" fontFamily="inherit">{p.score}</text>
                )}
                <text x={p.x} y={VH - 4} textAnchor="middle" fontSize={9} fill={LGRAY} fontFamily="inherit">{p.date}</text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Signal Checklist removed — it read present/absent off historical
          snapshots, which contradicted the live "Authority Signal Checklist"
          (result.trust_signals). This component now shows only the timeline
          chart; the single source of truth for present/absent signals is the
          Authority Signal Checklist below. */}
    </div>
  );
}

// ── FEATURE 4: AI PITCH GENERATOR ────────────────────────────────────

interface PitchAsset { key: string; title: string; tip: string; tipPoints: string; content: string; }

function PitchKitSection({ result }: { result: PersonalScanResult }) {
  const [pitchKit, setPitchKit]   = useState<PitchKit | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [error, setError]         = useState<string | null>(null);

  async function generateKit() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/personal-fix/pitch-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.name, specialty: result.specialty, city: result.location }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPitchKit(data);
    } catch (e) {
      setError('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function copyAsset(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    });
  }

  const assets: PitchAsset[] = pitchKit ? [
    { key: 'press', title: 'Press Pitch (HARO Style)', tip: 'Submit to HARO (helpareporter.com) daily.', tipPoints: 'One press mention = +8 AI score points', content: pitchKit.press_pitch },
    { key: 'podcast', title: 'Podcast Guest Bio', tip: 'Send to 5 podcasts in your specialty this week.', tipPoints: 'Each appearance = +6 AI score points', content: pitchKit.podcast_bio },
    { key: 'wikipedia', title: 'Wikipedia Draft', tip: 'Submit at en.wikipedia.org/wiki/Wikipedia:Articles_for_creation', tipPoints: 'Wikipedia page = +15 AI score points', content: pitchKit.wikipedia_draft },
    { key: 'linkedin', title: 'LinkedIn About Section', tip: 'Update your LinkedIn About section immediately.', tipPoints: 'LinkedIn optimization = +5 AI score points', content: pitchKit.linkedin_about },
  ] : [];

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>Your AI Pitch Kit</p>
          <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>4 ready-to-use authority assets generated by Opus 4.8</p>
        </div>
        <button
          onClick={generateKit}
          className="btn btn-blue"
          disabled={generating}
          style={{ background: generating ? LGRAY : NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer' }}
        >
          {generating ? 'Generating with Opus 4.8…' : pitchKit ? (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M48.5 224L40 224c-13.3 0-24-10.7-24-24L16 72c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2L98.6 96.6c87.6-86.5 228.7-86.2 315.8 1c87.5 87.5 87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3c-62.2-62.2-162.7-62.5-225.3-1L185 183c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8L48.5 224z"/></svg>{' '}Regenerate Kit</>) : (<>Generate My Pitch Kit <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
        </button>
      </div>

      {error && <p style={{ fontSize: 13, color: RED, margin: '12px 0 0' }}>{error}</p>}

      {assets.length > 0 && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {assets.map(asset => (
            <div key={asset.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: NAVY, margin: 0 }}>{asset.title}</p>
                  <span style={{ fontSize: 11, color: LGRAY, background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 8px' }}>{wordCount(asset.content)} words</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => copyAsset(asset.key, asset.content)}
                    className="btn btn-line btn-sm"
                    style={{ background: copied === asset.key ? '#DCFCE7' : BLUE, color: copied === asset.key ? '#14532D' : '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {copied === asset.key ? (<><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy'}
                  </button>
                  <button
                    onClick={() => setPublished(p => { const next = new Set(p); next.has(asset.key) ? next.delete(asset.key) : next.add(asset.key); return next; })}
                    className="btn btn-ghost btn-sm"
                    style={{ background: published.has(asset.key) ? '#ECFDF5' : BG, color: published.has(asset.key) ? GREEN : GRAY, border: `1.5px solid ${published.has(asset.key) ? '#A7F3D0' : BORDER}`, borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {published.has(asset.key) ? (<><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Published</>) : 'Mark Published'}
                  </button>
                </div>
              </div>
              <div style={{ background: '#0A0A14', borderRadius: 12, padding: '16px 18px', position: 'relative' }}>
                <pre style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 300, overflowY: 'auto' }}>{asset.content}</pre>
              </div>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: '#065F46', margin: 0 }}><strong>Next step:</strong> {asset.tip}</p>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, background: '#D1FAE5', borderRadius: 6, padding: '2px 10px', flexShrink: 0 }}>+{asset.tipPoints.match(/\d+/)?.[0] || '?'} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!pitchKit && !generating && (
        <div style={{ background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center', marginTop: 20 }}>
          <p style={{ fontSize: 28, margin: '0 0 10px' }}><svg viewBox="0 0 512 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg></p>
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>4 authority assets — ready to publish</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>Press pitch, podcast bio, Wikipedia draft, and LinkedIn About — each optimised for AI citation and ready to paste.</p>
        </div>
      )}
    </div>
  );
}

// ── FEATURE: LINKEDIN AI OPTIMIZER ───────────────────────────────────

function LinkedInOptimizer({ result }: { result: PersonalScanResult }) {
  const [linkedinUrl, setLinkedinUrl]     = useState('');
  const [linkedinData, setLinkedinData]   = useState<LinkedInResult | null>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);

  async function analyze(urlOverride?: string) {
    setLinkedinLoading(true);
    setLinkedinError(null);
    try {
      const res = await fetch('/api/personal-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.name,
          specialty: result.specialty,
          city: result.location,
          linkedinUrl: urlOverride || undefined,
        }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data: LinkedInResult = await res.json();
      setLinkedinData(data);
    } catch (e) {
      setLinkedinError('Analysis failed. Please try again.');
    } finally {
      setLinkedinLoading(false);
    }
  }

  function copyAbout() {
    if (!linkedinData?.optimized_about) return;
    navigator.clipboard.writeText(linkedinData.optimized_about).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>LinkedIn AI Optimization</p>
          <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>Rewrite your LinkedIn profile for AI citation — so ChatGPT, Gemini and Perplexity recommend you</p>
        </div>
        <button
          onClick={() => analyze()}
          className="btn btn-blue"
          disabled={linkedinLoading}
          style={{ background: linkedinLoading ? LGRAY : PURPLE, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: linkedinLoading ? 'not-allowed' : 'pointer' }}
        >
          {linkedinLoading ? 'Analyzing LinkedIn profile…' : linkedinData ? (<>Re-analyze <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>) : (<>Analyze My LinkedIn <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
        </button>
      </div>

      {linkedinError && <p style={{ fontSize: 13, color: RED, marginTop: 12 }}>{linkedinError}</p>}

      {linkedinData && !linkedinData.found && !linkedinLoading && (
        <div style={{ background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 12, padding: '20px', marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>LinkedIn profile not found — add your URL:</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', color: NAVY, background: W, boxSizing: 'border-box' as const }}
            />
            <button
              onClick={() => analyze(linkedinUrl)}
              className="btn btn-blue"
              disabled={!linkedinUrl.trim() || linkedinLoading}
              style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Analyze <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          </div>
        </div>
      )}

      {linkedinData && (
        <div style={{ marginTop: 20 }}>
          {/* Completeness score */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Profile Completeness</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: PURPLE }}>{linkedinData.completeness_score}/100</span>
            </div>
            <div style={{ background: '#F6F6FB', borderRadius: 100, height: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${linkedinData.completeness_score}%`, background: PURPLE, borderRadius: 100, transition: 'width 0.6s ease' }} />
            </div>
            {linkedinData.missing_elements.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {linkedinData.missing_elements.map((el, i) => (
                  <span key={i} style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 100, padding: '3px 10px' }}>{el}</span>
                ))}
              </div>
            )}
          </div>

          {/* Headline comparison */}
          {(linkedinData.current_headline || linkedinData.optimized_headline) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {linkedinData.current_headline && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Current Headline</p>
                  <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: GRAY, lineHeight: 1.6 }}>
                    {linkedinData.current_headline}
                  </div>
                </div>
              )}
              {linkedinData.optimized_headline && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Optimized Headline</p>
                  <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#065F46', lineHeight: 1.6, fontWeight: 600 }}>
                    {linkedinData.optimized_headline}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Optimized about */}
          {linkedinData.optimized_about && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>AI-Optimized About Section</p>
                <button
                  onClick={copyAbout}
                  className="btn btn-line btn-sm"
                  style={{ background: copied ? '#DCFCE7' : BLUE, color: copied ? '#14532D' : '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  {copied ? (<><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy'}
                </button>
              </div>
              <div style={{ background: '#0A0A14', borderRadius: 12, padding: '16px 18px' }}>
                <pre style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 300, overflowY: 'auto' }}>{linkedinData.optimized_about}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FEATURE: LINKEDIN SCORE CARD ──────────────────────────────────────

function LinkedInScoreCard({ result }: { result: PersonalScanResult }) {
  if (result.linkedin_score === null && result.linkedin_gaps.length === 0) return null;

  const score = result.linkedin_score;
  const color = score === null ? LGRAY : score >= 70 ? GREEN : score >= 40 ? AMBER : RED;
  const label = score === null ? 'Not found' : score >= 70 ? 'Well optimized' : score >= 40 ? 'Needs work' : 'Needs attention';

  const DIMENSIONS = [
    { key: 'Headline', pts: 20, desc: 'Specialty + city in headline' },
    { key: 'About', pts: 20, desc: '200+ words with outcomes' },
    { key: 'Experience', pts: 20, desc: 'Employer + achievements' },
    { key: 'Skills', pts: 20, desc: '10+ relevant keywords' },
    { key: 'Activity', pts: 20, desc: 'Regular posts / content' },
  ];

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>LinkedIn AI Optimization Score</p>
          <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>5-dimension analysis of your LinkedIn profile for AI discoverability</p>
        </div>
        {score !== null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 2 }}>/100 · {label}</div>
          </div>
        )}
        {score === null && (
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: LGRAY }}>
            Profile not found — add LinkedIn URL in the optimizer below
          </div>
        )}
      </div>

      {score !== null && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: '#F6F6FB', borderRadius: 100, height: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 100, transition: 'width 0.8s ease' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {DIMENSIONS.map((d, i) => {
              const dimScore = Math.round((score / 100) * d.pts);
              return (
                <div key={d.key} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: LGRAY, marginBottom: 4 }}>{d.key}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: NAVY }}>{dimScore}</div>
                  <div style={{ fontSize: 9, color: LGRAY }}>/ {d.pts}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result.linkedin_gaps.length > 0 && (
        <div style={{ marginBottom: result.linkedin_optimizations.length > 0 ? 16 : 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Gaps to fix</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.linkedin_gaps.map((gap, i) => (
              <span key={i} style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 100, padding: '4px 12px' }}>{gap}</span>
            ))}
          </div>
        </div>
      )}

      {result.linkedin_optimizations.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Quick wins</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.linkedin_optimizations.map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, color: GREEN, flexShrink: 0, marginTop: 1 }}>→</span>
                <p style={{ fontSize: 13, color: NAVY, margin: 0, lineHeight: 1.5 }}>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FEATURE: REPUTATION ALERTS CARD ──────────────────────────────────

function ReputationAlertsCard({ alerts, name }: { alerts: ReputationAlert[]; name: string }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (alerts.length === 0) {
    return (
      <div style={{ background: '#ECFDF5', border: '1.5px solid #6EE7B7', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}><svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></span>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#065F46', margin: 0 }}>No negative AI mentions detected — your reputation looks clean across all platforms.</p>
      </div>
    );
  }

  const criticals = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  return (
    <div style={{ background: '#FEF2F2', border: '2px solid #FCA5A5', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></span>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: RED, margin: 0 }}>AI Reputation Alerts</p>
          <p style={{ fontSize: 12, color: '#7F1D1D', margin: '2px 0 0' }}>
            {criticals.length > 0 && `${criticals.length} critical`}
            {criticals.length > 0 && warnings.length > 0 && ' · '}
            {warnings.length > 0 && `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
            {' '}detected — AI platforms may be surfacing negative information about you.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((alert, i) => (
          <div key={i} style={{ background: W, border: `1.5px solid ${alert.severity === 'critical' ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' as const }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{alert.severity === 'critical' ? <svg viewBox="0 0 512 512" width="14" height="14" fill="#EF4444" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg> : <svg viewBox="0 0 512 512" width="14" height="14" fill="#F59E0B" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>}</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{alert.platform}</span>
                  <span style={{ fontSize: 11, color: LGRAY, marginLeft: 8 }}>{alert.query_type.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, color: LGRAY, fontWeight: 700 }}>{expanded === i ? <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> : <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>}</span>
            </button>
            {expanded === i && (
              <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, marginTop: 12 }}>What it said:</p>
                <div style={{ background: '#FFF7F7', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7F1D1D', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{alert.excerpt}"
                </div>
                <div style={{ marginTop: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400E', margin: '0 0 6px' }}>What to do:</p>
                  <p style={{ fontSize: 12, color: '#78350F', lineHeight: 1.6, margin: 0 }}>Build positive authority signals (Wikipedia, press mentions, Google Knowledge Panel) to dilute this with credible information. Consider publishing a professional bio on your own website and major directories.</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, background: '#FFF1F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: '#991B1B', margin: 0 }}>
          <strong>Action required:</strong> We'll email you if your reputation changes. Run a new scan in 2 weeks to measure progress.
        </p>
      </div>
    </div>
  );
}

// ── FEATURE: REAL PEER COMPARISON ─────────────────────────────────────

function RealPeerComparison({ result }: { result: PersonalScanResult }) {
  const [peerData, setPeerData] = useState<{ competitors: CompetitorResult[]; user_gaps: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPeers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/personal-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.name,
          specialty: result.specialty,
          city: result.location.split(' ')[0] || result.location,
          country: '',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data: PeerComparisonResult = await res.json();
      setPeerData(data);
    } catch {
      setError('Peer analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: peerData ? 20 : 0 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>Real Peer Competitor Analysis</p>
          <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>Find real {result.specialty} peers in your market and see what they have that you don't</p>
        </div>
        <button
          onClick={fetchPeers}
          className="btn btn-blue"
          disabled={loading}
          style={{ background: loading ? LGRAY : NAVY, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        >
          {loading ? 'Finding peers…' : peerData ? (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M48.5 224L40 224c-13.3 0-24-10.7-24-24L16 72c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2L98.6 96.6c87.6-86.5 228.7-86.2 315.8 1c87.5 87.5 87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3c-62.2-62.2-162.7-62.5-225.3-1L185 183c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8L48.5 224z"/></svg>{' '}Refresh Peers</>) : (<>Find Real Peers <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
        </button>
      </div>

      {error && <p style={{ fontSize: 13, color: RED, margin: '12px 0 0' }}>{error}</p>}

      {!peerData && !loading && (
        <div style={{ background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', marginTop: 16 }}>
          <p style={{ fontSize: 24, margin: '0 0 8px' }}><svg viewBox="0 0 512 512" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></p>
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>Discover who you're competing against</p>
          <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>We search healthcare, legal and professional directories to find real {result.specialty} professionals in your area — then show what authority signals give them an edge.</p>
        </div>
      )}

      {peerData && (
        <div>
          {/* User's score row */}
          <div style={{ background: '#F5F3FF', border: '2px solid #DDD6FE', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: PURPLE, margin: 0 }}>{result.name} (You)</p>
                <p style={{ fontSize: 11, color: LGRAY, margin: '2px 0 0' }}>{result.specialty} · {result.location}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: PURPLE, lineHeight: 1 }}>{result.overall_score}</div>
                  <div style={{ fontSize: 10, color: LGRAY }}>AI Score</div>
                </div>
              </div>
            </div>
          </div>

          {/* Peer rows */}
          {peerData.competitors.length === 0 && (
            <p style={{ fontSize: 13, color: LGRAY, textAlign: 'center', padding: '16px 0' }}>No nearby peers found — this could mean you have low competition in your area.</p>
          )}
          {peerData.competitors.map((comp, i) => (
            <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>{comp.name}</p>
                    {comp.source_url && (
                      <a href={comp.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: BLUE, textDecoration: 'none' }}>View profile <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {comp.advantages.map((adv, j) => (
                      <span key={j} style={{ fontSize: 11, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '3px 10px' }}>{adv}</span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: comp.estimated_score > result.overall_score ? RED : GREEN, lineHeight: 1 }}>{comp.estimated_score}</div>
                  <div style={{ fontSize: 10, color: LGRAY }}>est. score</div>
                </div>
              </div>
            </div>
          ))}

          {/* Gaps */}
          {peerData.user_gaps.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E', margin: '0 0 8px' }}>What peers have that you don't:</p>
              <ul style={{ margin: 0, padding: '0 0 0 20px' }}>
                {peerData.user_gaps.map((gap, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#78350F', lineHeight: 1.7 }}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FIX TYPE MAP ──────────────────────────────────────────────────────

const FIX_TYPE_MAP: Record<string, string> = {
  wikipedia:           'wikipedia_stub',
  knowledge_panel:     'knowledge_panel',
  linkedin:            'profile_optimization',
  healthgrades:        'profile_optimization',
  avvo:                'profile_optimization',
  martindale:          'profile_optimization',
  media_bylines:       'press_pitch',
  amazon_author:       'thought_leadership',
  podcast_appearances: 'podcast_pitch',
  super_lawyers:       'profile_optimization',
};

// ── MAIN PAGE ─────────────────────────────────────────────────────────

export default function PersonalBrandPage() {
  const { plan, rawPlan, loading: planLoading, userId, userEmail } = usePlan();
  const isAdmin = isAdminUser(userEmail); // admins always get full personal-brand access
  const [titlePrefix, setTitlePrefix] = useState('');
  const [name, setName]             = useState('');
  const [specialty, setSpecialty]   = useState('');
  const [location, setLocation]     = useState('');

  // Ticket 7: identity-confirm — a personal scan must not silently score an
  // unconfirmed name (the wrong "John Smith", or a firm like "Power Rogers").
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [identityStep, setIdentityStep] = useState<'idle' | 'confirm'>('idle');
  const [identityLinkedinUrl, setIdentityLinkedinUrl] = useState('');
  const [identityLinkedin, setIdentityLinkedin] = useState<{ found: boolean; profile_url: string | null; headline: string } | null>(null);
  const [identityLinkedinLoading, setIdentityLinkedinLoading] = useState(false);
  const [scanAnywayChecked, setScanAnywayChecked] = useState(false);
  const [region, setRegion]         = useState('');
  const [country, setCountry]       = useState('US');
  const [scanning, setScanning]     = useState(false);
  const [result, setResult]         = useState<PersonalScanResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [fixes, setFixes]           = useState<Record<string, { content: string; instructions: string; impact: string }>>({});
  const [fixErrors, setFixErrors]     = useState<Record<string, string>>({});
  const [timelineFixError, setTimelineFixError] = useState<string | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);
  const [copyError, setCopyError]   = useState<string | null>(null);

  // Feature 2 state
  const [snapshots, setSnapshots]   = useState<AuthoritySnapshot[]>([]);
  // b8a1: distinguishes "loaded, genuinely none" (show the empty state)
  // from "not loaded yet" — the page had NO empty state at all.
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);


  // Read country from cookie (same pattern as pricing page)
  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    if (match) setCountry(match.split('=')[1]);
  }, []);

  // Load snapshots on mount — silently skip if table doesn't exist yet
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('personal_authority_snapshots')
          .select('*')
          .eq('user_id', userId)
          .order('scan_date', { ascending: true })
          .limit(20);
        if (error) {
          console.warn('personal_authority_snapshots not available yet:', error.message);
          setSnapshotsLoaded(true);
          return;
        }
        if (data) setSnapshots(data as AuthoritySnapshot[]);
        setSnapshotsLoaded(true);
      } catch (e) {
        console.warn('snapshots load skipped:', e);
        setSnapshotsLoaded(true);
      }
    })();
  }, [userId]);

  const [showUpgrade, setShowUpgrade] = useState(false);
  useEffect(() => {
    if (planLoading || isAdmin || isStarterPlan(plan)) return;
    const t = setTimeout(() => setShowUpgrade(true), 5000);
    return () => clearTimeout(t);
  }, [planLoading, plan, isAdmin]);

  // b8a1: signed-out visitors get a sign-in gate before any plan gate —
  // the PlanGuard pitch ("available on Personal Brand and above") was
  // the first thing an anonymous visitor saw.
  if (!planLoading && !userId) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>
        <div style={{ maxWidth: 440, margin: '80px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, margin: '0 0 10px' }}>Personal Brand AI Visibility</h1>
          <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, margin: '0 0 22px' }}>
            Sign in to scan your personal brand. Your results are tied to your account — sign in to continue, or run a free scan to get your first score.
          </p>
          <a href="/login?next=/dashboard/personal-brand" style={{ display: 'inline-block', background: PURPLE, color: '#fff', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (showUpgrade && !planLoading && !isAdmin && !isStarterPlan(plan)) {
    return (
      <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn-sm{min-height:32px;padding:0 12px;font-size:12px;border-radius:8px}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1.5px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}.btn-ghost:hover{background:#F6F6FB}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

        <UpgradePrompt requiredPlan="personal_pro" feature="Personal Brand AI Visibility" upgradeParam="personal_pro" />
      </div>
    );
  }

  // Identity confidence from what the user provided (Ticket 7). This is about
  // WHO the scan describes — separate from the scan's score confidence.
  function assessIdentity() {
    const basis: string[] = [];
    const hasTitle = !!titlePrefix;
    const hasSpecialty = !!specialty.trim();
    const hasCity = !!location.trim();
    if (hasTitle) basis.push(`Title provided (${titlePrefix})`);
    if (hasSpecialty) basis.push(`Specialty provided (${specialty.trim()})`);
    if (hasCity) basis.push(`City provided (${location.trim()})`);
    if (identityLinkedin) {
      if (identityLinkedin.found) basis.push(`LinkedIn profile found${identityLinkedin.headline ? `: ${identityLinkedin.headline}` : ''}`);
      else basis.push('LinkedIn profile not found or not scrapable');
    } else if (identityLinkedinUrl.trim()) {
      basis.push('LinkedIn URL provided — look it up to confirm the match');
    }
    const words = name.trim().split(/\s+/).filter(Boolean);
    const bareCommonName = words.length === 2 && !hasTitle && !hasSpecialty && !hasCity && !identityLinkedinUrl.trim();
    if (bareCommonName) basis.push('Common-name risk: two-word name with no specialty, city, or LinkedIn to disambiguate');
    let confidence: 'high' | 'medium' | 'low';
    if (identityLinkedin?.found && identityLinkedinUrl.trim()) confidence = 'high';
    else if ((hasSpecialty && hasCity) || hasTitle) confidence = 'medium';
    else confidence = 'low';
    return { confidence, basis, bareCommonName };
  }

  async function lookupIdentityLinkedin() {
    if (!identityLinkedinUrl.trim() || !name.trim()) return;
    setIdentityLinkedinLoading(true);
    try {
      const res = await fetch('/api/personal-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), specialty: specialty.trim(), city: location.trim(), linkedinUrl: identityLinkedinUrl.trim() }),
      });
      if (!res.ok) throw new Error('Lookup failed');
      const data = await res.json();
      setIdentityLinkedin({ found: !!data.found, profile_url: data.profile_url ?? null, headline: data.current_headline || '' });
    } catch {
      setIdentityLinkedin({ found: false, profile_url: identityLinkedinUrl.trim(), headline: '' });
    } finally {
      setIdentityLinkedinLoading(false);
    }
  }

  async function runScan(confirmed = false) {
    if (!name.trim()) { setError('Please enter your name'); return; }
    // Ticket 7: identity-confirm gate — never silently score an unconfirmed name.
    if (!confirmed && !identityConfirmed) { setIdentityStep('confirm'); return; }
    const identity = assessIdentity();
    const fullName = [titlePrefix, name.trim()].filter(Boolean).join(' ');
    const queryAssembled = [fullName, specialty.trim(), location.trim()].filter(Boolean).join(' ');
    console.log('PERSONAL SCAN STARTED:', { fullName, specialty, city: location, query: queryAssembled });
    setScanning(true);
    setError(null);
    setResult(null);
    setFixes({});
    try {
      const res = await fetch('/api/scan-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, specialty: specialty.trim(), location: location.trim(), region: region.trim(), state: region.trim(), country, userId, requireConfirm: true, identityConfirmed: true, identityConfidence: identity.confidence, identityBasis: identity.basis, linkedinUrl: identityLinkedinUrl.trim() || undefined }),
      });
      console.log('PERSONAL SCAN RESPONSE:', res.status, res.ok);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { message?: string; error?: string }).message || errData.error || `Server error ${res.status}`);
      }
      const data: PersonalScanResult = await res.json();
      console.log('PERSONAL SCAN RESULT:', { score: data.overall_score, platforms: data.query_results?.length });
      setResult(data);
    // Reload snapshots after new scan — silently skip if table doesn't exist yet
      if (userId) {
        try {
          const { data: snaps, error: snapErr } = await supabase
            .from('personal_authority_snapshots')
            .select('*')
            .eq('user_id', userId)
            .order('scan_date', { ascending: true })
            .limit(20);
          if (!snapErr && snaps) setSnapshots(snaps as AuthoritySnapshot[]);
        } catch { /* table may not exist yet */ }
      }
    } catch (e) {
      console.error('PERSONAL SCAN ERROR:', e);
      setError(e instanceof Error ? e.message : 'Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  }

  async function generateFix(signalKey: string) {
    if (!result) return;
    const fixType = FIX_TYPE_MAP[signalKey] || 'profile_optimization';
    setGenerating(signalKey);
    setFixErrors(prev => {
      const next = { ...prev };
      delete next[signalKey];
      return next;
    });
    try {
      const res = await fetch('/api/personal-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix_type: fixType, name: result.name, specialty: result.specialty, location: result.location }),
      });
      const data = await res.json().catch(() => ({}));
      // NOTE: this API returns { generated_content, ... } with no `success`
      // field — success is "HTTP ok + content present", not data.success.
      if (!res.ok || data.error || !data.generated_content) {
        setFixErrors(prev => ({ ...prev, [signalKey]: data.error || 'Could not generate this fix. Please try again.' }));
      } else {
        setFixes(prev => ({ ...prev, [signalKey]: { content: data.generated_content, instructions: data.instructions, impact: data.expected_impact } }));
      }
    } catch {
      setFixErrors(prev => ({ ...prev, [signalKey]: 'Could not generate this fix. Please check your connection and try again.' }));
    } finally {
      setGenerating(null);
    }
  }

  function copy(key: string, text: string) {
    // Only show "Copied!" after the write actually succeeds.
    setCopyError(null);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {
      setCopyError(key);
    });
  }

  const presentSignals = result?.trust_signals.filter(s => s.exists) ?? [];
  const missingSignals = result?.trust_signals.filter(s => !s.exists) ?? [];

  return (
    <PlanPageGuard feature="canSeePersonalBrand" requiredPlan="personal_pro">
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn-sm{min-height:32px;padding:0 12px;font-size:12px;border-radius:8px}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1.5px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}.btn-ghost:hover{background:#F6F6FB}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <header className="pagehead" style={{ marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Personal Brand</p>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: NAVY, letterSpacing: '-0.035em', margin: 0 }}>Personal Brand AI Visibility</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: '6px 0 0' }}>Does AI recommend you by name? Scan across all 12 platforms and 5 query types.</p>
          </div>
        </header>

        {/* b8a1: admin-view note (b8af pattern) — admins bypass the
            Personal Brand gate; on a Free account that read as a gate
            contradiction. Say which it is. */}
        {normalizePlan(plan) !== normalizePlan(rawPlan) && (
          <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: NAVY, lineHeight: 1.5 }}>
            <strong>Admin view:</strong> this account&apos;s plan is {getPlanConfig(rawPlan).displayName} — Personal Brand is gated for {getPlanConfig(rawPlan).displayName} accounts. You see it because admins get full access.
          </div>
        )}

        {/* b8a1: explicit empty state — with no personal scans the page
            previously showed only the blank form, saying nothing. */}
        {snapshotsLoaded && snapshots.length === 0 && !result && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '16px 20px', marginBottom: 24, fontSize: 13.5, color: GRAY, lineHeight: 1.6 }}>
            <strong style={{ color: NAVY }}>No personal-brand scans yet.</strong> Run your first scan below — your AI name-recognition score, timeline, and fix list will appear here once it completes.
          </div>
        )}

        {/* Scan input */}
        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 28 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Scan your personal brand</p>
          {(() => {
            const PLACEHOLDERS: Record<string, { name: string; spec: string; city: string; region: string }> = {
              GB: { name: 'Dr. Sarah Johnson', spec: 'cardiologist', city: 'London',     region: 'England'         },
              IN: { name: 'Dr. Priya Sharma',  spec: 'cardiologist', city: 'Mumbai',     region: 'Maharashtra'     },
              AU: { name: 'Dr. James Wilson',  spec: 'lawyer',       city: 'Sydney',     region: 'New South Wales' },
              CA: { name: 'Dr. Emily Chen',    spec: 'cardiologist', city: 'Toronto',    region: 'Ontario'         },
              IE: { name: 'Dr. Aoife Murphy',  spec: 'solicitor',    city: 'Dublin',     region: 'Leinster'        },
              NZ: { name: 'Dr. Liam Williams', spec: 'cardiologist', city: 'Auckland',   region: 'North Island'    },
              SG: { name: 'Dr. Wei Lim',       spec: 'cardiologist', city: 'Singapore',  region: 'Central Region'  },
              AE: { name: 'Dr. Omar Hassan',   spec: 'cardiologist', city: 'Dubai',      region: 'Dubai'           },
              ZA: { name: 'Dr. Thabo Nkosi',   spec: 'cardiologist', city: 'Cape Town',  region: 'Western Cape'    },
              NG: { name: 'Dr. Chidi Okafor',  spec: 'cardiologist', city: 'Lagos',      region: 'Lagos State'     },
              KE: { name: 'Dr. Amani Otieno',  spec: 'cardiologist', city: 'Nairobi',    region: 'Nairobi County'  },
              GH: { name: 'Dr. Kwame Mensah',  spec: 'cardiologist', city: 'Accra',      region: 'Greater Accra'   },
              PH: { name: 'Dr. Jose Reyes',    spec: 'cardiologist', city: 'Manila',     region: 'Metro Manila'    },
            };
            const ph = PLACEHOLDERS[country] || { name: 'Dr. Jane Smith', spec: 'cardiologist', city: 'Chicago', region: 'Illinois' };
            return (
              <div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 2fr 2fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>TITLE</label>
                  <select value={titlePrefix} onChange={e => setTitlePrefix(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }}>
                    <option value="">None</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Prof.">Prof.</option>
                  </select>
                </div>
                <div>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>FULL NAME</label>
                  <input value={name} onChange={e => { setName(e.target.value); setIdentityConfirmed(false); setIdentityStep('idle'); }} placeholder={ph.name} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>SPECIALTY</label>
                  <input value={specialty} onChange={e => { setSpecialty(e.target.value); setIdentityConfirmed(false); setIdentityStep('idle'); }} placeholder="Cardiologist, Immigration Lawyer..." style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>CITY</label>
                  <input value={location} onChange={e => { setLocation(e.target.value); setIdentityConfirmed(false); setIdentityStep('idle'); }} placeholder={ph.city} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>STATE / REGION</label>
                  <input value={region} onChange={e => setRegion(e.target.value)} placeholder={ph.region} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="lbl" style={{ fontSize: 11, fontWeight: 700, color: LGRAY, display: 'block', marginBottom: 6 }}>COUNTRY</label>
                  <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: NAVY, background: BG, boxSizing: 'border-box' as const }}>
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="AU">Australia</option>
                    <option value="CA">Canada</option>
                    <option value="IE">Ireland</option>
                    <option value="NZ">New Zealand</option>
                    <option value="SG">Singapore</option>
                    <option value="AE">UAE</option>
                    <option value="ZA">South Africa</option>
                    <option value="NG">Nigeria</option>
                    <option value="KE">Kenya</option>
                    <option value="GH">Ghana</option>
                    <option value="IN">India</option>
                    <option value="PH">Philippines</option>
                  </select>
                </div>
              </div>
              </div>
            );
          })()}
          <button onClick={() => runScan()} disabled={scanning} className="btn btn-blue" style={{ background: scanning ? LGRAY : PURPLE, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: scanning ? 'not-allowed' : 'pointer' }}>
            {scanning ? 'Scanning 12 platforms…' : (<>Scan My Personal Brand <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
          </button>

          {/* Ticket 7: identity-confirm — "Is this you?" before any score is shown */}
          {identityStep === 'confirm' && (() => {
            const assessment = assessIdentity();
            const lowNoLinkedin = assessment.confidence === 'low' && !identityLinkedinUrl.trim();
            const confColor = assessment.confidence === 'high' ? '#0B6B37' : assessment.confidence === 'medium' ? '#D97706' : RED;
            const confLabel = assessment.confidence === 'high' ? 'High identity confidence' : assessment.confidence === 'medium' ? 'Medium identity confidence' : 'Low identity confidence';
            return (
              <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Is this you?</p>
                <p style={{ fontSize: 13, color: GRAY, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Confirm the identity below before we score it. A wrong match means the score describes someone else — or a business, not a person.
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>{[titlePrefix, name.trim()].filter(Boolean).join(' ')}{specialty.trim() ? ` — ${specialty.trim()}` : ''}{location.trim() ? ` · ${location.trim()}` : ''}</p>
                {identityLinkedin?.found && identityLinkedin.profile_url && (
                  <p style={{ fontSize: 13, color: GRAY, margin: '0 0 8px' }}>LinkedIn: <a href={identityLinkedin.profile_url} target="_blank" rel="noreferrer" style={{ color: PURPLE }}>{identityLinkedin.headline || identityLinkedin.profile_url}</a></p>
                )}
                <p style={{ fontSize: 12, fontWeight: 800, color: confColor, margin: '8px 0 4px' }}>{confLabel}</p>
                <ul style={{ fontSize: 12, color: GRAY, margin: '0 0 12px', paddingLeft: 16 }}>
                  {assessment.basis.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={identityLinkedinUrl} onChange={e => { setIdentityLinkedinUrl(e.target.value); setIdentityLinkedin(null); setIdentityConfirmed(false); }} placeholder="LinkedIn URL (optional, raises confidence)" style={{ flex: '1 1 240px', padding: '10px 14px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: NAVY, background: W, boxSizing: 'border-box' as const }} />
                  <button onClick={lookupIdentityLinkedin} disabled={!identityLinkedinUrl.trim() || identityLinkedinLoading} className="btn btn-line" style={{ background: identityLinkedinLoading ? LGRAY : NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: identityLinkedinLoading ? 'not-allowed' : 'pointer' }}>
                    {identityLinkedinLoading ? 'Looking up…' : 'Look up LinkedIn'}
                  </button>
                </div>
                {lowNoLinkedin && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#92400E', marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={scanAnywayChecked} onChange={e => setScanAnywayChecked(e.target.checked)} style={{ marginTop: 2 }} />
                    I understand this may score the wrong person — scan anyway.
                  </label>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button onClick={() => { setIdentityConfirmed(true); setIdentityStep('idle'); runScan(true); }} disabled={lowNoLinkedin && !scanAnywayChecked} className="btn btn-blue" style={{ background: lowNoLinkedin && !scanAnywayChecked ? LGRAY : PURPLE, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: lowNoLinkedin && !scanAnywayChecked ? 'not-allowed' : 'pointer' }}>
                    {lowNoLinkedin ? 'Scan anyway' : 'Yes, this is me — run scan'}
                  </button>
                  <button onClick={() => setIdentityStep('idle')} className="btn btn-ghost" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, color: GRAY, cursor: 'pointer' }}>
                    Not me — edit details
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ color: RED, fontSize: 14, fontWeight: 600, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Authority Timeline always shown if snapshots exist */}
        {snapshots.length > 0 && !result && (
          <AuthorityTimeline snapshots={snapshots} onFix={() => {
            // Pre-scan: no fix context yet — send the user to the fix engine.
            window.location.href = '/dashboard/fix';
          }} />
        )}

        {result && (
          <>
            {/* Link to full report */}
            {result.scan_id && (
              <div style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13, color: PURPLE, fontWeight: 600, margin: 0 }}>Full personal brand report available</p>
                <a href={`/report/${result.scan_id}`} style={{ background: PURPLE, color: '#fff', padding: '8px 18px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>View Full Report <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            )}
            {/* Low recognition warning */}
            {result.low_recognition && (
              <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#92400E', margin: '0 0 8px' }}><svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Low AI Recognition Detected</p>
                <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.6, margin: 0 }}>
                  AI platforms do not currently recognize this name. Your score reflects how much work is needed to build AI visibility from scratch. This is actually a great time to start — use the fixes below to build your AI presence before your competitors do.
                </p>
              </div>
            )}

            {/* Confidence banner — how sure are we this is the right person */}
            {!result.low_recognition && result.confidence_level && (
              <div style={{
                background: result.confidence_level === 'high' ? '#ECFDF5' : result.confidence_level === 'medium' ? '#FFFBEB' : '#ECEBFF',
                border: `1.5px solid ${result.confidence_level === 'high' ? '#6EE7B7' : result.confidence_level === 'medium' ? '#FCD34D' : '#93C5FD'}`,
                borderRadius: 14, padding: '14px 20px', marginBottom: 20,
              }}>
                <p style={{
                  fontSize: 13, fontWeight: 600, lineHeight: 1.5, margin: 0,
                  color: result.confidence_level === 'high' ? '#065F46' : result.confidence_level === 'medium' ? '#92400E' : '#1E40AF',
                }}>
                  {result.confidence_level === 'high' ? (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>{' '}</>) : result.confidence_level === 'medium' ? (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M448 256c0-106-86-192-192-192l0 384c106 0 192-86 192-192zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg>{' '}</>) : (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>{' '}</>)}
                  {result.confidence_message}
                </p>
              </div>
            )}

            {/* FEATURE: Reputation Alerts */}
            <ReputationAlertsCard alerts={result.reputation_alerts ?? []} name={result.name} />

            {/* FEATURE: LinkedIn AI Score Card */}
            <LinkedInScoreCard result={result} />

            {/* Score overview */}
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
                <ScoreRing score={result.overall_score} label="Personal AI Visibility" size="lg" color={PURPLE} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Does AI recommend you by name?</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, color: PURPLE }}>{result.name_recognition_rate}%</span>
                    <span style={{ fontSize: 14, color: LGRAY }}>name recognition</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[{ label: 'Recommendation rate', val: result.recommendation_rate }, { label: 'Authority citations', val: result.authority_citation_rate }, { label: 'Positive sentiment', val: result.positive_sentiment_rate }].map(m => (
                      <div key={m.label} style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '6px 12px' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: PURPLE, margin: 0 }}>{m.label}</p>
                        <p style={{ fontSize: 16, fontWeight: 900, color: NAVY, margin: 0 }}>{m.val}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* FEATURE 1: Recommendation Share Grid */}
            <RecommendationShareGrid result={result} />

            {/* Query type breakdown */}
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 20 }}>5 Query Type Breakdown</p>
              {result.query_results.map(qr => <QueryBar key={qr.query_type} qr={qr} />)}
            </div>

            {/* Gap narrative */}
            {result.gap_narrative && (
              <div style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>AI Diagnosis</p>
                <p style={{ fontSize: 14, color: NAVY, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{result.gap_narrative}</p>
              </div>
            )}

            {/* Trust signals */}
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>Authority Signal Checklist</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> {presentSignals.length} present</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: RED }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg> {missingSignals.length} missing</span>
                </div>
              </div>
              {result.trust_signals.map(signal => (
                <div key={signal.key}>
                  <TrustSignalRow signal={signal} onFix={generateFix} />
                  {generating === signal.key && <div style={{ padding: '12px 0', color: LGRAY, fontSize: 13 }}>Generating fix with Opus 4.8…</div>}
                  {fixErrors[signal.key] && (
                    <p style={{ fontSize: 13, color: RED, margin: '8px 0' }}>{fixErrors[signal.key]}</p>
                  )}
                  {fixes[signal.key] && (
                    <div style={{ background: '#0A0A14', borderRadius: 12, padding: '16px 18px', margin: '10px 0 16px', position: 'relative' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Generated fix</p>
                      <pre style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{fixes[signal.key].content}</pre>
                      <div style={{ marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Instructions</p>
                        <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{fixes[signal.key].instructions}</p>
                      </div>
                      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(27,23,255,0.15)', borderRadius: 8 }}>
                        <p style={{ fontSize: 11, color: '#93C5FD', margin: 0 }}>{fixes[signal.key].impact}</p>
                      </div>
                      <button onClick={() => copy(signal.key, fixes[signal.key].content)} className="btn btn-line btn-sm" style={{ position: 'absolute', top: 14, right: 14, background: copied === signal.key ? GREEN : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                        {copied === signal.key ? 'Copied!' : 'Copy'}
                      </button>
                      {copyError === signal.key && (
                        <p style={{ fontSize: 12, color: '#FCA5A5', margin: '8px 0 0' }}>Copy failed — your browser blocked clipboard access. Select the text and copy it manually.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* FEATURE 2: Authority Timeline */}
            <AuthorityTimeline snapshots={snapshots} onFix={async (fixType) => {
              setGenerating(fixType);
              setTimelineFixError(null);
              try {
                const res = await fetch('/api/personal-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fix_type: fixType, name: result.name, specialty: result.specialty, location: result.location }),
                });
                const data = await res.json().catch(() => ({}));
                // NOTE: this API returns { generated_content, ... } with no
                // `success` field — success is "HTTP ok + content present".
                if (!res.ok || data.error || !data.generated_content) {
                  setTimelineFixError(data.error || 'Could not generate this fix. Please try again.');
                } else {
                  setFixes(prev => ({ ...prev, [fixType]: { content: data.generated_content, instructions: data.instructions, impact: data.expected_impact } }));
                }
              } catch {
                setTimelineFixError('Could not generate this fix. Please check your connection and try again.');
              } finally {
                setGenerating(null);
              }
            }} />
            {timelineFixError && (
              <p style={{ fontSize: 13, color: RED, margin: '8px 0 0' }}>{timelineFixError}</p>
            )}

            {/* FEATURE: Real Peer Competitor Comparison */}
            <RealPeerComparison result={result} />

            {/* FEATURE 4: AI Pitch Kit */}
            <PitchKitSection result={result} />

            {/* FEATURE: LinkedIn AI Optimization */}
            <LinkedInOptimizer result={result} />

            {/* Platform matrix table */}
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px' }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 16 }}>Platform-by-Platform Results</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: LGRAY, fontWeight: 700, fontSize: 11 }}>Platform</th>
                      {result.query_results.map(qr => (
                        <th key={qr.query_type} style={{ textAlign: 'center', padding: '8px 8px', color: LGRAY, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>
                          {QUERY_LABELS[qr.query_type].split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FULL_PLATFORMS.map(platform => (
                      <tr key={platform} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: NAVY }}>{platform}</td>
                        {result.query_results.map(qr => {
                          const detail = qr.platform_details.find(p => p.platform === platform);
                          const cell = detail?.mentioned ? (detail.recommended ? <svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg> : <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>) : '—';
                          const cellColor = detail?.mentioned ? (detail.recommended ? AMBER : GREEN) : LGRAY;
                          return (
                            <td key={qr.query_type} style={{ textAlign: 'center', padding: '8px', color: cellColor, fontWeight: detail?.mentioned ? 700 : 400 }}>{cell}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: LGRAY, marginTop: 12 }}><svg viewBox="0 0 576 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg> = Recommended by name · <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> = Mentioned · — = Not found</p>
            </div>
          </>
        )}
      </div>
    </div>
    </PlanPageGuard>
  );
}
