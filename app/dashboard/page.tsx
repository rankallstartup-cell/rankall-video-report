'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { normalizePlan, getPlanMeta, isAdminUser } from '@/lib/planConfig';
import { getPlanLabel } from '@/lib/planLabels';
import { useCountry } from '@/hooks/useCountry';
import { outcomeSentence } from '@/lib/scoreFraming';
import { getTrustedDisplayName, type EnrichmentData } from '@/lib/enrichment';
import { ACTIVE_PLATFORMS } from '@/lib/platforms';
import { platformListSentence } from '@/lib/platformList';
import { Geist, Geist_Mono } from 'next/font/google';
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const supabase = getBrowserClient();

// ── b35q: v2 design tokens (Overview v2 mockup) on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const PURPLE = '#7C3AED'; // trust-line purple — used ONLY by the trend chart
const GREEN  = '#12A150'; // mockup green (checks, mentioned chips)
const GREEN_DARK = '#0B6B37'; // mockup green text
const GREEN_BG = '#E3F6EC';
const AMBER  = '#D97706';
const RED    = '#B4232A'; // mockup red text
const RED_X  = '#D92D20'; // mockup ✕ circle
const RED_BG = '#FDECEC';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const MUTED  = '#5F5F78'; // mockup label gray
const MONO   = 'var(--font-geist-mono),ui-monospace,Menlo,monospace';
const DARK_TILE = '#14142A';
const CHIP_DARK = '#1C1C30';
const CHIP_MUTED = '#B4B4C8';
const DARK_MUTED = '#8A8AA3';
const LILAC  = '#8D8BFF';
const TINT_BORDER = '#DCDAFF';
const FIX_BG = '#F4F3FF';
const TRUST_LINE = '#A9A8C9';

// 12 active platforms — Meta AI is Coming Soon (no public API) and is not scanned.
const ALL_PLATFORMS = ['ChatGPT','Gemini','Google AI','Copilot','Perplexity','Grok','Claude','DeepSeek','Mistral','Kimi','Groq','Meta AI'];
// Display order + logos from the Overview v2 mockup.
const PLATFORM_ORDER = ['Google AI','ChatGPT','Gemini','Perplexity','Claude','Copilot','Grok','DeepSeek','Mistral','Kimi','Groq','Meta AI'];
const PLATFORM_LOGOS: Record<string, string> = {
  'Google AI': '/platforms/google-ai.png', 'ChatGPT': '/platforms/chatgpt.png',
  'Gemini': '/platforms/gemini.png', 'Perplexity': '/platforms/perplexity.png',
  'Claude': '/platforms/claude.png', 'Copilot': '/platforms/copilot.png',
  'Grok': '/platforms/grok.png', 'DeepSeek': '/platforms/deepseek.svg',
  'Mistral': '/platforms/mistral.svg', 'Kimi': '/platforms/kimi.svg', 'Groq': '/platforms/groq.png',
};
// No hardcoded benchmark: peer averages come from real scans via
// /api/dashboard/benchmarks (min sample, else "not enough data").
const scoreCol = (s: number) => s >= 75 ? GREEN : s >= 50 ? AMBER : RED;
// Score color on the dark hero card (mockup's light-on-dark palette).
const scoreColDark = (s: number) => s >= 75 ? '#5FD39A' : s >= 50 ? '#FBBF24' : '#FF8A8A';

interface Scan {
  id: string; input: string; user_business_name: string | null;
  overall_score: number; competitor_name: string | null;
  competitor_score: number | null;
  mentioned_count: number; citation_sources: string[];
  trust_signals: { overall: number } | null;
  created_at: string; location: string; industry: string;
  intent_type?: string | null;
  enrichment?: EnrichmentData | null;
  country_code?: string | null;
  basket_hash?: string | null;
}
interface FullScoreHistory {
  overall_score: number; trust_score: number;
  recommendation_share: number; created_at: string;
  business_input?: string; competitor_name?: string;
  basket_hash?: string | null;
}
interface PlatformResult { platform: string; mentioned: boolean; error?: string | null; }
interface Fix { fix_type: string; status: string; }

// ── SCORE TREND CHART (staging logic, verbatim) ───────────────────────

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i]; const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : pts[i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6; const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6; const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function ScoreTrendChart({ data }: { data: FullScoreHistory[] }) {
  const [hovered, setHovered] = useState<{ x: number; y: number; trust: number; coverage: number; date: string; flip: boolean } | null>(null);
  const VW = 720, VH = 210, PL = 40, PR = 20, PT = 16, PB = 36;
  const CW = VW - PL - PR, CH = VH - PT - PB;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const yPos = (s: number) => PT + CH - (Math.max(0, Math.min(100, s)) / 100) * CH;
  const xPos = (i: number, n: number) => n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW;
  const gridLines = [0, 25, 50, 75, 100];
  const step = data.length > 8 ? Math.ceil(data.length / 8) : 1;
  if (data.length === 0) return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 13, color: LGRAY }}>No scan history yet — run a scan to start tracking your score.</p>
    </div>
  );
  const trustPts = data.map((d, i) => ({ x: xPos(i, data.length), y: yPos(d.trust_score) }));
  const coverPts = data.map((d, i) => ({ x: xPos(i, data.length), y: yPos(d.overall_score) }));
  const singleDot = data.length === 1;
  const trustPath = smoothPath(trustPts), coverPath = smoothPath(coverPts);
  const trustFill = `${trustPath} L ${trustPts[trustPts.length-1].x} ${PT+CH} L ${trustPts[0].x} ${PT+CH} Z`;
  const coverFill = `${coverPath} L ${coverPts[coverPts.length-1].x} ${PT+CH} L ${coverPts[0].x} ${PT+CH} Z`;
  return (
    <div style={{ position: 'relative' }}>
      {singleDot && <p style={{ fontSize: 12, color: LGRAY, textAlign: 'center', marginBottom: 8 }}>Run more scans to see your trend</p>}
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} onMouseLeave={() => setHovered(null)}>
        {gridLines.map(g => { const y = yPos(g); return (
          <g key={g}>
            <line x1={PL} y1={y} x2={PL+CW} y2={y} stroke={BORDER} strokeWidth={g===0?1.5:1} strokeDasharray={g===0?undefined:'3 3'} />
            <text x={PL-6} y={y+4} textAnchor="end" fontSize={10} fill={LGRAY} fontFamily="inherit">{g}</text>
          </g>
        )})}
        {!singleDot && <path d={coverFill} fill={BLUE} fillOpacity={0.04} />}
        {!singleDot && <path d={trustFill} fill={PURPLE} fillOpacity={0.04} />}
        {!singleDot && <path d={coverPath} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {!singleDot && <path d={trustPath} fill="none" stroke={PURPLE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {data.map((d, i) => { if (!singleDot && i % step !== 0 && i !== data.length-1) return null; return (
          <text key={i} x={xPos(i,data.length)} y={VH-6} textAnchor="middle" fontSize={10} fill={LGRAY} fontFamily="inherit">{fmtDate(d.created_at)}</text>
        )})}
        {data.map((d, i) => {
          const x = xPos(i,data.length), ty = yPos(d.trust_score), cy = yPos(d.overall_score);
          const date = fmtDate(d.created_at), flip = x > VW*0.7;
          return (
            <g key={i} onMouseEnter={() => setHovered({ x, y: Math.min(ty,cy)-8, trust: d.trust_score, coverage: d.overall_score, date, flip })} style={{ cursor: 'pointer' }}>
              <rect x={x-12} y={PT} width={24} height={CH} fill="transparent" />
              <circle cx={x} cy={ty} r={hovered?.date===date?5:3.5} fill={PURPLE} stroke={W} strokeWidth={1.5} />
              <circle cx={x} cy={cy} r={hovered?.date===date?5:3.5} fill={BLUE} stroke={W} strokeWidth={1.5} />
            </g>
          );
        })}
        {hovered && (() => {
          const tw=140, th=58, tr=7;
          const tx = hovered.flip ? hovered.x-tw-10 : hovered.x+10;
          const ty = Math.max(PT, Math.min(hovered.y-th/2, VH-PB-th));
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={th} rx={tr} fill={NAVY} opacity={0.94} />
              <text x={tx+tw/2} y={ty+16} textAnchor="middle" fill="#E7E7F0" fontSize={10} fontWeight="700" fontFamily="inherit">{hovered.date}</text>
              <circle cx={tx+14} cy={ty+30} r={4} fill="#C7C5FF" /><text x={tx+22} y={ty+34} fill="#C7C5FF" fontSize={10} fontFamily="inherit">Trust Score</text><text x={tx+tw-8} y={ty+34} textAnchor="end" fill="#fff" fontSize={10} fontWeight="700" fontFamily="inherit">{hovered.trust}</text>
              <circle cx={tx+14} cy={ty+46} r={4} fill="#BFBFFF" /><text x={tx+22} y={ty+50} fill="#BFBFFF" fontSize={10} fontFamily="inherit">AI Coverage</text><text x={tx+tw-8} y={ty+50} textAnchor="end" fill="#fff" fontSize={10} fontWeight="700" fontFamily="inherit">{hovered.coverage}%</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── LOCKED PREVIEW CARD (Overview v2: flat tile + lock overlay) ──

function LockedCard({ title, description, upgradeParam, lines }: { title: string; description: string; upgradeParam: string; lines: string[] }) {
  return (
    <div style={{ background: BG, borderRadius: 14, padding: 16, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Blurred content preview */}
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.5 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: i % 3 === 0 ? GREEN : i % 3 === 1 ? AMBER : RED, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: NAVY }}>{l}</span>
          </div>
        ))}
      </div>
      {/* Lock overlay */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(246,246,251,0.85)' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: W, border: `1px solid ${BORDER}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 018 0v4"></path></svg>
          </span>
          <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>{title}</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 14px', lineHeight: 1.5 }}>{description}</p>
          <Link href={`/pricing?upgrade=${upgradeParam}`} className="btn btn-blue" style={{ minHeight: 36, fontSize: 13, padding: '0 16px' }}>
            Unlock with Local Pro →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD PAGE (staging logic + v2 design) ─────────────────────────

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const country = useCountry();
  const { plan, rawPlan, loading: planLoading, userEmail } = usePlan();
  const restricted = searchParams.get('restricted') === '1';
  const isFree = !planLoading && plan === 'free';
  const [showUpgraded, setShowUpgraded] = useState(searchParams.get('upgraded') === 'true');
  const [showWelcome, setShowWelcome] = useState(searchParams.get('welcome') === '1');

  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    const t = setTimeout(() => setShowUpgraded(false), 5000);
    return () => clearTimeout(t);
  }, [searchParams]);

  const [scans, setScans]               = useState<Scan[]>([]);
  const [scoreHistory, setScoreHistory] = useState<FullScoreHistory[]>([]);
  const [platformResults, setPlatformResults] = useState<PlatformResult[]>([]);
  const [fixes, setFixes]               = useState<Fix[]>([]);
  const [fixesError, setFixesError]     = useState(false); // Ticket 4: fetch failed — never show false empty-state copy
  // ax73: truthful load-failure states — a failed load must never render
  // as an empty/wrong state ("no scans", "0/12 platforms", vanished sections).
  const [loadError, setLoadError] = useState(false); // scans query failed
  const [platformResultsError, setPlatformResultsError] = useState(false);
  const [valueStackError, setValueStackError] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [rescanning, setRescanning]     = useState(false);
  const [rescanError, setRescanError]   = useState<string | null>(null); // Ticket 10: rescan failures must be visible, never silently revert
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [agencyClients, setAgencyClients] = useState<{ name: string; score: number | null }[]>([]);
  const [pendingFixCount, setPendingFixCount] = useState(0);
  const [appliedFixCount, setAppliedFixCount] = useState(0);
  // b8a0: the true all-time scan count. The visible list is capped at
  // the latest 10, so "Total scans" must come from a count query — the
  // list length understated it (test account: 10 shown vs 14 owned).
  const [totalScans, setTotalScans] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseUntil, setPauseUntil] = useState<string>('');
  const [displayScore, setDisplayScore] = useState(0); // animated count-up for the headline score

  // Dashboard value stack: Fix Impact Tracker, What To Do Today, Monthly ROI,
  // AI Appearances. Fetched via a service-role API route (never blocked by
  // RLS on verified_outcomes/generated_fixes), scoped to the logged-in user.
  type Outcome = {
    fixType: string | null; scoreBefore: number | null; scoreAfter: number | null;
    scoreImprovement: number; platformsBefore: number | null; platformsAfter: number | null;
    daysToImprovement: number | null; confidenceLevel: string; isVerified: boolean;
    verifiedAt: string | null; estimatedRevenue: number; revenueSymbol?: string;
  };
  type Priority = { level: number; message: string; ctaLabel: string; ctaHref: string };
  type MonthlyROI = { scoreChange: number | null; scoreBaselineDate?: string | null; fixesApplied: number; appearancesThisMonth: number; revenueImpact: number; revenueSymbol?: string };
  type Appearances = { thisMonth: number; lastMonth: number; scansThisMonth?: number; trend: 'up' | 'down' | 'flat' };
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [monthlyROI, setMonthlyROI] = useState<MonthlyROI | null>(null);
  const [appearances, setAppearances] = useState<Appearances | null>(null);

  // Count the headline score up from 0 once the latest scan loads.
  useEffect(() => {
    const end = scans[0]?.overall_score;
    if (!end) { setDisplayScore(0); return; }
    const duration = 1500;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setDisplayScore(end); clearInterval(timer); }
      else setDisplayScore(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [scans]);

  // ax73: the old .catch(()=>{}) let the priority banner, monthly-ROI,
  // and outcomes sections silently disappear on failure. Now a failure
  // renders an error banner with retry instead of hiding the sections.
  async function loadValueStack() {
    try {
      const r = await fetch('/api/dashboard/value-stack');
      if (!r.ok) throw new Error(`value-stack failed: ${r.status}`);
      const d = await r.json();
      if (!d) throw new Error('empty value-stack payload');
      setOutcomes(Array.isArray(d.outcomes) ? d.outcomes : []);
      setPriority(d.priority || null);
      setMonthlyROI(d.monthlyROI || null);
      setAppearances(d.appearances || null);
      setValueStackError(false);
    } catch {
      setValueStackError(true);
    }
  }
  useEffect(() => { loadValueStack(); }, []);

  const isAdmin = isAdminUser(userEmail);
  const viewPlan = isAdmin ? rawPlan : plan;
  const normPlan = normalizePlan(viewPlan);

  async function handleUnpause() {
    // Only reload on success — a failed unpause must not look like it worked.
    try {
      const res = await fetch('/api/user/unpause-subscription', { method: 'POST' });
      if (res.ok) { window.location.reload(); return; }
      const data = await res.json().catch(() => ({}));
      setRescanError(data?.message || data?.error || 'Could not resume your subscription. Please try again or contact hello@rankall.io.');
    } catch {
      setRescanError('Could not resume your subscription. Please check your connection and try again.');
    }
  }

  // Ticket 14: the scan-history query, shared by the initial load and the
  // post-Rescan refresh, so both paths always agree on which scans are visible.
  async function fetchScansList(sessionUserId: string): Promise<Scan[]> {
    if (!sessionUserId) return [];
    // Show only scans that match the user's track: Personal Brand sees
    // personal_pro scans; every other plan excludes them (but keeps old
    // scans whose intent_type is NULL). This stops a personal-name scan
    // ("Dr. Erik Ligans") from showing on a Local Business dashboard.
    const isPersonalPlan = normalizePlan(viewPlan) === 'personal_pro';
    const isAdminAccount = userEmail ? isAdminUser(userEmail) : false;
    let scanQuery = supabase.from('rankall_scans').select('*').eq('user_id', sessionUserId);
    if (isPersonalPlan) {
      // Personal Brand plan: only personal scans.
      scanQuery = scanQuery.eq('intent_type', 'personal_pro');
    } else if (isAdminAccount) {
      // Admins: latest scan of ANY type, so the overview reflects whatever
      // (personal or local) they scanned most recently.
    } else {
      // Business / other: exclude personal-name scans from the local dashboard.
      scanQuery = scanQuery.or('intent_type.neq.personal_pro,intent_type.is.null');
    }
    const { data: scanData } = await scanQuery.order('created_at', { ascending: false }).limit(10);
    return (scanData || []) as Scan[];
  }

  // b8a0: all-time scan count under the SAME track filter as
  // fetchScansList, so "Total scans" and the history list can never
  // disagree about which scans belong to this dashboard.
  async function fetchTotalScanCount(sessionUserId: string): Promise<number> {
    if (!sessionUserId) return 0;
    const isPersonalPlan = normalizePlan(viewPlan) === 'personal_pro';
    const isAdminAccount = userEmail ? isAdminUser(userEmail) : false;
    let countQuery = supabase.from('rankall_scans').select('id', { count: 'exact', head: true }).eq('user_id', sessionUserId);
    if (isPersonalPlan) {
      countQuery = countQuery.eq('intent_type', 'personal_pro');
    } else if (!isAdminAccount) {
      countQuery = countQuery.or('intent_type.neq.personal_pro,intent_type.is.null');
    }
    const { count } = await countQuery;
    return typeof count === 'number' ? count : 0;
  }

  // Ticket 14: dashboard data load, hoisted out of the effect so a Rescan
  // can re-run it in state instead of depending on window.location.reload().
  // Returns the fresh scan list so the caller can confirm the new scan is visible.
  async function loadDashboard(): Promise<Scan[]> {
    let scansArr: Scan[] = [];
    setLoadError(false);
    setPlatformResultsError(false);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return []; }

        // Pause banner state — read FRESH metadata via getUser() (server-validated),
        // not session.user.user_metadata (the JWT is cached and lags an unpause).
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        const meta = freshUser?.user_metadata as Record<string, unknown> | undefined;
        const pu = meta?.pause_until as string | undefined;
        if (meta?.account_paused === true && pu && new Date(pu) > new Date()) {
          setIsPaused(true);
          setPauseUntil(new Date(pu).toLocaleDateString());
        } else {
          setIsPaused(false);
        }

        // Show only scans that match the user's track (see fetchScansList).
        scansArr = await fetchScansList(session.user.id);
        setScans(scansArr);
        setTotalScans(await fetchTotalScanCount(session.user.id));

        const latestId = scansArr[0]?.id;
        const [histRes, platRes, trustRes] = await Promise.all([
          // ax9c: score_history's real columns are score / recommendation_share /
          // recorded_at / basket_hash / scan_id — the old select (overall_score,
          // trust_score, created_at, business_input, competitor_name) 400'd, so
          // the trend always rendered "No scan history yet".
          supabase.from('score_history').select('score, recommendation_share, recorded_at, basket_hash, scan_id').eq('user_id', session.user.id).order('recorded_at', { ascending: true }).limit(30),
          latestId ? supabase.from('rankall_platform_results').select('platform, mentioned, error').eq('scan_id', latestId) : Promise.resolve({ data: [] }),
          // Trust lives on rankall_scans (score_history has no trust_score column);
          // fall back to the trust_signals JSON for scans written before trust_score.
          supabase.from('rankall_scans').select('id, trust_score, trust_signals').eq('user_id', session.user.id),
        ]);
        // Trust map for the score_history path.
        const trustByScan = new Map(((trustRes.data || []) as any[]).map((r: any) => [r.id, (typeof r.trust_score === 'number' ? r.trust_score : (r.trust_signals as any)?.overall) ?? 0]));
        // ax8r: when score_history is empty (e.g. before any history row is
        // written), fall back to the scans already loaded above — the old code
        // showed "no history" despite real scans in rankall_scans. The
        // fallback covers the same track-filtered scans (max 10) as the rest
        // of this dashboard.
        const hist: FullScoreHistory[] = ((histRes.data || []) as any[]).length > 0
          ? ((histRes.data || []) as any[]).map((r: any) => ({
              overall_score: r.score ?? 0,
              trust_score: trustByScan.get(r.scan_id) ?? 0,
              recommendation_share: r.recommendation_share ?? 0,
              created_at: r.recorded_at ?? '',
              basket_hash: r.basket_hash ?? null,
            }))
          : [...scansArr].reverse().map(sc => ({
              overall_score: sc.overall_score ?? 0,
              trust_score: sc.trust_signals?.overall ?? 0,
              recommendation_share: 0,
              created_at: sc.created_at,
              basket_hash: sc.basket_hash ?? null,
            }));
        // P0c: trend only within the same basket — keep the latest basket's
        // series so a basket change never renders as a score change.
        const latestBasket = [...hist].reverse().find(r => r.basket_hash)?.basket_hash ?? null;
        setScoreHistory(latestBasket ? hist.filter(r => r.basket_hash === latestBasket) : hist);
        if ((platRes as { error?: unknown }).error) {
          // ax73: a failed platform-results query is NOT "mentioned on 0
          // platforms" — flag it so the grid + stat render an error.
          setPlatformResultsError(true);
          setPlatformResults([]);
        } else {
          setPlatformResults(platRes.data || []);
        }

        // Ticket 4: ONE fetch drives the banner, the queue, and the counts.
        // Two independent fetches with independent silent failures let the
        // banner ("N fixes ready") contradict the queue empty-state
        // ("run a scan…"). /api/fixes/pending now returns
        // { fixes, count, appliedCount } in a single response — and 500s on
        // real failure, so "couldn't load" is distinguishable from "none".
        try {
          const fixRes = await fetch('/api/fixes/pending');
          if (!fixRes.ok) throw new Error(`fixes fetch failed: ${fixRes.status}`);
          const fixJson = await fixRes.json();
          if (!Array.isArray(fixJson?.fixes)) throw new Error('bad fixes payload');
          setFixes(fixJson.fixes);
          setPendingFixCount(typeof fixJson.count === 'number' ? fixJson.count : fixJson.fixes.length);
          setAppliedFixCount(Number(fixJson?.appliedCount) || 0);
          setFixesError(false);
        } catch {
          // Truthful failure state — never fall through to the false
          // "run a scan" empty-state copy.
          setFixesError(true);
        }

        // Agency client roster — used only for the agency overview summary.
        try {
          const { data: clientData } = await supabase
            .from('agency_clients')
            // Alias the real columns (business_name / latest_score) to name / score
            // so the mapping below is unchanged. The table has no name/score columns.
            .select('name:business_name, score:latest_score')
            .eq('agency_user_id', session.user.id);
          if (clientData) {
            setAgencyClients(
              clientData.map((c: { name: string | null; score: number | null }) => ({
                name: c.name || 'Unnamed client',
                // Item 14: unmeasured stays null (shown as "—"), never 0.
                score: typeof c.score === 'number' ? c.score : null,
              }))
            );
          }
        } catch (clientErr) { console.error('[dashboard] agency_clients error:', clientErr); }
      } catch (err) {
        // ax73: a failed scans load is NOT "no scans" — show an error
        // with retry instead of the "Let's get your business visible" empty state.
        console.error('[dashboard] load error:', err);
        setLoadError(true);
      }
      finally { setLoading(false); }
      return scansArr;
    }

  useEffect(() => {
    // Wait for the plan to resolve so we fetch the RIGHT scan history for it.
    if (planLoading) return;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLoading, plan, userEmail]);

  async function handleRescan() {
    if (!latestScan || rescanning) return;
    setRescanning(true);
    setRescanError(null);
    try {
      // /api/scan expects `input` and `userId` (the latter drives plan + pause
      // checks). Sending the fresh session user id keeps the pause gate accurate.
      // P0c: mirror the homepage flow — run detect-query first so the rescan
      // classifies the input exactly like the original scan did, and pass the
      // locked basket (original queries_used) so the rescan reuses the
      // canonical queries instead of regenerating a new basket.
      let dq: any = null;
      try {
        const dqRes = await fetch('/api/detect-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: latestScan.input.trim() }),
        });
        if (dqRes.ok) dq = await dqRes.json();
      } catch { /* non-fatal — /api/scan falls back gracefully */ }
      const { data: { session } } = await supabase.auth.getSession();
      // Fetch the original scan's locked basket so the rescan uses identical queries.
      let lockedQueries: string[] | undefined;
      try {
        const { data: origScan } = await supabase
          .from('rankall_scans')
          .select('queries_used')
          .eq('id', latestScan.id)
          .single();
        if (Array.isArray((origScan as any)?.queries_used)) {
          lockedQueries = (origScan as any).queries_used;
        }
      } catch { /* fall through — scan route will regenerate */ }
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: latestScan.input,
          userId: session?.user?.id,
          // Ticket 10: bypass the 24h scan cache — a Rescan must run fresh
          // AI queries and save a new row. Without this, /api/scan returns
          // the cached 200 (no saveScan), the dashboard reloads, and the
          // user sees the old scan with no error and no new row.
          forceRescan: true,
          location: latestScan.location || '',
          industry: latestScan.industry || '',
          queries_used: (latestScan as any).queries_used || undefined,
          isBusinessName: dq?.isBusinessName || false,
          ...(dq?.isBusinessName ? { detectedCategory: dq.category || null, detectedCity: dq.location_text || null } : {}),
          ...(dq?.resolved_category ? { resolved_category: dq.resolved_category, category_confidence: dq.category_confidence } : {}),
        }),
      });
      if (res.ok) {
        // Ticket 14: refresh in state — never window.location.reload().
        // The reload only showed the new scan if it fired inside this
        // promise chain after the scan completed; a reload for any other
        // reason mid-scan abandoned the chain and the dashboard kept
        // showing pre-rescan history with no error. Re-reading the scan
        // list in state makes the new scan appear without any page reload.
        const prevLatestId = latestScan.id;
        let refreshed = await loadDashboard();
        // The scan row is committed before /api/scan returns 200
        // (saveScan is awaited server-side), so one refetch normally
        // shows it. Poll briefly to cover transient read lag — and if
        // the new scan still isn't visible, say so instead of silently
        // showing stale history.
        let tries = 0;
        while ((!refreshed[0] || refreshed[0].id === prevLatestId) && tries < 4) {
          await new Promise((r) => setTimeout(r, 1500));
          const list = await fetchScansList(session?.user?.id ?? '');
          if (list[0] && list[0].id !== prevLatestId) {
            refreshed = await loadDashboard();
            break;
          }
          tries++;
        }
        if (!refreshed[0] || refreshed[0].id === prevLatestId) {
          setRescanError('Rescan completed, but the new scan is not showing yet. Reload the page to see it.');
        }
        setRescanning(false);
        return;
      }
      // Ticket 10: NEVER silently revert — every failure gets a visible message.
      const err = await res.json().catch(() => ({}));
      if (err?.error === 'account_paused') {
        alert(err.message || 'Your account is paused. Resume it to run scans.');
      } else {
        setRescanError(err?.message || err?.error || `Rescan failed (HTTP ${res.status}). Please try again.`);
      }
    } catch {
      // Network / fetch failure — also visible, never swallowed.
      setRescanError('Rescan failed — network error. Check your connection and try again.');
    }
    setRescanning(false);
  }

  function handleShareReport(scanId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/report/${scanId}`).then(() => {
      setCopiedId(scanId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  // Real peer benchmark for the latest scan (null below the min sample).
  const benchScan = scans[0] || null;
  const [peerAvg, setPeerAvg] = useState<{ avg: number; count: number } | null>(null);
  useEffect(() => {
    if (!benchScan) return;
    const params = new URLSearchParams({
      industry: benchScan.industry || '',
      country: benchScan.country_code || 'US',
      intent: benchScan.intent_type === 'personal_pro' ? 'personal' : 'business',
    });
    let cancelled = false;
    fetch(`/api/dashboard/benchmarks?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setPeerAvg(j?.industry ?? null); })
      .catch(() => { if (!cancelled) setPeerAvg(null); });
    return () => { cancelled = true; };
  }, [benchScan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || planLoading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: GRAY, fontSize: 15 }}>Loading dashboard...</p>
    </div>
  );

  const latestScan = scans[0] || null;
  // Drive the overview's personal-vs-local rendering off the latest scan's
  // intent, not the plan — so an admin whose latest scan is personal sees the
  // personal overview (and a business user's local scans stay local).
  const isPersonalView = latestScan?.intent_type === 'personal_pro';

  if (!loading && loadError) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '40px 24px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Couldn&apos;t load your dashboard</p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>Your scans still exist — the dashboard failed to load them. This is not an empty account.</p>
          <button onClick={() => { setLoadError(false); setLoading(true); loadDashboard(); }} style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
        </div>
      </div>
    );
  }

  if (!loading && scans.length === 0) {
    return (
      <section style={{ padding: 'clamp(28px,5vw,56px)', borderRadius: 24, background: NAVY, color: '#fff', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>
        <span className="lbl" style={{ color: '#8D8BFF' }}>Welcome to Rankall</span>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px,4vw,48px)', lineHeight: 1.05, letterSpacing: '-0.04em', fontWeight: 700 }}>Let&apos;s get your business visible to AI</h1>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: CHIP_MUTED, maxWidth: 620 }}>Find out if {platformListSentence(ACTIVE_PLATFORMS.map(p => p.name), ['ChatGPT', 'Gemini', 'Perplexity'])} are recommending your business — and exactly what to fix.</p>
        <div>
          <Link href="/" className="btn btn-blue" style={{ minHeight: 48 }}>Run my first scan →</Link>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14, color: CHIP_MUTED }}><span>60 seconds</span><span>12 AI platforms</span><span>Free</span></div>
      </section>
    );
  }

  const platMap: Record<string, boolean> = {};
  // b8a0: a platform whose row carries an error did NOT respond — it is
  // not a "not mentioned" miss (the grid rendered it as a red ✕ while
  // the hero counted it as a non-response; same class as b8a5/b8a2).
  const platNoResponse = new Set<string>();
  platformResults.forEach(p => {
    if (p.error) { platNoResponse.add(p.platform); return; }
    platMap[p.platform] = p.mentioned;
  });
  const trustScore = latestScan?.trust_signals?.overall ?? null;
  const mentionedPlatforms = Object.values(platMap).filter(Boolean).length;
  // b0ff: frame presence against the platforms that RESPONDED for this scan
  // (an errored platform is not "recommending competitors"). Rows without
  // an error column (legacy) count as responded.
  const respondedPlatforms = platformResults.filter(p => !p.error).length;
  // Competitor score comes from the scan row when the pipeline measured one.
  // No fallback: a competitor score is never invented from our own score.
  const competitorScore = typeof latestScan?.competitor_score === 'number' ? latestScan.competitor_score : null;
  const latest = scoreHistory[scoreHistory.length - 1] ?? null;
  const prev   = scoreHistory[scoreHistory.length - 2] ?? null;
  const trustChange    = latest && prev ? latest.trust_score - prev.trust_score : null;
  const coverageChange = latest && prev ? latest.overall_score - prev.overall_score : null;
  const topFix = fixes[0];
  // ax6t: no fake rescan countdown. There is no scheduled automatic rescan
  // — the only automatic rescan is the verification rescan ~7 days after
  // a fix is marked applied (verification-rescan pipeline).
  // The 'Next Rescan' stat below states that rule instead of a countdown.

  // "What to do next" — step states derived from real progress (done = 2,
  // current = 1, todo = 0). Notes carry real numbers, never invented ones.
  const fmtFixName = (f: Fix) => f.fix_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const steps = [
    // b8a0 (kept from the old strip): accounts with scans see "Run a new
    // scan", and step 2 opens the latest report instead of this page.
    scans.length > 0
      ? { label: 'Run a new scan', href: '/', state: 2, note: `Done · ${scans.length} scan${scans.length === 1 ? '' : 's'}` }
      : { label: 'Run your first scan', href: '/', state: 1, note: 'Takes 60 seconds' },
    { label: 'See your score', href: latestScan ? `/report/${latestScan.id}` : '/dashboard', state: scans.length > 0 ? 2 : 0, note: scans.length > 0 && latestScan ? `Done · ${latestScan.overall_score}/100` : 'After your first scan' },
    { label: 'Implement Fix #1', href: latestScan ? `/report/${latestScan.id}` : '/dashboard/fix', state: appliedFixCount > 0 ? 2 : (fixes.length > 0 ? 1 : 0), note: appliedFixCount > 0 ? `Done · ${appliedFixCount} applied` : (topFix ? fmtFixName(topFix) : 'After your first scan') },
    // ax8r: step 4 runs a REAL rescan (same handler as the Rescan button),
    // not a link back to /dashboard that only reloaded the Overview.
    { label: 'Rescan to verify', href: null as string | null, state: appliedFixCount > 0 ? 1 : 0, note: 'After your fix' },
  ];
  const doneSteps = steps.filter(s => s.state === 2).length;

  const headerParts = latestScan ? [
    `Latest scan ${new Date(latestScan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    `"${latestScan.input}"`,
    latestScan.industry || '',
    latestScan.location || '',
  ].filter(Boolean) : [];

  return (
    <div className="dash-page" style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
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
        .btn-white{background:#fff;color:#0A0A14}.btn-white:hover{color:#1B17FF}
        .tl{display:inline-flex;align-items:center;min-height:44px;font-weight:600;font-size:14px}
        .plogo{width:22px;height:22px;border-radius:50%;object-fit:contain;background:#fff;border:1px solid #E7E7F0;padding:2px;flex:none}
        .g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
        .g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .g6{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
        .hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px}
        .pgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
        .toolbar{display:flex;gap:10px;flex-wrap:wrap}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        .steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .hrow{display:grid;grid-template-columns:minmax(0,1fr) 56px auto;align-items:center;gap:12px;padding:14px 20px;border-top:1px solid #E7E7F0}
        .pname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .hnum{font-size:72px}
        .heroStats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        @media (max-width:1279px){
          .hero{grid-template-columns:minmax(0,1fr)}
          .g6{grid-template-columns:repeat(3,minmax(0,1fr))}
        }
        @media (max-width:1023px){
          .g2{grid-template-columns:minmax(0,1fr)}
          .g4{grid-template-columns:repeat(2,minmax(0,1fr))}
          .steps{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media (max-width:639px){
          .dash-page{padding:20px 16px!important}
          .pagehead{flex-direction:column;align-items:stretch}
          .toolbar{display:grid;grid-template-columns:1fr 1fr}
          .toolbar .wide{grid-column:1/-1}
          .hnum{font-size:56px}
          .g6{grid-template-columns:repeat(2,minmax(0,1fr))}
          .steps{grid-template-columns:minmax(0,1fr)}
          .heroStats{grid-template-columns:minmax(0,1fr)}
          .hrow{grid-template-columns:minmax(0,1fr) 40px;padding:14px 16px;align-items:start}
          .hrow .acts{grid-column:1/-1}
          .hrow .acts > *{flex:1}
          .dash-page{padding-bottom:96px!important}
          .card{padding:18px}
        }
        @media (max-width:400px){
          .pgrid{grid-template-columns:minmax(0,1fr)}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      {isPaused && (
        <div style={{ background: NAVY, border: '1px solid #f59e0b', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#f59e0b', fontWeight: 600, margin: '0 0 4px', fontSize: 15 }}><span style={{ display: 'inline-flex', marginRight: 6 }}><svg viewBox="0 0 320 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z"/></svg></span>Account Paused</p>
            <p style={{ color: '#94A3B8', fontSize: 13, margin: 0 }}>
              Your account is paused until {pauseUntil}. Scans are disabled during this period.
            </p>
          </div>
          <button onClick={handleUnpause} style={{ background: '#f59e0b', color: 'black', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', marginLeft: 16 }}>
            Resume Account
          </button>
        </div>
      )}

      {/* ONE notification slot — fixes ready to review */}
      {!fixesError && pendingFixCount > 0 && (
        <Link href="/dashboard/fix" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, background: W, border: `1px solid ${TINT_BORDER}`, color: NAVY, textDecoration: 'none' }}>
          <span className="mono" style={{ width: 32, height: 32, borderRadius: '50%', background: BLUE, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flex: 'none' }}>{pendingFixCount}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 700 }}>Fixes ready to review</span>
            <span style={{ fontSize: 13, color: GRAY }}>We generated specific fixes for your business. Tap to review and approve.</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"></path></svg>
        </Link>
      )}

      {showUpgraded && (
        <div style={{ background: 'linear-gradient(90deg, #E3F6EC, #ECEBFF)', border: '1px solid #BBF7D0', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#065F46' }}>
            Welcome to {getPlanLabel(normalizePlan(viewPlan))} Plan! Your AI visibility dashboard is now fully unlocked.
          </p>
          <button onClick={() => setShowUpgraded(false)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', fontSize: 18, lineHeight: 1, color: BLUE, cursor: 'pointer', fontFamily: 'inherit', padding: 4, display: 'inline-flex', alignItems: 'center' }}>✕</button>
        </div>
      )}

      {showWelcome && (
        <div style={{ background: 'linear-gradient(90deg, #F5F3FF, #ECFDF5)', border: '1.5px solid #DDD6FE', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#5B21B6' }}>
            {/* b8a0: this banner only renders for accounts WITH scans (the
                no-scan state returns earlier) — "run your first scan" here
                contradicted the history below it. */}
            Welcome to Rankall! Your latest scan is below — rescan any time to see what changed.
          </p>
          <button onClick={() => setShowWelcome(false)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', fontSize: 18, lineHeight: 1, color: BLUE, cursor: 'pointer', fontFamily: 'inherit', padding: 4, display: 'inline-flex', alignItems: 'center' }}>✕</button>
        </div>
      )}

      {restricted && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, color: '#991B1B', display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg></span>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', margin: 0 }}>This page is restricted to Rankall admins only.</p>
        </div>
      )}

      {/* Plan-specific welcome banner */}
      {!planLoading && (() => {
        const np = normPlan;
        const meta = getPlanMeta(viewPlan);
        let msg = '';
        if (isPersonalView) msg = `Welcome back. Your personal brand AI visibility is tracked across 12 platforms.`;
        else if (np === 'business') msg = `Welcome back. You're on ${getPlanLabel(np)}. Your local business AI visibility is tracked across 12 platforms.`;
        else if (np === 'personal_pro') msg = `Welcome back. You're on ${getPlanLabel(np)}. Your personal brand AI visibility is tracked across 12 platforms.`;
        else if (np === 'agency') msg = `Welcome back. You're managing your clients on ${getPlanLabel(np)}.`;
        else if (np === 'enterprise') msg = `Welcome back. You're on ${getPlanLabel(np)} with full access.`;
        else msg = `You're on the Free plan (3 scans/month). Upgrade to unlock competitor intelligence, report exports, and AI Inbox.`;
        return (
          <div style={{ background: meta.isFree ? '#FFFBEB' : '#F5F3FF', border: `1.5px solid ${meta.isFree ? '#FDE68A' : '#DDD6FE'}`, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: meta.isFree ? '#92400E' : '#4C1D95', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{meta.icon}</span>{msg}
            </p>
            {meta.isFree && (
              <Link href="/pricing" className="btn btn-blue" style={{ minHeight: 40 }}>Upgrade to Local Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
            )}
          </div>
        );
      })()}

      {/* Page header */}
      <header className="pagehead">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em' }}>Overview</h1>
          <span style={{ fontSize: 14, color: GRAY }}>{headerParts.join(' · ')}</span>
        </div>
        <div className="toolbar">
          {latestScan && (
            <button className="btn btn-blue" onClick={handleRescan} disabled={rescanning} style={{ opacity: rescanning ? 0.7 : 1 }}>
              {rescanning ? 'Rescanning…' : 'Rescan now'}
            </button>
          )}
          {latestScan && (
            <a
              // b8a0: link by scan_id — /score-card is server-driven since
              // b8b7 and ignores client-supplied score params (the old
              // ?score= link landed on "No scan selected").
              href={`/score-card?scan_id=${latestScan.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-line"
            >
              Share score card
            </a>
          )}
          <Link href="/" className="btn btn-line wide">+ New scan</Link>
        </div>
      </header>

      {/* Ticket 10: rescan failure banner — failures must be visible, never a silent revert */}
      {rescanError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 600, margin: 0 }}>{rescanError}</p>
          <button onClick={() => setRescanError(null)} aria-label="Dismiss error" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* The progress-aware "What to do next" card below is the only one
          (an older 4-link strip used to repeat it here). */}

      {/* ── HERO + TODAY'S PRIORITY ── */}
      {latestScan && (
        priority ? (
          <section className="hero">
            <HeroCard />
            <PriorityCard />
          </section>
        ) : (
          <HeroCard />
        )
      )}

      {/* ── WHAT TO DO NEXT — steps reflect real progress ── */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <h3 className="h3">What to do next</h3>
          <span className="mono" style={{ fontSize: 12, color: MUTED }}>{doneSteps} of 4 done</span>
        </div>
        <ol className="steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((s, i) => {
            const st = s.state;
            const inner = (
              <>
                <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flex: 'none', background: st === 2 ? GREEN : st === 1 ? BLUE : TRUST_LINE }}>
                  {st === 2 ? '✓' : String(i + 1)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{s.note}</span>
                </span>
              </>
            );
            const stepStyle = {
              display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '10px 12px', borderRadius: 12, textDecoration: 'none',
              background: st === 2 ? GREEN_BG : st === 1 ? '#ECEBFF' : BG,
              color: st === 2 ? GREEN_DARK : st === 1 ? BLUE : GRAY,
              ...(st === 1 ? { boxShadow: 'inset 0 0 0 1.5px #1B17FF' } : {}),
            } as const;
            return (
              <li key={s.label}>
                {s.href ? (
                  <Link href={s.href} style={stepStyle}>{inner}</Link>
                ) : (
                  <button onClick={handleRescan} disabled={rescanning || !latestScan} title={latestScan ? 'Run a fresh rescan' : 'Run a scan first'} style={{ ...stepStyle, width: '100%', cursor: rescanning || !latestScan ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left', border: 'none' }}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── FREE TEASER CTA — free plan only (staging section, kept) ── */}
      {normPlan === 'free' && (
        <div style={{ background: NAVY, borderRadius: 16, padding: '22px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>See if AI recommends your business</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>Run a free scan across 12 AI platforms — then unlock the full fix queue, score history, and competitor intelligence with Business.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-blue">Run a scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
            <Link href="/pricing" className="btn btn-white">Upgrade to Local Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          </div>
        </div>
      )}

      {/* ── AGENCY SUMMARY — agency plan only ── */}
      {normPlan === 'agency' && (() => {
        const total = agencyClients.length;
        // Item 14: only MEASURED client scores feed the stats; an unscanned
        // client is not "0" (it used to drag the average down and count as
        // needing attention).
        const measured = agencyClients.filter((c): c is { name: string; score: number } => typeof c.score === 'number');
        const needAttention = measured.filter(c => c.score < 50).length;
        const avg: number | null = measured.length ? Math.round(measured.reduce((s, c) => s + c.score, 0) / measured.length) : null;
        const sorted = [...measured].sort((a, b) => b.score - a.score);
        const best = sorted[0] ?? null;
        const worst = sorted[sorted.length - 1] ?? null;
        return (
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
              <h3 className="h3">Agency Overview</h3>
              <Link href="/dashboard/agency" className="btn btn-blue" style={{ minHeight: 40, padding: '0 18px', fontSize: 13 }}>+ Add new client</Link>
            </div>
            {total === 0 ? (
              <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>No clients yet. Add your first client to start tracking their AI visibility.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Total clients', value: total.toString(), color: NAVY, sub: undefined as string | undefined },
                    { label: 'Needing attention', value: needAttention.toString(), color: needAttention > 0 ? RED : GREEN, sub: 'score < 50' },
                    { label: 'Avg client score', value: avg != null ? avg.toString() : '—', color: avg != null ? scoreCol(avg) : LGRAY, sub: measured.length < total ? `${measured.length} of ${total} scanned` : undefined },
                  ].map((s, i) => (
                    <div key={i} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
                      <p style={{ fontSize: 24, fontWeight: 900, color: s.color, margin: '0 0 2px', lineHeight: 1 }}>{s.value}</p>
                      <p style={{ fontSize: 12, color: NAVY, fontWeight: 600, margin: 0 }}>{s.label}</p>
                      {s.sub && <p style={{ fontSize: 11, color: LGRAY, margin: '2px 0 0' }}>{s.sub}</p>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {best && <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Top performer: <strong style={{ color: GREEN }}>{best.name}</strong> ({best.score})</p>}
                  {worst && best !== worst && <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Needs work: <strong style={{ color: RED }}>{worst.name}</strong> ({worst.score})</p>}
                </div>
              </>
            )}
          </section>
        );
      })()}


      {/* ── MONTHLY ROI + AI APPEARANCES ── */}
      {(monthlyROI || appearances) && (
        <div className="card">
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 14px' }}>This Month</p>
          <div className="g4" style={{ gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: LGRAY, margin: '0 0 4px', fontWeight: 600 }}>SCORE CHANGE</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: (monthlyROI?.scoreChange ?? 0) >= 0 ? GREEN : RED, margin: 0 }}>
                {monthlyROI?.scoreChange === null || monthlyROI?.scoreChange === undefined ? '—' : `${monthlyROI.scoreChange >= 0 ? '+' : ''}${monthlyROI.scoreChange} pts`}
              </p>
              {/* b8a0: name the baseline — a delta without a dated,
                  like-for-like baseline is how the old "+2" misled. */}
              <p style={{ fontSize: 11, color: LGRAY, margin: '4px 0 0' }}>
                {monthlyROI?.scoreBaselineDate
                  ? `vs previous scan of the same query set · ${new Date(monthlyROI.scoreBaselineDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'needs two scans of the same query set'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: LGRAY, margin: '0 0 4px', fontWeight: 600 }}>FIXES APPLIED</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: NAVY, margin: 0 }}>{monthlyROI?.fixesApplied ?? 0}</p>
              <p style={{ fontSize: 11, color: LGRAY, margin: '4px 0 0' }}>this month</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: LGRAY, margin: '0 0 4px', fontWeight: 600 }}>AI APPEARANCES</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: NAVY, margin: 0 }}>
                {appearances?.thisMonth ?? 0}
                {appearances && appearances.lastMonth > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: appearances.trend === 'up' ? GREEN : appearances.trend === 'down' ? RED : LGRAY, marginLeft: 6 }}>
                    {appearances.trend === 'up' ? '▲' : appearances.trend === 'down' ? '▼' : '→'} vs {appearances.lastMonth} last month
                  </span>
                )}
              </p>
              {/* b8a0: the definition — the number is the sum of platform
                  mentions across this month's scans, not a reach estimate. */}
              {typeof appearances?.scansThisMonth === 'number' && (
                <p style={{ fontSize: 11, color: LGRAY, margin: '4px 0 0' }}>platform mentions summed across your {appearances.scansThisMonth} scan{appearances.scansThisMonth === 1 ? '' : 's'} this month</p>
              )}
            </div>
            <div>
              <p style={{ fontSize: 11, color: LGRAY, margin: '0 0 4px', fontWeight: 600 }}>EST. REVENUE IMPACT</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: (monthlyROI?.revenueImpact ?? 0) > 0 ? GREEN : NAVY, margin: 0 }}>
                {monthlyROI && monthlyROI.revenueImpact > 0 ? `+${monthlyROI.revenueSymbol ?? '$'}${monthlyROI.revenueImpact.toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── FIX IMPACT TRACKER ── */}
      {outcomes.length > 0 && (
        <div>
          <h3 className="h3" style={{ marginBottom: 12 }}>Your Fix Results</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {outcomes.map((o, i) => {
              const borderColor = o.confidenceLevel === 'verified' || o.confidenceLevel === 'high' ? GREEN : o.confidenceLevel === 'medium' ? AMBER : BORDER;
              return (
                <div key={i} style={{ background: W, border: `1px solid ${borderColor}`, borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16, display: 'inline-flex', color: o.isVerified ? GREEN : '#D97706' }}>{o.isVerified ? '✓' : '◷'}</span>
                    <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: 0 }}>{(o.fixType || 'Fix').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                  </div>
                  {o.verifiedAt && (
                    <p style={{ fontSize: 11, color: LGRAY, margin: '0 0 10px' }}>Applied {Math.max(0, Math.floor((Date.now() - new Date(o.verifiedAt).getTime()) / 86400000))} days ago</p>
                  )}
                  <p style={{ fontSize: 13, color: NAVY, margin: '0 0 4px' }}>
                    Score: <strong>{o.scoreBefore ?? '—'} → {o.scoreAfter ?? '—'}</strong>
                    {o.scoreImprovement > 0 && <span style={{ color: GREEN, fontWeight: 700 }}> (+{o.scoreImprovement} pts)</span>}
                  </p>
                  {o.platformsBefore !== null && o.platformsAfter !== null && (
                    <p style={{ fontSize: 13, color: NAVY, margin: '0 0 4px' }}>
                      Platforms: <strong>{o.platformsBefore} → {o.platformsAfter}</strong>
                      {o.platformsAfter > o.platformsBefore && <span style={{ color: GREEN, fontWeight: 700 }}> (+{o.platformsAfter - o.platformsBefore})</span>}
                    </p>
                  )}
                  <p className="mono" style={{ fontSize: 11, fontWeight: 700, color: borderColor === GREEN ? GREEN : borderColor === AMBER ? AMBER : LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 10px' }}>
                    Confidence: {o.confidenceLevel}
                  </p>
                  {o.estimatedRevenue > 0 && (
                    <p style={{ fontSize: 12, color: GREEN, fontWeight: 700, margin: 0, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                      Est. revenue impact: +{o.revenueSymbol ?? '$'}{o.estimatedRevenue.toLocaleString()}/month
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PLATFORM BREAKDOWN + COMPETITOR / PEER ── */}
      <section className="g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><h3 className="h3">Platform breakdown</h3><p className="sub">Which AI platforms mentioned you in the last scan</p></div>
          <div className="pgrid">
            {PLATFORM_ORDER.map(platform => {
              const mentioned = platMap[platform] ?? null;
              const errored = platNoResponse.has(platform);
              const badge = errored ? 'nodata' : mentioned === true ? 'yes' : mentioned === false ? 'no' : 'nodata';
              return (
                <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 12, fontSize: 14, background: mentioned === true && !errored ? GREEN_BG : BG }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, minWidth: 0 }}>
                    {PLATFORM_LOGOS[platform] ? <img src={PLATFORM_LOGOS[platform]} alt="" className="plogo" /> : null}<span className="pname">{platform}</span>
                  </span>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flex: 'none', background: badge === 'yes' ? GREEN : badge === 'no' ? RED_X : TRUST_LINE }} aria-label={badge === 'yes' ? 'Mentioned you' : badge === 'no' ? 'Did not mention you' : 'No data'}>
                    {badge === 'yes' ? '✓' : badge === 'no' ? '✕' : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          {platformResultsError ? (
            <p style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>Couldn&apos;t load platform data. <button onClick={() => { setPlatformResultsError(false); setLoading(true); loadDashboard(); }} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Retry</button></p>
          ) : Object.keys(platMap).length === 0 && platNoResponse.size === 0 ? <p style={{ fontSize: 12, color: LGRAY, marginTop: 8 }}>Run a scan to see platform data.</p> : null}
          {/* b8a0: a dash means the platform didn't respond — never a miss. */}
          {!platformResultsError && ALL_PLATFORMS.some(p => platMap[p] === undefined) && (
            <p style={{ fontSize: 12, color: LGRAY, marginTop: 8 }}>— = the platform didn&apos;t respond to this scan (not counted as a miss).</p>
          )}
        </div>

        {isPersonalView ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><h3 className="h3">Peer comparison</h3><p className="sub">How your personal brand recognition stacks up</p></div>
            {latestScan ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: '#ECEBFF' }}>
                    <div className="lbl">Your recognition</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: BLUE }}>{latestScan.overall_score}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, background: BG }}>
                    <div className="lbl">Peer average</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: peerAvg ? scoreCol(peerAvg.avg) : LGRAY }}>{peerAvg ? peerAvg.avg : '—'}</div>
                  </div>
                </div>
                {peerAvg ? (
                  <p style={{ fontSize: 14, fontWeight: 700, color: latestScan.overall_score >= peerAvg.avg ? GREEN : RED, margin: 0 }}>
                    {latestScan.overall_score >= peerAvg.avg
                      ? `▲ ${latestScan.overall_score - peerAvg.avg} pts above the average of ${peerAvg.count} scanned personal brands in your field`
                      : `▼ ${peerAvg.avg - latestScan.overall_score} pts below the average of ${peerAvg.count} scanned personal brands in your field`}
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>Not enough scans in your field yet for a peer average.</p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>Run a scan to see how your name recognition compares to peers.</p>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><h3 className="h3">Competitor intelligence</h3><p className="sub">Who AI recommends instead of you</p></div>
            {latestScan?.competitor_name ? (
              <>
                <div style={{ padding: 16, borderRadius: 14, background: RED_BG, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="lbl" style={{ color: RED }}>Primary competitor</span>
                  <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{latestScan.competitor_name}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: BG }}>
                    <div className="lbl">Your score</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: scoreCol(latestScan.overall_score) }}>{latestScan.overall_score}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, background: BG }}>
                    <div className="lbl">Competitor</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: competitorScore != null ? scoreCol(competitorScore) : GRAY }}>{competitorScore ?? '—'}</div>
                  </div>
                </div>
                {competitorScore != null && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: RED, margin: 0 }}>
                    ▼ {competitorScore - latestScan.overall_score} point gap to close
                  </p>
                )}
                {isFree ? (
                  <Link href="/pricing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, padding: '12px 14px', borderRadius: 12, border: '1px dashed #C9C9DA', color: GRAY, fontSize: 14, textDecoration: 'none' }}>
                    <span>Platform-by-platform comparison · after every rescan</span>
                    <span style={{ fontWeight: 600, color: BLUE, whiteSpace: 'nowrap' }}>Unlock →</span>
                  </Link>
                ) : (
                  <Link href="/dashboard/competitor" className="tl">Full competitor analysis →</Link>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>No competitor detected in this scan. Try a more specific local query to detect who AI is recommending.</p>
            )}
          </div>
        )}
      </section>

      {/* ── KNOWLEDGE PANEL + FIX QUEUE TOP 3 (business / starter) ── */}
      {(normPlan === 'business' || normPlan === 'personal_pro') && (
        <section className="g2">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><h3 className="h3">Knowledge Panel status</h3><p className="sub">{normPlan === 'personal_pro' ? 'Whether AI recognises you as a known entity' : 'Whether AI recognises your business as a known entity'}</p></div>
            {(() => {
              const recognised = trustScore !== null && trustScore >= 50;
              const pill = trustScore === null
                ? { bg: '#F2F2F8', circle: TRUST_LINE, mark: '—', text: 'Not yet scanned', color: GRAY }
                : recognised
                  ? { bg: GREEN_BG, circle: GREEN, mark: '✓', text: 'Recognised entity', color: GREEN_DARK }
                  : { bg: '#FEF3C7', circle: AMBER, mark: '!', text: 'Not yet established', color: '#92400E' };
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, background: pill.bg }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: pill.circle, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: 'none' }}>{pill.mark}</span>
                  <span style={{ fontWeight: 700, color: pill.color }}>{pill.text}</span>
                </div>
              );
            })()}
            <p className="sub" style={{ fontSize: 14, lineHeight: 1.55 }}>A strong entity profile makes AI platforms more likely to recommend you with confidence.</p>
          </div>
          <div id="fixes" className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <h3 className="h3">{normPlan === 'personal_pro' ? 'Your personal fix queue' : 'Your fix queue'}</h3>
              <Link href="/dashboard/fix" className="tl" style={{ fontSize: 13 }}>View all →</Link>
            </div>
            {fixesError ? (
              <p style={{ fontSize: 13, color: '#B45309', margin: 0 }}>Couldn&apos;t load fixes — check your connection and refresh.</p>
            ) : fixes.length === 0 ? (
              <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>Run a scan to generate your prioritised fixes.</p>
            ) : (
              fixes.slice(0, 3).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                  <span className="mono" style={{ width: 28, height: 28, borderRadius: 8, background: '#F2F2F8', color: GRAY, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flex: 'none' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{fmtFixName(f)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: f.status === 'applied' ? GREEN_BG : '#F2F2F8', color: f.status === 'applied' ? GREEN_DARK : GRAY }}>{f.status === 'applied' ? 'Done' : 'To do'}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── NEXT STEP CTA (business / starter) ── */}
      {(normPlan === 'business' || normPlan === 'personal_pro') && (
        <div style={{ background: GREEN_BG, border: '1px solid #BBF7D0', borderRadius: 16, padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px', fontFamily: MONO }}>Next step</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>
              {fixesError ? 'Fixes are unavailable right now — try refreshing.' : fixes.length > 0 ? 'Implement your top fix, then rescan to verify the lift.' : 'Run a scan to get your prioritised fixes.'}
            </p>
          </div>
          <Link href={fixes.length > 0 || fixesError ? '/dashboard/fix' : '/'} style={{ background: GREEN, color: '#fff', borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {fixes.length > 0 || fixesError ? 'Go to fixes →' : 'Run a scan →'}
          </Link>
        </div>
      )}

      {/* ── FIX #1 — always free ── */}
      {latestScan && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderColor: BLUE, background: FIX_BG }}>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span className="lbl" style={{ color: BLUE }}>Your #1 fix — free</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{topFix ? fmtFixName(topFix) : 'View your full report for fix content'}</span>
            <span className="sub" style={{ fontSize: 14 }}>
              {topFix
                ? 'Apply this fix to improve your AI visibility. Timing depends on when each AI platform refreshes its data; a verification rescan after you apply it shows the change.'
                : 'Your scan report includes exact fix content — ready-to-paste code and copy for each improvement.'}
            </span>
          </div>
          <Link href={`/report/${latestScan.id}`} className="btn btn-blue">View fix content →</Link>
        </div>
      )}

      {/* ── WHAT YOU'RE MISSING (free only) ── */}
      {isFree && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <h3 className="h3">What you&apos;re missing with Free</h3>
              <span className="mono" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: '#F2F2F8', color: GRAY }}>4 features locked</span>
            </div>
            <div className="g4">
              <LockedCard
                title="Full Fix Queue"
                description="5 more fixes with ready-to-paste code. Each one moves your score up."
                upgradeParam="local_pro"
                // ax8r: these lines are generic feature descriptions, not
                // YOUR personalized fixes ('written for you', 'for your city').
                lines={['FAQ Schema markup templates', 'LocalBusiness JSON-LD code', 'Review response templates', 'Reddit thread drafts', 'Website content rewrite for AI citation']}
              />
              <LockedCard
                title="Score History Chart"
                description="Track your AI visibility over time. See which fixes moved your score."
                upgradeParam="local_pro"
                lines={['AI Coverage trend over 30 days', 'Trust Score improvement tracking', 'Before & after every fix applied', 'Verification rescan after you apply a fix (7 days by default)', 'Shareable proof card for clients']}
              />
              <LockedCard
                title="Competitor Deep Analysis"
                description="See exactly what your top competitor is doing better on each platform."
                upgradeParam="local_pro"
                lines={['Platform-by-platform competitor comparison', 'Which platforms they win on vs you', 'Their trust signal gaps to exploit', 'Competitor score after every rescan', 'Alert when you overtake them']}
              />
              <LockedCard
                title="Marketing Spend Intelligence"
                description="AI analysis of your marketing budget: where to reallocate for maximum AI visibility."
                upgradeParam="local_pro"
                lines={['Current spend vs AI visibility ROI', 'Category-by-category reallocation guide', 'Expected score after reallocation', 'Industry benchmark comparison', 'Monthly spend strategy report']}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: 18, borderRadius: 14, background: BLUE, color: '#fff' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 17 }}>Unlock everything — {country.symbol}{country.monthly}/month</span>
                <span style={{ color: '#DCDBFF', fontSize: 13 }}>7-day free trial. Card required — nothing charged until the trial ends. Cancel any time.</span>
              </div>
              <Link href="/pricing" className="btn btn-white">Start free trial →</Link>
            </div>
          </div>
        </section>
      )}

      {/* ── SCORE TREND (paid only) ── */}
      {!isFree && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <span className="lbl">Score trend</span>
              <h3 className="h3" style={{ marginTop: 4 }}>
                {scoreHistory.length === 0 ? 'No scan history yet' : `${scoreHistory.length} scan${scoreHistory.length === 1 ? '' : 's'} tracked`}
              </h3>
              {/* b8a0: the trend is ONE query set (the latest scan's
                  basket, P0c) — say so, or "2 tracked" reads as a
                  contradiction next to the all-time scan total. */}
              {scoreHistory.length > 0 && totalScans > scoreHistory.length && (
                <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>For the query set of your latest scan — each query set is tracked separately. All {totalScans} scans are in Scan History below.</p>
              )}
            </div>
            {latest && (
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {[{ label: 'Trust Score', val: latest.trust_score, ch: trustChange, col: PURPLE }, { label: 'AI Plat. Coverage', val: latest.overall_score, ch: coverageChange, col: BLUE }].map(m => (
                  <div key={m.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px', fontFamily: MONO }}>{m.label}</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color: m.col, lineHeight: 1 }}>{m.val ?? '—'}</span>
                        {m.ch !== null && <span style={{ fontSize: 12, fontWeight: 700, color: m.ch > 0 ? GREEN : m.ch < 0 ? RED : LGRAY }}>{m.ch > 0 ? `↑ +${m.ch}` : m.ch < 0 ? `↓ ${m.ch}` : '→ 0'} since previous scan{prev ? ` · ${new Date(prev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {scoreHistory.length > 0 && (
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: GRAY, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, background: BLUE }} />AI Platform Coverage</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, background: PURPLE }} />Trust score</span>
            </div>
          )}
          <ScoreTrendChart data={scoreHistory} />
        </div>
      )}

      {/* ── STATS ROW (paid) ── */}
      {!isFree && (
        <section className="g6">
          {[
            // b8a0: the count query's total, not the capped list length.
            { label: 'Total scans', value: (totalScans > 0 ? totalScans : scans.length).toString(), color: NAVY, sub: 'all time' },
            { label: 'AI Visibility Score', value: latestScan ? `${latestScan.overall_score}/100` : '—', color: BLUE, sub: 'latest scan' },
            { label: 'Trust Score', value: trustScore ? `${trustScore}/100` : '—', color: trustScore ? scoreCol(trustScore) : GRAY, sub: 'your quality score' },
            // ax8r: the old denominator fell back to a hardcoded 5 when the
            // real total was 0, inventing a '0/5'. With no fixes in the queue
            // the value is just the count.
            // b8a0: the denominator uses the deduped pending COUNT (the
            // banner's number), not the capped list length — the list is
            // limited to 10, the count is the real total.
            { label: 'Fixes Applied', value: fixesError ? '–' : ((appliedFixCount + pendingFixCount) > 0 ? `${appliedFixCount}/${appliedFixCount + pendingFixCount}` : `${appliedFixCount}`), color: GREEN, sub: 'fixes completed' },
            { label: 'Next Rescan', value: 'Apply + 7d', color: BLUE, sub: 'verification rescan after you mark a fix applied' },
            // Real industry average (min sample) vs the visibility score — the
            // old stat compared the TRUST score with a hardcoded 45.
            { label: 'Industry vs Avg', value: latestScan && peerAvg ? `${latestScan.overall_score - peerAvg.avg >= 0 ? '+' : ''}${latestScan.overall_score - peerAvg.avg}` : '—', color: latestScan && peerAvg && latestScan.overall_score >= peerAvg.avg ? GREEN : peerAvg ? RED : GRAY, sub: peerAvg ? `vs avg of ${peerAvg.count} ${latestScan?.industry || 'industry'} scans` : 'not enough industry scans yet' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: stat.color }}>{stat.value}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{stat.label}</span>
              <span style={{ fontSize: 12, color: MUTED }}>{stat.sub}</span>
            </div>
          ))}
        </section>
      )}

      {/* ── SCAN HISTORY ── */}
      <div style={{ background: W, border: '1px solid #E7E7F0', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>Scan History</p>
          <p style={{ fontSize: 12, color: LGRAY, margin: 0 }}>{totalScans > scans.length ? `latest ${scans.length} of ${totalScans} scans` : `${scans.length} scan${scans.length !== 1 ? 's' : ''}`}</p>
        </div>
        {scans.map((scan) => (
          <div key={scan.id} className="hrow">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>
                {(() => {
                  // #39: never show a stored (possibly poisoned) Google name —
                  // getTrustedDisplayName re-validates it against the query.
                  const name = scan.user_business_name ? getTrustedDisplayName(scan.input, scan.location, scan.user_business_name, scan.enrichment?.google) : null;
                  return name && name !== scan.input
                    ? <>{name} <span style={{ color: MUTED, fontWeight: 400 }}>· &quot;{scan.input}&quot;</span></>
                    : <>&quot;{scan.input}&quot;</>;
                })()}
              </span>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                {new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {scan.competitor_name && ` · vs ${scan.competitor_name}`}
                {scan.trust_signals?.overall ? ` · Trust ${scan.trust_signals.overall}/100` : ''}
              </span>
            </div>
            <span className="mono" style={{ fontSize: 20, fontWeight: 700, textAlign: 'right', color: scoreCol(scan.overall_score) }}>{scan.overall_score}</span>
            <div className="acts" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleShareReport(scan.id)}
                className="btn btn-line"
                style={{
                  padding: '0 14px', fontSize: 13, minHeight: 36,
                  ...(copiedId === scan.id ? { background: GREEN_BG, borderColor: '#BBF7D0', color: GREEN_DARK } : {}),
                }}
              >
                {copiedId === scan.id ? 'Copied!' : 'Share'}
              </button>
              <Link href={`/report/${scan.id}`} className="btn btn-line" style={{ padding: '0 14px', fontSize: 13, minHeight: 36 }}>Report →</Link>
            </div>
          </div>
        ))}
      </div>

    </div>
  );

  // ── HERO + PRIORITY (function declarations — hoisted) ──
  function HeroCard() {
    if (!latestScan) return null;
    return (
      <div className="dash-card" style={{ padding: 28, borderRadius: 20, background: NAVY, color: '#fff', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, animationDelay: '0.1s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="lbl" style={{ color: CHIP_MUTED }}>{isPersonalView ? 'AI name recognition' : 'Share of Recommendation'}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="hnum" style={{ fontWeight: 700, letterSpacing: '-0.06em', lineHeight: 0.9, color: scoreColDark(latestScan.overall_score) }}>{displayScore}</span>
              <span className="mono" style={{ color: DARK_MUTED }}>/100</span>
              {monthlyROI?.scoreChange !== null && monthlyROI?.scoreChange !== undefined && (
                <span className="mono" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: monthlyROI.scoreChange >= 0 ? 'rgba(95,211,154,.15)' : 'rgba(252,165,165,.15)', color: monthlyROI.scoreChange >= 0 ? '#5FD39A' : '#FCA5A5' }}>
                  {monthlyROI.scoreChange >= 0 ? `+${monthlyROI.scoreChange}` : monthlyROI.scoreChange} pts this month
                </span>
              )}
            </div>
          </div>
          <Link href={`/report/${latestScan.id}`} className="btn btn-white">Full report →</Link>
        </div>
        <p style={{ margin: 0, fontSize: 'clamp(16px,1.6vw,19px)', lineHeight: 1.45, fontWeight: 500 }}>
          {platformResultsError
            ? 'Platform data could not be loaded.'
            : respondedPlatforms > 0
              ? outcomeSentence(mentionedPlatforms, latestScan?.overall_score || 0, ALL_PLATFORMS.length, respondedPlatforms)
              : 'No platform results were recorded for this scan.'}
        </p>
        <div className="heroStats">
          <div style={{ padding: 14, borderRadius: 14, background: DARK_TILE, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="lbl" style={{ color: CHIP_MUTED }}>{isPersonalView ? 'Platforms recognising you' : 'Platforms mentioning you'}</span>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{platformResultsError ? '—' : `${Math.min(mentionedPlatforms, respondedPlatforms || ALL_PLATFORMS.length)} `}<span style={{ fontSize: 15, color: DARK_MUTED, fontWeight: 500 }}>/ {respondedPlatforms || ALL_PLATFORMS.length}</span></span>
          </div>
          {isPersonalView ? (
            <div style={{ padding: 14, borderRadius: 14, background: DARK_TILE, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="lbl" style={{ color: CHIP_MUTED }}>Peer average</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{peerAvg ? peerAvg.avg : '—'}</span>
            </div>
          ) : (
            <div style={{ padding: 14, borderRadius: 14, background: DARK_TILE, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span className="lbl" style={{ color: CHIP_MUTED }}>Top competitor</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: LILAC, lineHeight: 1.3 }}>{latestScan.competitor_name || 'None detected'}</span>
              {competitorScore != null && (
                <span style={{ fontSize: 12, color: DARK_MUTED }}>score {competitorScore} · gap: {competitorScore - latestScan.overall_score} pts</span>
              )}
            </div>
          )}
        </div>
        {Object.keys(platMap).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLATFORM_ORDER.map(name => {
              const mentioned = platMap[name] ?? false;
              return (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 5px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: mentioned ? GREEN : CHIP_DARK, color: mentioned ? '#fff' : CHIP_MUTED }}>
                  {PLATFORM_LOGOS[name] ? <img src={PLATFORM_LOGOS[name]} alt="" className="plogo" style={{ width: 18, height: 18 }} /> : null}{name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function PriorityCard() {
    if (!priority) return null;
    return (
      <div className="dash-card" style={{ padding: 26, borderRadius: 20, background: W, border: '1.5px solid #1B17FF', boxShadow: '0 30px 60px -36px rgba(27,23,255,.55)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, animationDelay: '0.2s' }}>
        <span className="lbl" style={{ color: BLUE }}>Today&apos;s priority</span>
        <h2 style={{ margin: 0, fontSize: 'clamp(21px,2.2vw,26px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{priority.message}</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
          <Link href={priority.ctaHref} className="btn btn-blue" style={{ flex: '1 1 160px' }}>{priority.ctaLabel}</Link>
          <Link href="/dashboard/fix" className="btn btn-line" style={{ flex: '1 1 120px' }}>All fixes</Link>
        </div>
      </div>
    );
  }

}

export default function DashboardPage() {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <Suspense><DashboardContent /></Suspense>
    </div>
  );
}
