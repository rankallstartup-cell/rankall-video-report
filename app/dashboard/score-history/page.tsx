'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
// b8a7: strip SEO taglines from stored business names for display
// ("Royal Lane Dental Center - Best Dentist in Dallas | ..." →
// "Royal Lane Dental Center"). Same helper the Trust page uses (b8ad).
import { coreBusinessName } from '@/lib/trust';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const RED    = '#DC2626';
const PURPLE = '#1B17FF';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';

const scoreCol = (s: number) => s >= 70 ? GREEN : s >= 40 ? '#D97706' : RED;

interface Scan {
  id: string;
  created_at: string;
  overall_score: number;
  competitor_score: number | null;
  competitor_name: string | null;
  business_input: string | null;
}

function Breadcrumb({ page }: { page: string }) {
  return (
    <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
      <Link href="/dashboard" style={{ color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
      <span style={{ margin: '0 8px', color: LGRAY }}>›</span>
      <span>{page}</span>
    </nav>
  );
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

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function ScoreHistoryPage() {
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  // b8a7: selector groups are (business, query-set) pairs, not raw query
  // strings — see the grouping in load(). key = group identity,
  // label = what the user sees ("Business — “query”").
  const [groups, setGroups] = useState<{ key: string; label: string; businessName: string; query: string }[]>([]);
  const [allTimeBest, setAllTimeBest] = useState<number | null>(null);

  async function load() {
    setLoadError(false);
    setLoaded(false);
    try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoaded(true); return; }
        setSignedIn(true);

        // Distinct businesses (most-recent first) for the selector.
        let uniqueBusinesses: string[] = [];
        try {
          const { data: bizData } = await supabase
            .from('score_history')
            .select('business_input, created_at')
            .eq('user_id', session.user.id)
            .not('business_input', 'is', null)
            .order('created_at', { ascending: false });
          // Most-recent-first, de-duplicated, capped at 10 so the dropdown stays
          // usable instead of listing 60+ raw query strings.
          uniqueBusinesses = ([...new Set((bizData ?? []).map((b: any) => b.business_input).filter(Boolean))] as string[]).slice(0, 10);
          if (uniqueBusinesses.length > 0) setGroups(uniqueBusinesses.map(b => ({ key: b, label: b, businessName: b, query: b })));
        } catch { /* score_history may not exist */ }

        // All-time best score across every business (not just the selected one).
        try {
          const { data: bestRow } = await supabase
            .from('score_history')
            .select('overall_score')
            .eq('user_id', session.user.id)
            .not('overall_score', 'is', null)
            .order('overall_score', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (bestRow && (bestRow as any).overall_score != null) setAllTimeBest((bestRow as any).overall_score);
        } catch { /* non-fatal */ }

        // Scope every view to one business (default: the most recent).
        const targetBusiness = selectedBusiness ?? uniqueBusinesses[0] ?? null;
        if (!selectedBusiness && targetBusiness) setSelectedBusiness(targetBusiness);

        let rows: Scan[] | null = null;

        // Optional dedicated table — never crash if missing
        try {
          let q = supabase
            .from('score_history')
            .select('id, created_at, overall_score, competitor_score, competitor_name, business_input, basket_hash')
            .eq('user_id', session.user.id);
          if (targetBusiness) q = q.eq('business_input', targetBusiness);
          const { data: hist, error } = await q.order('created_at', { ascending: true });
          if (!error && hist && hist.length > 0) {
            // P0c: trend only within the same basket — keep the latest basket's series.
            const latestBasket = [...hist].reverse().find((r: any) => r.basket_hash)?.basket_hash ?? null;
            rows = (latestBasket ? (hist as any[]).filter(r => r.basket_hash === latestBasket) : hist) as Scan[];
          }
        } catch { /* table may not exist */ }

        if (!rows) {
          // Fallback to rankall_scans.
          // b8a7: group by (business, query set), NOT by the raw query
          // string. The old exact-string grouping split one business's
          // history across capitalisation/wording variants of the query
          // ("best dentist in Dallas, TX" vs "Best dentist in Dallas")
          // and never named the business at all. The query set is the
          // scan's basket_hash (P0c: never trend across baskets); the
          // business is user_business_name. Rows without a basket fall
          // back to the normalised query string.
          let res = await supabase
            .from('rankall_scans')
            .select('id, created_at, overall_score, competitor_score, competitor_name, input, user_business_name, basket_hash')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true });
          if (res.error) {
            res = await supabase
              .from('rankall_scans')
              .select('id, created_at, overall_score, competitor_score, competitor_name, input')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: true }) as typeof res;
          }
          if (res.error) {
            res = await supabase
              .from('rankall_scans')
              .select('id, created_at, overall_score, input')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: true }) as typeof res;
          }
          let list = (res.data ?? []) as any[];

          const bizOf = (r: any): string => (r.user_business_name as string) || (r.input as string) || '';
          const keyOf = (r: any): string => {
            const biz = bizOf(r);
            return r.basket_hash
              ? `${biz}||${r.basket_hash}`
              : `${biz}||q:${((r.input as string) || '').trim().toLowerCase()}`;
          };

          // True all-time best across ALL the user's scans — the stat
          // card used to fall back to the current group's best while
          // still labelled "All-time best".
          if (allTimeBest == null && list.length > 0) {
            setAllTimeBest(Math.max(...list.map((r: any) => r.overall_score ?? 0)));
          }

          // Build the selector groups, most recent first.
          let derived = groups;
          if (derived.length === 0 && list.length > 0) {
            const seen = new Set<string>();
            derived = [];
            for (const r of [...list].reverse()) {
              const k = keyOf(r);
              if (seen.has(k)) continue;
              seen.add(k);
              const bizName = coreBusinessName(bizOf(r));
              const q = (r.input as string) || '';
              derived.push({
                key: k,
                businessName: bizName,
                query: q,
                label: q && q !== bizOf(r) ? `${bizName} — “${q}”` : bizName,
              });
              if (derived.length >= 10) break;
            }
            if (derived.length > 0) setGroups(derived);
          }

          const targetGroup = derived.find(g => g.key === selectedBusiness) ?? derived[0] ?? null;
          if (!selectedBusiness && targetGroup) setSelectedBusiness(targetGroup.key);
          if (targetGroup) list = list.filter((r: any) => keyOf(r) === targetGroup.key);
          rows = list.map((r: any) => ({
            id: r.id,
            created_at: r.created_at,
            overall_score: r.overall_score ?? 0,
            competitor_score: r.competitor_score ?? null,
            competitor_name: r.competitor_name ?? null,
            business_input: r.input ?? null,
          }));
        }
        setScans(rows);
      } catch {
        setLoadError(true);
      }
      setLoaded(true);
  }

  useEffect(() => {
    load();
    // Re-scope chart + table + stats when the user picks a different business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusiness]);

  function exportCSV() {
    const header = ['Date', 'Score', 'Top Competitor', 'Change'];
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = scans.map((s, i) => {
      const prev = i > 0 ? scans[i - 1].overall_score : null;
      const change = prev == null ? '' : String(s.overall_score - prev);
      return [q(fmtDate(s.created_at)), s.overall_score, q(s.competitor_name ?? ''), change].join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rankall-score-history.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!loaded) return <div style={{ padding: '48px 32px', textAlign: 'center', color: GRAY }}>Loading…</div>;

  if (loadError) {
    return (
      <div style={{ padding: '32px 32px 80px', maxWidth: 900, margin: '0 auto' }}>
        <Breadcrumb page="Score History" />
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 40, marginBottom: 12, color: '#DC2626' }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></div>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Something went wrong</p>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: 20, lineHeight: 1.7 }}>We couldn't load your score history. Please try again.</p>
          <button onClick={load} style={{ background: PURPLE, color: 'white', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Try Again</button>
        </div>
      </div>
    );
  }

  // b8a7: signed-out visitors get a sign-in gate. The old code showed
  // them the SAME "No score history yet" card as a signed-in user with
  // no scans — a false empty state (it implied THEY had no history).
  if (!signedIn) {
    return (
      <div style={{ padding: '32px 32px 80px', maxWidth: 900, margin: '0 auto' }}>
        <Breadcrumb page="Score History" />
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to view your score history</p>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
            Your score history is tied to your account — sign in to see your scans over time, or run a free scan to get your first score.
          </p>
          <Link href="/login?next=/dashboard/score-history" style={{ display: 'inline-block', background: PURPLE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div style={{ padding: '32px 32px 80px', maxWidth: 900, margin: '0 auto' }}>
        <Breadcrumb page="Score History" />
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 40, marginBottom: 16, color: BLUE }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg></div>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>No score history yet</p>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
            Run your first scan to start tracking your AI visibility score over time.
          </p>
          <Link href="/" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
            Run your first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </Link>
        </div>
      </div>
    );
  }

  // Chart geometry
  const VW = 720, VH = 240;
  const PL = 40, PR = 20, PT = 16, PB = 36;
  const CW = VW - PL - PR;
  const CH = VH - PT - PB;
  const yPos = (s: number) => PT + CH - (Math.max(0, Math.min(100, s)) / 100) * CH;
  const xPos = (i: number) => scans.length <= 1 ? PL + CW / 2 : PL + (i / (scans.length - 1)) * CW;

  const userPts = scans.map((s, i) => ({ x: xPos(i), y: yPos(s.overall_score) }));
  const compPts = scans.filter(s => s.competitor_score != null).map((s) => {
    const i = scans.indexOf(s);
    return { x: xPos(i), y: yPos(s.competitor_score as number) };
  });
  const hasComp = compPts.length > 1;

  // Biggest jump
  let bestJumpIdx = -1, bestJump = 0;
  for (let i = 1; i < scans.length; i++) {
    const d = scans[i].overall_score - scans[i - 1].overall_score;
    if (d > bestJump) { bestJump = d; bestJumpIdx = i; }
  }

  const bestScore = Math.max(...scans.map(s => s.overall_score));
  // b8a7: "Days tracking" counts the distinct days (as displayed in the
  // table) that have scans in this set — the old elapsed-days rounding
  // showed 1 for a set spanning Oct 14–15, which reads as wrong next to
  // a table showing two different dates.
  const daysTracking = Math.max(1, new Set(scans.map(s => fmtDate(s.created_at))).size);
  const currentGroup = groups.find(g => g.key === selectedBusiness) ?? groups[0] ?? null;

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb page="Score History" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{<svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg>}{' '} Score History</h1>
          <p style={{ fontSize: 14, color: GRAY }}>
            {currentGroup
              ? <>Scans for <strong style={{ color: NAVY }}>{currentGroup.businessName}</strong> with the same query set, plotted over time.</>
              : 'Scans for this business with the same query set, plotted over time.'}
          </p>
        </div>
        <button onClick={exportCSV}
          style={{ background: NAVY, border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          Export CSV (this query set)
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: GREEN, lineHeight: 1, marginBottom: 4 }}>{bestScore}</p>
          <p style={{ fontSize: 12, color: LGRAY }}>Best (this query set)</p>
        </div>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: NAVY, lineHeight: 1, marginBottom: 4 }}>{allTimeBest ?? bestScore}</p>
          <p style={{ fontSize: 12, color: LGRAY }}>All-time best</p>
        </div>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: BLUE, lineHeight: 1, marginBottom: 4 }}>{daysTracking}</p>
          <p style={{ fontSize: 12, color: LGRAY }}>Days tracking (this query set)</p>
        </div>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: PURPLE, lineHeight: 1, marginBottom: 4 }}>{scans.length}</p>
          <p style={{ fontSize: 12, color: LGRAY }}>Total scans (this query set)</p>
        </div>
      </div>

      {/* Business selector — b8a7: options are (business — query) groups */}
      {groups.length > 1 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Tracking:</label>
          <select
            value={selectedBusiness || ''}
            onChange={e => setSelectedBusiness(e.target.value)}
            style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#0A0A14', cursor: 'pointer', maxWidth: 340 }}
          >
            {groups.map(g => (<option key={g.key} value={g.key}>{g.label.length > 52 ? g.label.slice(0, 52) + '...' : g.label}</option>))}
          </select>
        </div>
      )}

      {/* Line chart */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: BLUE }}>● Your score</span>
          {hasComp && <span style={{ fontSize: 12, fontWeight: 600, color: RED }}>● Competitor</span>}
        </div>
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, 25, 50, 75, 100].map(g => (
            <g key={g}>
              <line x1={PL} y1={yPos(g)} x2={PL + CW} y2={yPos(g)} stroke={BORDER} strokeWidth={g === 0 ? 1.5 : 1} strokeDasharray={g === 0 ? undefined : '3 3'} />
              <text x={PL - 8} y={yPos(g) + 4} textAnchor="end" fontSize={10} fill={LGRAY}>{g}</text>
            </g>
          ))}
          {hasComp && <path d={smoothPath(compPts)} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />}
          {userPts.length > 1 && <path d={smoothPath(userPts)} fill="none" stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
          {userPts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={BLUE} stroke="#fff" strokeWidth={1.5} />
          ))}
          {/* biggest jump label — b8a7: labelled, so it is not read as the
              latest change (the old bare "+4 pts" sat mid-chart while the
              latest row's CHANGE was 0) */}
          {bestJumpIdx >= 0 && bestJump > 0 && (
            <text x={userPts[bestJumpIdx].x} y={userPts[bestJumpIdx].y - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill={GREEN}>Biggest jump +{bestJump} pts</text>
          )}
          {/* x labels */}
          {scans.map((s, i) => {
            if (scans.length > 8 && i % Math.ceil(scans.length / 8) !== 0 && i !== scans.length - 1) return null;
            return <text key={i} x={xPos(i)} y={VH - 8} textAnchor="middle" fontSize={9} fill={LGRAY}>{fmtShort(s.created_at)}</text>;
          })}
        </svg>
      </div>

      {/* Table */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,.6fr) minmax(0,2fr) minmax(0,.7fr)', gap: 10, background: BG, padding: '12px 18px', borderBottom: `1px solid ${BORDER}` }}>
          {['Date', 'Score', 'Top Competitor', 'Change'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
          ))}
        </div>
        {[...scans].reverse().map((s, ri) => {
          const idx = scans.length - 1 - ri;
          const prev = idx > 0 ? scans[idx - 1].overall_score : null;
          const change = prev == null ? null : s.overall_score - prev;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,.6fr) minmax(0,2fr) minmax(0,.7fr)', gap: 10, padding: '12px 18px', borderBottom: ri < scans.length - 1 ? `1px solid ${BORDER}` : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: GRAY }}>{fmtDate(s.created_at)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: scoreCol(s.overall_score) }}>{s.overall_score}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: s.competitor_name ? NAVY : LGRAY }}>{s.competitor_name || '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: change == null ? LGRAY : change > 0 ? GREEN : change < 0 ? RED : GRAY }}>
                {change == null ? '—' : change > 0 ? `+${change}` : change < 0 ? `${change}` : '0'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
