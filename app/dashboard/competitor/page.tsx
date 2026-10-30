'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { Geist, Geist_Mono } from 'next/font/google';
import { trustFixGainPoints } from '@/lib/trust';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { usePlan } from '@/lib/usePlan';
const supabase = getBrowserClient();

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const GREEN_BG = '#E3F6EC';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const RED_BG = '#FDECEC';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const PURPLE = '#7C3AED'; // agency accent — trust tiles / breadcrumb

const scoreCol = (s: number) => s >= 70 ? GREEN : s >= 40 ? AMBER : RED;

interface TrustSignal {
  name: string;
  status: 'good' | 'warning' | 'danger' | 'missing';
  impact: 'high' | 'medium' | 'low';
  value: string;
  pointsImpact?: number;
}

interface TrustSignalReport {
  technical: TrustSignal[];
  directory: TrustSignal[];
  reviews: TrustSignal[];
  community: TrustSignal[];
  // ax88: present on scans saved after this change; older scans omit it.
  aiPlatforms?: TrustSignal[];
  overall: number;
}

interface GoogleData {
  reviewCount: number | null;
  rating: number | null;
  claimed: boolean;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  photos: number | null;
  category: string | null;
}

interface CompetitorResult {
  name: string;
  industry: string;
  score: number;
  mentionedCount: number;
  citationSources: string[];
  platformMentions: string[];
  trustSignals: TrustSignalReport;
  google: GoogleData | null;
  reddit: { mentionCount: number; topSubreddits: string[]; sentiment: string | null } | null;
}

interface LastScan {
  input: string;
  user_business_name: string | null;
  competitor_name: string | null;
  overall_score: number;
  mentioned_count: number;
  citation_sources: string[];
  trust_signals: TrustSignalReport | null;
  industry: string;
  location: string;
  created_at: string;
}

// 12 active platforms — Meta AI is Coming Soon (no public API) and is not scanned.
const PLATFORMS_ALL = ['ChatGPT','Gemini','Google AI','Copilot','Perplexity','Grok','Claude','DeepSeek','Mistral','Kimi','Groq','Meta AI'];

interface CompetitorHistory {
  id: string;
  competitor_name: string;
  competitor_score: number;
  competitor_trust_score: number;
  competitor_platforms_count: number;
  scanned_at: string;
  scan_id: string | null;
  // Your AI-coverage score AT THE TIME of this snapshot (from the linked
  // rankall_scans row's mentioned_count). Null when the scan is gone.
  your_score: number | null;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : pts[i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function CompetitorHistorySection({ history }: { history: CompetitorHistory[] }) {
  const VW = 600, VH = 160;
  const PL = 36, PR = 16, PT = 12, PB = 28;
  const CW = VW - PL - PR;
  const CH = VH - PT - PB;

  const yPos = (score: number) => PT + CH - (Math.max(0, Math.min(100, score)) / 100) * CH;
  const xPos = (i: number, n: number) => n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW;

  const pts = history.map((h, i) => ({ x: xPos(i, history.length), y: yPos(h.competitor_trust_score) }));
  const path = smoothPath(pts);
  const fill = pts.length > 1 ? `${path} L ${pts[pts.length - 1].x} ${PT + CH} L ${pts[0].x} ${PT + CH} Z` : '';

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const latest = history[history.length - 1];
  const earliest = history[0];
  const delta = latest.competitor_trust_score - earliest.competitor_trust_score;

  return (
    <div className="dash-card" style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(10,10,20,0.04)', marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Competitor History</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{latest.competitor_name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '10px 16px' }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: RED, margin: 0, lineHeight: 1 }}>{latest.competitor_trust_score}</p>
            <p style={{ fontSize: 11, color: LGRAY, margin: '3px 0 0' }}>Current trust</p>
          </div>
          <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '10px 16px' }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: delta > 0 ? RED : GREEN, margin: 0, lineHeight: 1 }}>{delta >= 0 ? '+' : ''}{delta}</p>
            <p style={{ fontSize: 11, color: LGRAY, margin: '3px 0 0' }}>Since first scan</p>
          </div>
          <div style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '10px 16px' }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: BLUE, margin: 0, lineHeight: 1 }}>{history.length}</p>
            <p style={{ fontSize: 11, color: LGRAY, margin: '3px 0 0' }}>Scans</p>
          </div>
        </div>
      </div>

      {history.length === 1 ? (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: BLUE, fontWeight: 600 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg> Rescan anytime to track their progress</p>
        </div>
      ) : (
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block', marginBottom: 20 }}>
          {/* Grid */}
          {[0, 25, 50, 75, 100].map(g => (
            <g key={g}>
              <line x1={PL} y1={yPos(g)} x2={PL + CW} y2={yPos(g)} stroke={BORDER} strokeWidth={g === 0 ? 1.5 : 1} strokeDasharray={g === 0 ? undefined : '3 3'} />
              <text x={PL - 6} y={yPos(g) + 4} textAnchor="end" fontSize={9} fill={LGRAY}>{g}</text>
            </g>
          ))}
          {/* Fill */}
          {fill && <path d={fill} fill={RED} fillOpacity={0.07} />}
          {/* Line */}
          {pts.length > 1 && <path d={path} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {/* Dots */}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={RED} stroke="#fff" strokeWidth={1.5} />
          ))}
          {/* X-axis labels */}
          {history.map((h, i) => {
            if (history.length > 8 && i % Math.ceil(history.length / 8) !== 0 && i !== history.length - 1) return null;
            return <text key={i} x={xPos(i, history.length)} y={VH - 4} textAnchor="middle" fontSize={9} fill={LGRAY}>{fmtDate(h.scanned_at)}</text>;
          })}
        </svg>
      )}

      {/* History table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', background: BG, padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
          {['Date', 'Their Trust', 'Their Score', 'Your Score', 'Gap'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {[...history].reverse().slice(0, 10).map((row, i) => {
          // ax8r: "Your Score" used to show TODAY's score in every historical
          // row (and the gap was computed against it). Each row now uses its
          // own snapshot-time score, joined from its linked scan.
          const yourScore = row.your_score;
          const gap = yourScore != null ? Math.round(row.competitor_score - yourScore) : null;
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', padding: '11px 14px', borderBottom: i < Math.min(history.length, 10) - 1 ? `1px solid ${BORDER}` : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: GRAY }}>{fmtDate(row.scanned_at)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: scoreCol(row.competitor_trust_score) }}>{row.competitor_trust_score}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: scoreCol(row.competitor_score) }}>{Math.round(row.competitor_score)}/100</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: yourScore != null ? scoreCol(yourScore) : LGRAY }}>{yourScore != null ? `${Math.round(yourScore)}/100` : '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: gap == null ? LGRAY : gap > 0 ? RED : gap < 0 ? GREEN : GRAY }}>
                {gap == null ? '—' : gap > 0 ? `+${gap} pts ahead` : gap < 0 ? `You lead by ${-gap}` : 'Tied'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CompetitorPage() {
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [userId, setUserId]     = useState<string>('');
  const [scanId, setScanId]     = useState<string>('');
  const [competitorInput, setCompetitorInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState<CompetitorResult | null>(null);
  const [gaps, setGaps]         = useState<string[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [history, setHistory]   = useState<CompetitorHistory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  // b89p: session + plan state for the gates below — the page had
  // neither, so logged-out visitors fell into the "No competitor
  // data yet" empty state and Free accounts got the full page,
  // contradicting the plan config (canSeeCompetitors is Business+)
  // and the competitor_scan usage limit (0 on Free — the Deep Scan
  // API already refuses with a 429 + upgrade URL).
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { plan, rawPlan } = usePlan();

  // ax8r: join each competitor snapshot to its scan to recover YOUR score at
  // snapshot time. competitor_scans has no your_score column, so the old code
  // rendered today's score in every historical row.
  async function attachUserScores(rows: CompetitorHistory[]): Promise<CompetitorHistory[]> {
    const scanIds = rows.map(r => r.scan_id).filter(Boolean) as string[];
    if (scanIds.length === 0) return rows.map(r => ({ ...r, your_score: null }));
    const { data: scans } = await supabase
      .from('rankall_scans')
      .select('id, mentioned_count')
      .in('id', scanIds);
    const byId = new Map(((scans || []) as any[]).map((r: any) => [
      r.id,
      Math.round(((r.mentioned_count ?? 0) / PLATFORMS_ALL.length) * 100),
    ]));
    return rows.map(r => ({ ...r, your_score: r.scan_id ? (byId.get(r.scan_id) ?? null) : null }));
  }

  async function loadLastScan() {
    setLoadError(false);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);
      setUserId(session.user.id);

      // Prefer the most recent scan that actually HAS a detected competitor, so
      // the page doesn't key off a newer scan with no competitor data. Fall back
      // to the latest scan overall so manual competitor entry still works.
      const scanSelect = 'id, input, user_business_name, competitor_name, overall_score, mentioned_count, citation_sources, trust_signals, industry, location, created_at';
      let { data } = await supabase
        .from('rankall_scans')
        .select(scanSelect)
        .eq('user_id', session.user.id)
        .not('competitor_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) {
        const fallback = await supabase
          .from('rankall_scans')
          .select(scanSelect)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = fallback.data;
      }
      if (data) {
        setLastScan(data);
        setScanId(data.id);
        if (data.competitor_name) setCompetitorInput(data.competitor_name);
      }

      // Load competitor scan history — scoped to THIS scan's detected competitor.
      // competitor_scans spans every business the user has ever scanned, so
      // without this filter an unrelated old competitor (e.g. a plumbing scan)
      // would show under the current (e.g. dental) business.
      let histQuery = supabase
        .from('competitor_scans')
        .select('id, competitor_name, competitor_score, competitor_trust_score, competitor_platforms_count, scanned_at, scan_id')
        .eq('user_id', session.user.id)
        .order('scanned_at', { ascending: true })
        .limit(30);
      if (data?.competitor_name) histQuery = histQuery.eq('competitor_name', data.competitor_name);
      const { data: hist } = await histQuery;
      setHistory(await attachUserScores((hist || []) as CompetitorHistory[]));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLastScan();
  }, []);

  async function runScan(name: string) {
    if (!name.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setGaps([]);
    try {
      const res = await fetch('/api/competitor-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitorName: name.trim(),
          industry: lastScan?.industry,
          location: lastScan?.location,
          userBusinessInput: lastScan?.input,
          userTrustSignals: lastScan?.trust_signals,
          userCitationSources: lastScan?.citation_sources,
          userMentionedCount: lastScan?.mentioned_count,
          userId: userId || undefined,
          scanId: scanId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setResult(data.competitor);
      setGaps(data.comparison?.gaps || []);

      // Refresh history after scan
      if (userId) {
        // Show the just-scanned competitor's history (scoped by name), not every
        // competitor the user has ever scanned across all businesses.
        const { data: hist } = await supabase
          .from('competitor_scans')
          .select('id, competitor_name, competitor_score, competitor_trust_score, competitor_platforms_count, scanned_at, scan_id')
          .eq('user_id', userId)
          .eq('competitor_name', name.trim())
          .order('scanned_at', { ascending: true })
          .limit(30);
        setHistory(await attachUserScores((hist || []) as CompetitorHistory[]));
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed');
    }
    setScanning(false);
  }

  // ax8r: coverage uses PLATFORMS_ALL.length (12 active platforms incl. Meta AI) — never a hardcoded denominator.
  const userScore = lastScan ? Math.round((lastScan.mentioned_count / PLATFORMS_ALL.length) * 100) : 0;
  const userTrust = lastScan?.trust_signals?.overall ?? 0;
  const scanDate = lastScan?.created_at ? new Date(lastScan.created_at) : null;
  const isStale = scanDate ? (Date.now() - scanDate.getTime()) > 30 * 24 * 60 * 60 * 1000 : false;
  const compTrust = result?.trustSignals?.overall ?? 0;

  if (loading) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: GRAY }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTop: `3px solid ${BLUE}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 14 }}>Loading…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  // b89p: the sign-in gate renders before everything else — a
  // logged-out visitor is not a user with "no competitor data yet".
  if (signedIn === false) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Sign in to view Competitor Intel.</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>Competitor analysis is built from your own scans.</p>
        <Link href="/login?next=/dashboard/competitor" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
      </div>
    </div>
  );

  if (loadError) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
          .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
          .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
          .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
          .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
          .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
          .sub{margin:0;font-size:13px;color:#55556A}
          .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
          .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
          .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
          .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
          @media (max-width:639px){
            .pagehead{flex-direction:column;align-items:stretch}
            .card{padding:18px}
          }
          @media (prefers-reduced-motion:reduce){*{animation:none!important}}
        `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Competitor Intel</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>See exactly how your competitor performs across every AI platform — and where you can beat them.</p>
          </div>
        </header>
        <div className="card dash-card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: GRAY }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></div>
          <h3 style={{ color: NAVY, marginBottom: 8 }}>Something went wrong</h3>
          <p style={{ marginBottom: 16, color: GRAY }}>We couldn't load your competitor data. Please try again.</p>
          <button onClick={loadLastScan} style={{ background: PURPLE, color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }}>Try Again</button>
        </div>
      </div>
    </div>
  );

  const emptyState = (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></div>
        <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>No competitor data yet</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Run a scan to see who's beating you across ChatGPT, Gemini, and 10 other AI platforms — and exactly what they're doing differently.
        </p>
        <Link href="/" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Run my first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    </div>
  );

  const CompareRow = ({ label, userVal, compVal, userGood, compGood }: { label: string; userVal: string; compVal: React.ReactNode; userGood: boolean; compGood: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ padding: '10px 14px', fontSize: 12, color: GRAY, fontWeight: 600, borderRight: `1px solid ${BORDER}` }}>{label}</div>
      <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: userGood ? GREEN : RED, borderRight: `1px solid ${BORDER}`, textAlign: 'center' }}>{userVal}</div>
      <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: compGood ? GREEN : RED, textAlign: 'center' }}>{compVal}</div>
    </div>
  );

  return (
    <PlanPageGuard feature="canSeeCompetitors" requiredPlan="business">
      {plan !== rawPlan && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 32px 0' }}>
          <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 16px' }}>
            <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600, margin: 0 }}>
              Admin view — your account plan is {rawPlan}; Competitor Intel is gated to Business plans and above for customers.
            </p>
          </div>
        </div>
      )}
      {!lastScan && !scanning ? emptyState : (
    <div style={{ padding: '32px 32px 48px', maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link href="/dashboard" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
        <span>›</span>
        <span>Competitor Intel</span>
      </nav>

      <header className="pagehead" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Competitor Intel</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>
            {lastScan?.user_business_name
              ? <>Competitor analysis for <strong style={{ color: NAVY }}>{lastScan.user_business_name}</strong></>
              : 'See exactly how your competitor performs across every AI platform — and where you can beat them.'}
          </p>
        </div>
      </header>

      {/* Staleness warning — competitor data older than 30 days */}
      {isStale && scanDate && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}><svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9L192 301.3l67.9 67.9c4.6 4.6 8.6 9.6 12.1 14.9L112 384z"/></svg></span>
          <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600, margin: 0 }}>
            Your competitor data is from {scanDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.{' '}
            <Link href="/" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Run a new scan</Link> to update.
          </p>
        </div>
      )}

      {/* Scan card */}
      <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
        {lastScan?.competitor_name && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Detected from your last scan</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: RED_BG, border: '1px solid #FECACA', borderRadius: 100, padding: '6px 16px', fontSize: 13, fontWeight: 700, color: RED }}>
                {lastScan.competitor_name}
              </div>
              <button
                onClick={() => runScan(lastScan.competitor_name!)}
                disabled={scanning}
                style={{ background: BLUE, border: 'none', borderRadius: 100, padding: '6px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: scanning ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: scanning ? 0.7 : 1 }}
              >
                {scanning ? 'Scanning...' : (<>Deep Scan Competitor <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={competitorInput}
            onChange={e => setCompetitorInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runScan(competitorInput)}
            placeholder="Or enter any competitor name..."
            style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: NAVY, fontFamily: 'inherit', outline: 'none', background: BG }}
          />
          <button
            onClick={() => runScan(competitorInput)}
            disabled={scanning || !competitorInput.trim()}
            style={{ background: NAVY, border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: scanning || !competitorInput.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: scanning || !competitorInput.trim() ? 0.6 : 1 }}
          >
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 13, color: RED }}>{error}</p>}
      </div>

      {/* Scanning state */}
      {scanning && (
        <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTop: `3px solid ${BLUE}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Running deep scan...</p>
          <p style={{ fontSize: 13, color: GRAY }}>Querying all 12 AI platforms + Google Places</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Results */}
      {result && !scanning && (
        <>
          {/* Header comparison scores */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* YOU */}
            <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
              <div style={{ background: BLUE, padding: '14px 20px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>YOU</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastScan?.user_business_name || lastScan?.input || 'Your Business'}</p>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: BG, borderRadius: 10, padding: '14px 8px' }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: scoreCol(userScore), lineHeight: 1, marginBottom: 2 }}>{userScore}%</p>
                    <p style={{ fontSize: 11, color: GRAY }}>AI Coverage</p>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 8px' }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: PURPLE, lineHeight: 1, marginBottom: 2 }}>{userTrust}</p>
                    <p style={{ fontSize: 11, color: GRAY }}>Trust Score</p>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: GRAY }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span>Platforms responding</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{lastScan?.mentioned_count || 0} / {PLATFORMS_ALL.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span>Citation sources</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{lastScan?.citation_sources?.length || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span>Google reviews</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>—</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COMPETITOR */}
            <div className="dash-card" style={{ background: W, border: `1px solid #FECACA`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
              <div style={{ background: RED, padding: '14px 20px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>COMPETITOR</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.name}</p>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, textAlign: 'center', background: BG, borderRadius: 10, padding: '14px 8px' }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: scoreCol(result.score), lineHeight: 1, marginBottom: 2 }}>{result.score}%</p>
                    <p style={{ fontSize: 11, color: GRAY }}>AI Coverage</p>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '14px 8px' }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: PURPLE, lineHeight: 1, marginBottom: 2 }}>{compTrust}</p>
                    <p style={{ fontSize: 11, color: GRAY }}>Trust Score</p>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: GRAY }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span>Platforms responding</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{result.mentionedCount} / {PLATFORMS_ALL.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <span>Citation sources</span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{result.citationSources.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span>Google reviews</span>
                    <span style={{ fontWeight: 700, color: result.google?.reviewCount ? (result.google.reviewCount > 50 ? GREEN : AMBER) : NAVY }}>
                      {result.google?.reviewCount ? (<>{result.google.reviewCount} ({result.google.rating}<svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>)</>) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-side table */}
          <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, marginBottom: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: NAVY }}>
              <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: LGRAY }}>Signal</div>
              <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#A5B4FC', textAlign: 'center', borderLeft: `1px solid rgba(255,255,255,0.1)` }}>YOU</div>
              <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#FECACA', textAlign: 'center', borderLeft: `1px solid rgba(255,255,255,0.1)` }}>{result.name.split(' ')[0].toUpperCase()}</div>
            </div>

            <CompareRow
              label="AI Platform Coverage"
              userVal={`${userScore}%`}
              compVal={`${result.score}%`}
              userGood={userScore >= result.score}
              compGood={result.score >= userScore}
            />
            <CompareRow
              label="Trust Score"
              userVal={`${userTrust}/100`}
              compVal={`${compTrust}/100`}
              userGood={userTrust >= compTrust}
              compGood={compTrust >= userTrust}
            />
            <CompareRow
              label="Platforms Mentioning"
              userVal={`${lastScan?.mentioned_count || 0} of 12`}
              compVal={`${result.mentionedCount} of 12`}
              userGood={(lastScan?.mentioned_count || 0) >= result.mentionedCount}
              compGood={result.mentionedCount >= (lastScan?.mentioned_count || 0)}
            />
            <CompareRow
              label="Citation Sources"
              userVal={`${lastScan?.citation_sources?.length || 0} found`}
              compVal={`${result.citationSources.length} found`}
              userGood={(lastScan?.citation_sources?.length || 0) >= result.citationSources.length}
              compGood={result.citationSources.length >= (lastScan?.citation_sources?.length || 0)}
            />
            <CompareRow
              label="Google Reviews"
              userVal="—"
              compVal={result.google?.reviewCount ? (<>{result.google.reviewCount} ({result.google.rating}<svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>)</>) : '—'}
              userGood={false}
              compGood={!!result.google?.reviewCount}
            />
            <CompareRow
              label="Google Photos"
              userVal="—"
              compVal={result.google?.photos ? `${result.google.photos} photos` : '—'}
              userGood={false}
              compGood={!!result.google?.photos}
            />
            <CompareRow
              label="Reddit Mentions"
              userVal="—"
              compVal={result.reddit?.mentionCount ? `${result.reddit.mentionCount} posts` : '0'}
              userGood={false}
              compGood={(result.reddit?.mentionCount || 0) > 0}
            />
          </div>

          {/* Platform breakdown */}
          <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 16 }}>Platform by Platform Breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {PLATFORMS_ALL.map(platform => {
                const compHas = result.platformMentions.includes(platform);
                return (
                  <div key={platform} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{platform}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: compHas ? RED : GRAY }}>{compHas ? <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : '—'}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: LGRAY, marginTop: 12 }}><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> = competitor mentioned on this platform</p>
          </div>

          {/* Trust signal gaps */}
          {result.trustSignals && (() => {
            const userGoodSignals = new Set(
              [...(lastScan?.trust_signals?.technical || []), ...(lastScan?.trust_signals?.directory || []), ...(lastScan?.trust_signals?.reviews || []), ...(lastScan?.trust_signals?.community || []), ...(lastScan?.trust_signals?.aiPlatforms || [])]
                .filter(s => s.status === 'good').map(s => s.name)
            );
            const compAllSignals = [
              ...(result.trustSignals.technical || []).map(s => ({ ...s, category: 'Technical' })),
              ...(result.trustSignals.directory || []).map(s => ({ ...s, category: 'Directory' })),
              ...(result.trustSignals.reviews || []).map(s => ({ ...s, category: 'Reviews' })),
              ...(result.trustSignals.community || []).map(s => ({ ...s, category: 'Community' })),
              ...(result.trustSignals.aiPlatforms || []).map(s => ({ ...s, category: 'AI Platforms' })),
            ];
            // ax88: the gain from fixing a gap is measured on the USER's
            // score, so it uses the user's signal total + status.
            const userAllSignals = [...(lastScan?.trust_signals?.technical || []), ...(lastScan?.trust_signals?.directory || []), ...(lastScan?.trust_signals?.reviews || []), ...(lastScan?.trust_signals?.community || []), ...(lastScan?.trust_signals?.aiPlatforms || [])];
            const userStatusByName = new Map(userAllSignals.map(s => [s.name, s.status]));
            const gapSignals = compAllSignals.filter(s => s.status === 'good' && !userGoodSignals.has(s.name)).slice(0, 8);

            return gapSignals.length > 0 ? (
              <div style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Trust Signal Gap Analysis</h2>
                <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>Signals {result.name} is passing that you are not</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gapSignals.map(s => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: RED_BG, border: '1px solid #FECACA', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#EFF6FF', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase' }}>{s.category}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{s.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: RED, fontWeight: 700 }}>You: <svg viewBox="0 0 384 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>
                        <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>Them: <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                        {userAllSignals.length > 0 && <span style={{ fontSize: 11, color: GREEN, background: GREEN_BG, border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 8px', fontWeight: 700 }}>+{trustFixGainPoints({ status: userStatusByName.get(s.name) ?? 'missing' }, userAllSignals)} pts</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Actionable insights */}
          {gaps.length > 0 && (
            <div className="dash-card" style={{ background: NAVY, borderRadius: 16, padding: '28px 32px', boxShadow: '0 4px 20px rgba(10,10,20,0.15)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#A5B4FC', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Intelligence Report</p>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 20 }}>Here's exactly what they're doing that you're not</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {gaps.map((gap, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ width: 28, height: 28, background: BLUE, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff' }}>{i + 1}</div>
                    <p style={{ fontSize: 14, color: '#E2E8F0', lineHeight: 1.7, margin: 0 }}>{gap}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <a href="/dashboard/fix" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
                  Fix these gaps now <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !scanning && (
        <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(10,10,20,0.04)' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></div>
          <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Enter a competitor to deep scan</p>
          <p style={{ fontSize: 13, color: GRAY, maxWidth: 400, margin: '0 auto' }}>We'll check all 12 AI platforms, Google Places, and trust signals to show you exactly where they beat you — and how to close the gap.</p>
        </div>
      )}

      {/* ── Competitor History ──────────────────────────────────────── */}
      {history.length > 0 && <CompetitorHistorySection history={history} />}
    </div>
      )}
    </PlanPageGuard>
  );
}
