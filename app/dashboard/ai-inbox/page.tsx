'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { getCountryConfig, getRevenueSymbol } from '@/lib/countryConfig';
import { usePlan } from '@/lib/usePlan';
import { normalizePlan } from '@/lib/planConfig';
import LimitReachedModal, { type LimitReachedData } from '@/components/LimitReachedModal';
import { scanRevenueEstimate, revenueEstimateBasis } from '@/lib/revenueModel';
import { usageMeterModel } from '@/lib/usageMeter';

// ── Theme ───────────────────────────────────────────────────────────
const BG = '#0B0F19';
const CARD = '#111827';
const TEXT = '#F9FAFB';
const MUTED = '#9CA3AF';
const PURPLE = '#8b5cf6';
const RED = '#ef4444';
const GREEN = '#22c55e';
const GRAY = '#374151';
const BORDER = '#1F2937';
const LGRAY = '#9CA3AF';
const BLUE = '#818CF8';
const RED_BG = 'rgba(239,68,68,0.12)';
const RED_TEXT = '#FCA5A5';
const FIX_BG = 'rgba(129,140,248,0.12)';

const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot', 'Claude',
  'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI',
];

// ── Types mirroring /api/scan response shape ────────────────────────
interface ScanResult {
  platform: string;
  weight: number;
  status: string;
  response: string | null;
  error: string | null;
}
interface ScanAnalysis {
  platform: string;
  mentioned: boolean;
  competitor: string | null;
}
export interface ScanResponse {
  success?: boolean;
  query?: string;
  overallScore?: number;
  results?: ScanResult[];
  analysis?: ScanAnalysis[];
  competitor?: string | null;
  mentionedCount?: number;
  country_code?: string;
  industry?: string | null;
}

interface RecentSearch {
  id: string;
  query: string;
  created_at: string;
}

// Build a per-platform view: mentioned (user), competitor-mentioned, response text.
function buildCards(scan: ScanResponse) {
  const analysisByPlatform = new Map<string, ScanAnalysis>();
  (scan.analysis || []).forEach(a => analysisByPlatform.set(a.platform, a));
  const competitor = (scan.competitor || '').trim();

  return PLATFORMS.map(name => {
    const result = (scan.results || []).find(r => r.platform === name);
    const analysis = analysisByPlatform.get(name);
    const response = result?.response || null;
    const userMentioned = analysis?.mentioned ?? false;
    // Per-platform competitor mention is not in the API type, so detect it in the
    // response text using the global competitor name.
    const competitorMentioned =
      !!competitor &&
      !!response &&
      response.toLowerCase().includes(competitor.toLowerCase());
    return { platform: name, response, userMentioned, competitorMentioned };
  });
}

// ── Summary bar derivation ──────────────────────────────────────────
function deriveSummary(scan: ScanResponse) {
  const cards = buildCards(scan);
  // Real counts only. The old code invented a mention count from the score
  // (score/100 × 11) and a competitor count as 60% of the platforms that
  // didn't mention you — neither was measured.
  const hasAnalysis = Array.isArray(scan.analysis) && scan.analysis.length > 0;
  const yourCount: number | null = hasAnalysis
    ? cards.filter(c => c.userMentioned).length
    : (typeof scan.mentionedCount === 'number' ? Math.min(12, scan.mentionedCount) : null);
  const compCount: number | null = hasAnalysis && scan.competitor
    ? cards.filter(c => c.competitorMentioned && !c.userMentioned).length
    : null;
  const responded = (scan.results || []).filter(r => r.response).length;

  // ax80: the same revenue model and inputs as the report page
  // (industry-adjusted customer value, country inquiries, complement share
  // over responding platforms) via lib/revenueModel.
  const estimate = scanRevenueEstimate({
    mentionedCount: yourCount,
    totalPlatforms: responded > 0 ? responded : (yourCount != null ? 12 : 0),
    industry: scan.industry ?? null,
    countryCode: scan.country_code || 'US',
  });
  const symbol = estimate?.symbol ?? getRevenueSymbol(getCountryConfig(scan.country_code || 'US'));
  const revenueGap = estimate?.gap ?? null;
  const revenueBasis = estimate ? revenueEstimateBasis(estimate) : null;

  return { yourCount, compCount, competitor: scan.competitor || null, symbol, revenueGap, revenueBasis };
}

// ── Response Card (shared presentational component) ─────────────────
function ResponseCard({
  platform,
  response,
  userMentioned,
  competitorMentioned,
}: {
  platform: string;
  response: string | null;
  userMentioned: boolean;
  competitorMentioned: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = userMentioned
    ? GREEN
    : competitorMentioned
    ? RED
    : GRAY;

  const LIMIT = 400;
  const isLong = !!response && response.length > LIMIT;
  const shown = response
    ? expanded || !isLong
      ? response
      : response.slice(0, LIMIT) + '…'
    : null;

  return (
    <div
      className="dash-card"
      style={{
        background: CARD,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ color: TEXT, fontSize: 15 }}>{platform}</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: borderColor,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {userMentioned ? 'You' : competitorMentioned ? 'Competitor' : '—'}
        </span>
      </div>
      {shown ? (
        <>
          <p style={{ color: TEXT, fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
            {shown}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: PURPLE,
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                fontWeight: 600,
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      ) : (
        <p style={{ color: MUTED, fontSize: 13, fontStyle: 'italic', margin: 0 }}>Not mentioned</p>
      )}
    </div>
  );
}

// ── Summary Bar (shared) ────────────────────────────────────────────
function Bar({ label, count, color }: { label: string; count: number; color: string }) {
  const pct = Math.round((count / 12) * 100);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: TEXT, fontSize: 14 }}>{label}</span>
        <span style={{ color: MUTED, fontSize: 14 }}>{count} of 12</span>
      </div>
      <div style={{ height: 10, background: BORDER, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export function SummaryBar({ scan }: { scan: ScanResponse }) {
  const { yourCount, compCount, competitor, symbol, revenueGap, revenueBasis } = deriveSummary(scan);
  return (
    <div
      className="dash-card"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
      }}
    >
      {yourCount != null ? (
        <Bar label="You appear in" count={yourCount} color={PURPLE} />
      ) : (
        <p style={{ color: MUTED, fontSize: 14, margin: '0 0 12px' }}>Your mention count wasn&apos;t measured for this search.</p>
      )}
      {compCount != null && (
        <Bar
          label={`${competitor || 'Top competitor'} appears in`}
          count={compCount}
          color={RED}
        />
      )}
      <div
        style={{
          marginTop: 8,
          paddingTop: 16,
          borderTop: `1px solid ${BORDER}`,
          color: TEXT,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        Estimated revenue gap:{' '}
        {revenueGap != null ? (
          <span style={{ color: RED }}>
            {symbol}
            {revenueGap.toLocaleString()}/month
          </span>
        ) : (
          <span style={{ color: MUTED }}>not measured</span>
        )}
        {revenueBasis && (
          <p style={{ color: MUTED, fontSize: 12, fontWeight: 400, margin: '6px 0 0' }}>{revenueBasis}</p>
        )}
      </div>
    </div>
  );
}

export function ResponseGrid({ scan }: { scan: ScanResponse }) {
  const cards = buildCards(scan);
  return (
    <div className="ai-inbox-grid">
      {cards.map(c => (
        <ResponseCard key={c.platform} {...c} />
      ))}
    </div>
  );
}

// ── Usage meter types + helpers ─────────────────────────────────────
interface UsageInfo {
  used: number;
  limit: number;
  remaining: number;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return 'recently';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function UsageMeter({ usage }: { usage: UsageInfo }) {
  const { used, limit, remaining } = usage;
  // b89e: branch on the meter model — never print the 999999
  // unlimited sentinel or a 0/0 "quota" (see lib/usageMeter).
  const model = usageMeterModel(used, limit, remaining);
  if (model.kind === 'excluded') {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>
          AI Inbox — not included in your current plan
        </span>
      </div>
    );
  }
  if (model.kind === 'unlimited') {
    return (
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>
            AI Inbox — Unlimited searches this month
          </span>
          <span style={{ color: MUTED, fontSize: 13 }}>Resets: {firstOfNextMonth()}</span>
        </div>
      </div>
    );
  }
  const usedPct = Math.min(100, Math.round((model.used / model.limit) * 100));
  const remainingPct = (model.remaining / model.limit) * 100;
  const color = remainingPct > 50 ? GREEN : remainingPct >= 25 ? '#f59e0b' : RED;
  return (
    <div
      className="dash-card"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: TEXT, fontSize: 14, fontWeight: 600 }}>
          AI Inbox — {model.remaining}/{model.limit} searches remaining this month
        </span>
        <span style={{ color: MUTED, fontSize: 13 }}>Resets: {firstOfNextMonth()}</span>
      </div>
      <div style={{ height: 10, background: BORDER, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${usedPct}%`, background: color, borderRadius: 6, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────
export default function AiInboxPage() {
  const supabase = getBrowserClient();
  const { plan, rawPlan, loading: planLoading } = usePlan();
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [limitModal, setLimitModal] = useState<LimitReachedData | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [confirmQuery, setConfirmQuery] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const normalized = normalizePlan(plan);
  const isFree = normalized === 'free';

  // Load user + recent searches + usage meter
  async function loadInitial() {
    setLoadError(false);
    setInitLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await loadRecent(uid);
        await loadUsage(uid);
      }
    } catch {
      setLoadError(true);
    } finally {
      setInitLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PART B — fetch usage meter; hide gracefully if unavailable.
  async function loadUsage(uid: string) {
    try {
      const res = await fetch(`/api/usage/summary?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) return;
      const data = await res.json();
      const ai = data?.summary?.ai_inbox;
      if (ai && typeof ai.limit === 'number') {
        setUsage({ used: ai.used ?? 0, limit: ai.limit, remaining: ai.remaining ?? Math.max(0, ai.limit - (ai.used ?? 0)) });
      }
    } catch {
      /* unavailable — leave meter hidden */
    }
  }

  async function loadRecent(uid: string) {
    try {
      const { data } = await supabase
        .from('ai_inbox_searches')
        .select('id, query, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(8);
      setRecent((data as RecentSearch[]) || []);
    } catch {
      setRecent([]);
    }
  }

  // Animate platform-name progress while scanning
  useEffect(() => {
    if (!loading) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => (p + 1) % (PLATFORMS.length + 1));
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  // PART C — submitting a NEW query shows the confirmation card first.
  function requestSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuery(trimmed);
    setConfirmQuery(trimmed);
  }

  // Core call to the unified, cost-protected route. Handles cache, usage,
  // 403/429 and success. fresh=true re-runs and charges a credit.
  async function executeSearch(q: string, fresh: boolean) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setConfirmQuery(null);
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setScan(null);
    setSavedId(null);
    setCopied(false);
    setCachedAt(null);

    try {
      const res = await fetch('/api/inbox/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, query: trimmed, fresh }),
      });
      const data = await res.json();

      // 403 plan_required — shouldn't happen (free is blocked) but redirect just in case.
      if (res.status === 403 && data?.error === 'plan_required') {
        window.location.href = data.upgradeUrl || '/pricing';
        return;
      }

      // 429 inbox_limit_reached — open the shared LimitReachedModal.
      if (res.status === 429 && data?.error === 'inbox_limit_reached') {
        setLimitModal({
          message: data.message,
          current: data.current,
          limit: data.limit,
          remaining: data.remaining,
          resetDate: data.resetDate,
          feature: 'AI Inbox searches',
        });
        setLoading(false);
        return;
      }

      if (!res.ok || data?.error) {
        setError(data?.message || data?.error || 'Search failed. Please try again.');
        setLoading(false);
        return;
      }

      // Success — server handled cache, usage, increment + save.
      setScan(data.results as ScanResponse);
      setSavedId((data.searchId as string) ?? null);
      if (data.cached) {
        setCachedAt((data.cachedAt as string) || new Date().toISOString());
      }
      if (data.usage && typeof data.usage.limit === 'number') {
        setUsage({
          used: data.usage.current ?? 0,
          limit: data.usage.limit,
          remaining: data.usage.remaining ?? Math.max(0, data.usage.limit - (data.usage.current ?? 0)),
        });
      } else if (userId) {
        // Cache hit returns no usage block — refresh from the summary endpoint.
        loadUsage(userId);
      }
      if (userId) await loadRecent(userId);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // D6: share copies the public inbox URL. Results are private until the
  // owner shares them, so publish this search first (owner-only POST).
  async function share() {
    if (savedId) {
      try {
        const r = await fetch(`/api/inbox/${savedId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'share' }),
        });
        if (!r.ok) {
          setError('Sharing is unavailable right now. Please try again later.');
          return;
        }
      } catch {
        setError('Sharing is unavailable right now. Please try again later.');
        return;
      }
    }
    const url = savedId
      ? `https://rankall.io/inbox/${savedId}`
      : 'https://rankall.io/dashboard/ai-inbox';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  // b89e: while the plan is still resolving, show a loading state —
  // never the gate. The gate below used to flash for every visitor
  // (plan reads 'free' mid-load), which is also why the first pass
  // saw a "contradiction": the flash, then the real page.
  if (planLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: MUTED, padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 15 }}>Loading…</p>
      </div>
    );
  }

  // PART A — free users get an upgrade gate instead of the inbox.
  if (isFree) {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
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
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
        <div
          className="dash-card"
          style={{
            maxWidth: 560,
            margin: '80px auto 0',
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}><svg viewBox="0 0 640 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M320 0c17.7 0 32 14.3 32 32l0 64 120 0c39.8 0 72 32.2 72 72l0 272c0 39.8-32.2 72-72 72l-304 0c-39.8 0-72-32.2-72-72l0-272c0-39.8 32.2-72 72-72l120 0 0-64c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224l16 0 0 192-16 0c-26.5 0-48-21.5-48-48l0-96c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 96c0 26.5-21.5 48-48 48l-16 0 0-192 16 0z"/></svg></div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px' }}>AI Inbox requires a paid plan</h1>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.6, margin: '0 0 28px' }}>
            See what all 12 AI platforms say about any business in real time. Available on Personal Brand plan and above.
          </p>
          <a
            href="/pricing"
            className="btn btn-blue"
            style={{ fontSize: 16 }}
          >
            Upgrade to Access AI Inbox <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <LimitReachedModal
        open={!!limitModal}
        onClose={() => setLimitModal(null)}
        data={limitModal || {}}
      />
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
        .ai-inbox-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 1024px) {
          .ai-inbox-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .ai-inbox-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav style={{ fontSize: 13, color: MUTED, marginBottom: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
          <span>›</span>
          <span style={{ color: TEXT }}>AI Inbox</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', margin: 0 }}>AI Inbox</h1>
          <p style={{ color: MUTED, fontSize: 16, marginTop: 8 }}>
            See what all 12 AI platforms say about any search right now
          </p>
        </header>

        {/* PART B — usage meter */}
        {plan !== rawPlan && (
          <div style={{ background: '#451a03', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '10px 16px', marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: '#fcd34d', fontWeight: 600, margin: 0 }}>
              Admin view — your account plan is {rawPlan}; AI Inbox is gated to paid plans for customers.
            </p>
          </div>
        )}
        {usage && <UsageMeter usage={usage} />}

        {/* Initial load error — friendly retry instead of blank */}
        {loadError && (
          <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></div>
            <h3 style={{ color: TEXT, marginBottom: 8 }}>Something went wrong</h3>
            <p style={{ marginBottom: 16 }}>We couldn't load your AI Inbox. Please try again.</p>
            <button
              onClick={loadInitial}
              className="btn btn-blue"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') requestSearch(query);
            }}
            placeholder="Try: best dentist in Chicago IL"
            style={{
              flex: 1,
              minWidth: 260,
              fontSize: 17,
              padding: '16px 18px',
              borderRadius: 12,
              border: `1px solid ${BORDER}`,
              background: CARD,
              color: TEXT,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => requestSearch(query)}
            disabled={loading}
            className="btn btn-blue"
            style={loading ? { background: LGRAY, cursor: 'not-allowed' } : undefined}
          >
            {loading ? 'Scanning…' : (<>Search All AI <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
          </button>
        </div>

        {/* Recent searches */}
        {recent.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <span className="lbl" style={{ marginRight: 8 }}>Recent searches:</span>
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {recent.map(r => (
                <button
                  key={r.id}
                  onClick={() => executeSearch(r.query, false)}
                  style={{
                    fontSize: 13,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: `1px solid ${BORDER}`,
                    background: CARD,
                    color: TEXT,
                    cursor: 'pointer',
                  }}
                >
                  {r.query}
                </button>
              ))}
            </span>
          </div>
        )}

        {/* PART C — confirmation card before spending a credit */}
        {confirmQuery && !loading && (
          <div
            className="dash-card"
            style={{
              background: CARD,
              border: `1px solid ${PURPLE}`,
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}><svg viewBox="0 0 640 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M320 0c17.7 0 32 14.3 32 32l0 64 120 0c39.8 0 72 32.2 72 72l0 272c0 39.8-32.2 72-72 72l-304 0c-39.8 0-72-32.2-72-72l0-272c0-39.8 32.2-72 72-72l120 0 0-64c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224l16 0 0 192-16 0c-26.5 0-48-21.5-48-48l0-96c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 96c0 26.5-21.5 48-48 48l-16 0 0-192 16 0z"/></svg> Run AI Inbox Search</p>
            <p style={{ color: TEXT, fontSize: 15, margin: '0 0 8px' }}>
              Query: “{confirmQuery}”
            </p>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
              This will scan 12 AI platforms, use 1 AI Inbox credit, and may take a minute or two.
            </p>
            {usage && (
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
                {usageMeterModel(usage.used, usage.limit, usage.remaining).kind === 'unlimited'
                  ? 'Your plan includes unlimited AI Inbox searches this month.'
                  : usageMeterModel(usage.used, usage.limit, usage.remaining).kind === 'counted'
                    ? <>Your usage: {usage.used} of {usage.limit}. Remaining: {usage.remaining}. Resets {firstOfNextMonth()}.</>
                    : 'AI Inbox is not included in your current plan.'}
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => { setConfirmQuery(null); }}
                className="btn btn-line"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSearch(confirmQuery, false)}
                className="btn btn-blue"
              >
                Run Search <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="dash-card"
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: 32,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Scanning 12 AI platforms…</p>
            <p style={{ color: MUTED, fontSize: 14, marginTop: 8 }}>This can take up to ~45 seconds.</p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'center',
                marginTop: 20,
              }}
            >
              {PLATFORMS.map((p, i) => (
                <span
                  key={p}
                  style={{
                    fontSize: 13,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: `1px solid ${BORDER}`,
                    background: i < progress ? PURPLE : 'transparent',
                    color: i < progress ? '#fff' : MUTED,
                    transition: 'all 0.3s',
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            style={{
              background: RED_BG,
              border: `1px solid ${RED}`,
              borderRadius: 12,
              padding: 16,
              color: RED_TEXT,
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        {scan && !loading && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>
                Results for “{scan.query || query}”
              </h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {cachedAt && (
                <>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '8px 14px',
                      borderRadius: 999,
                      background: FIX_BG,
                      color: BLUE,
                    }}
                  >
                    <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M50.7 58.5L0 160l208 0 0-128L93.7 32C75.5 32 58.9 42.3 50.7 58.5zM240 160l208 0L397.3 58.5C389.1 42.3 372.5 32 354.3 32L240 32l0 128zm208 32L0 192 0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-224z"/></svg> Cached result from {relativeTime(cachedAt)}
                  </span>
                  <button
                    onClick={() => executeSearch(scan.query || query, true)}
                    className="btn btn-line"
                  >
                    Run fresh search
                  </button>
                </>
              )}
              <button
                onClick={share}
                className="btn btn-line"
                style={{ borderColor: PURPLE, color: PURPLE }}
              >
                {copied ? (<>Copied!{' '}<svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></>) : 'Share Results'}
              </button>
              </div>
            </div>
            <SummaryBar scan={scan} />
            <ResponseGrid scan={scan} />
          </>
        )}

        {/* Empty state — no searches yet */}
        {!initLoading && !loadError && !loading && !scan && !confirmQuery && recent.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M121 32C91.6 32 66 52 58.9 80.5L1.9 308.4C.6 313.5 0 318.7 0 323.9L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-92.1c0-5.2-.6-10.4-1.9-15.5l-57-227.9C446 52 420.4 32 391 32L121 32zm0 64l270 0 48 192-51.2 0c-12.1 0-23.2 6.8-28.6 17.7l-14.3 28.6c-5.4 10.8-16.5 17.7-28.6 17.7l-120.4 0c-12.1 0-23.2-6.8-28.6-17.7l-14.3-28.6c-5.4-10.8-16.5-17.7-28.6-17.7L73 288 121 96z"/></svg></div>
            <h3 style={{ color: TEXT, marginBottom: 8 }}>No searches yet</h3>
            <p style={{ marginBottom: 16 }}>Search any business above to see what all 12 AI platforms say about them.</p>
          </div>
        )}
      </div>
    </div>
  );
}
