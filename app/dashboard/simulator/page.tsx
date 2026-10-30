'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import {
  calculateSimulation,
  projectScore,
  confidenceColor,
  basisFromCounts,
  SIMULATOR_DISCLAIMER,
  type SimulatorFix,
  type SimulatorInput,
  type ProjectionBasis,
} from '@/lib/simulator';
import {
  getCountryConfig,
  getRevenueSymbol,
  getAvgCustomerValue,
} from '@/lib/countryConfig';
import { scanRevenueEstimate } from '@/lib/revenueModel';

// Palette
const PURPLE = '#1B17FF';
const BLUE = '#1B17FF';
const RED = '#ef4444';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const NAVY = '#0A0A14';
const WHITE = '#fff';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';
const BG = '#F8FAFC';

const DEFAULT_FIXES: SimulatorFix[] = [
  { id: 'faq_schema', title: 'FAQ Schema', fix_type: 'faq_schema' },
  { id: 'directory', title: 'Directory Network', fix_type: 'directory_citations' },
  { id: 'reviews', title: 'Review Velocity', fix_type: 'review_velocity' },
  { id: 'content', title: 'Content Optimization', fix_type: 'content_optimization' },
  { id: 'trust', title: 'Trust Signals', fix_type: 'trust_signals' },
];

interface SeedData {
  currentScore: number;
  industry: string;
  city: string;
  countryCode: string;
  competitorScore: number | null; // measured competitor score when the scan recorded one; never a fallback
  platformsCovered: number;
  fixes: SimulatorFix[];
  // b8aa: provenance — the page never named the business or the scan it
  // projects from, so the projection could not be tied to a real scan.
  businessName: string;
  scanInput: string;
  scanDate: string;
}

const TOTAL_PLATFORMS = 12;

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

export default function SimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState<SeedData | null>(null);
  // b8aa: session awareness — logged-out visitors used to get the
  // "We need a scan" empty state (no sign-in message at all).
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [basis, setBasis] = useState<ProjectionBasis | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Revenue calculator sliders
  const [inquiries, setInquiries] = useState(120);
  const [customerValue, setCustomerValue] = useState(800);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setSignedIn(false);
            setSeed(null);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setSignedIn(true);

        const { data: scan } = await supabase
          .from('rankall_scans')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!scan) {
          if (!cancelled) {
            setSeed(null);
            setLoading(false);
          }
          return;
        }

        const row = scan as Record<string, unknown>;
        const countryCode = (row.country_code as string) || 'US';
        // No invented industry ('dental' used to be assumed, which skewed the
        // customer-value estimate); unknown → the country's general value.
        const industry = (row.industry as string) || '';
        const city = (row.location as string) || '';
        const currentScore = Math.round(num(row.overall_score, 0));

        // Competitor: the scan row's measured competitor_score when present.
        // No fallback is invented — without a measured score there is no
        // competitor line, crossover week, or gap claim anywhere on this page.
        const enrichment = (row.enrichment as Record<string, unknown>) || {};
        const compRaw = row.competitor_score ?? (enrichment.competitor_score as unknown);
        const competitorScore = typeof compRaw === 'number' ? Math.round(compRaw) : null;

        // Platforms currently covered from mentioned_count (0 when unrecorded).
        const platformsCovered = Math.min(
          TOTAL_PLATFORMS,
          Math.max(0, Math.round(num(row.mentioned_count, 0))),
        );

        // Fixes attached to scan, else default set.
        let fixes: SimulatorFix[] = DEFAULT_FIXES;
        const rawFixes = row.fixes as unknown;
        if (Array.isArray(rawFixes) && rawFixes.length > 0) {
          fixes = (rawFixes as Record<string, unknown>[]).map((f, i) => ({
            id: (f.id as string) || `fix_${i}`,
            title: (f.title as string) || `Fix ${i + 1}`,
            fix_type: (f.fix_type as string) || 'content_optimization',
          }));
        }

        const cfg = getCountryConfig(countryCode);

        if (!cancelled) {
          setUserId(user.id);
          setScanId((row.id as string) ?? null);
          setSeed({
            currentScore,
            industry,
            city,
            countryCode,
            competitorScore,
            platformsCovered,
            fixes,
            // b8aa: provenance — tie the projection to the scan it seeds from.
            businessName: (row.user_business_name as string) || (row.input as string) || '',
            scanInput: (row.input as string) || '',
            scanDate: (row.created_at as string) || '',
          });

          // Fetch the real data basis for this projection (verified outcomes →
          // similar businesses → industry average → honest fallback estimate).
          fetch('/api/simulator/basis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ industry, countryCode, fixType: fixes[0]?.fix_type || '' }),
          })
            .then((r) => r.json())
            .then((b: ProjectionBasis) => { if (!cancelled && b && b.basisType) setBasis(b); })
            .catch(() => { /* basis stays null → UI shows estimate fallback */ });
          // default all checked
          const init: Record<string, boolean> = {};
          fixes.forEach((f) => (init[f.id] = true));
          setChecked(init);
          setInquiries(cfg.monthlyAIInquiries);
          // Clamp to a sane range — never seed an absurd value.
          const seededValue = getAvgCustomerValue(industry, countryCode);
          setCustomerValue(Math.min(Math.max(50, seededValue), 50000));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSeed(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cfg = seed ? getCountryConfig(seed.countryCode) : getCountryConfig('US');
  const revenueSymbol = getRevenueSymbol(cfg);

  // STABLE slider bounds for the customer-value slider — derived from the seed
  // country's base value, NOT from the live customerValue. Deriving min/max from
  // the value itself let the slider ratchet up exponentially on each drag
  // (e.g. all the way to $96M) and made the thumb jump around.
  const baseCustomerValue = seed ? getAvgCustomerValue(seed.industry, seed.countryCode) : 800;
  const valueSliderMin = 50;
  const valueSliderMax = Math.max(2000, Math.round(baseCustomerValue * 5));

  // Checked fixes
  const checkedFixes = useMemo(
    () => (seed ? seed.fixes.filter((f) => checked[f.id]) : []),
    [seed, checked],
  );

  // ax80: ONE revenue model — the report's complement model over the
  // MENTION RATE (platforms that mention you / all platforms), not the
  // score treated as a share. The sliders only override the two estimate
  // inputs (inquiries, customer value).
  const sliderRevenueGap = seed
    ? (scanRevenueEstimate({
        mentionedCount: seed.platformsCovered,
        totalPlatforms: TOTAL_PLATFORMS,
        industry: seed.industry,
        countryCode: seed.countryCode,
        avgCustomerValue: customerValue,
        monthlyAIInquiries: inquiries,
      })?.gap ?? 0)
    : 0;

  // Main simulation over checked fixes
  const sim = useMemo(() => {
    if (!seed) return null;
    const input: SimulatorInput = {
      currentScore: seed.currentScore,
      industry: seed.industry,
      city: seed.city,
      countryCode: seed.countryCode,
      competitorScore: seed.competitorScore,
      platformsCovered: seed.platformsCovered,
      fixes: checkedFixes,
      revenueGap: sliderRevenueGap,
      revenueSymbol,
    };
    return calculateSimulation(input);
  }, [seed, checkedFixes, sliderRevenueGap, revenueSymbol]);

  // Per-fix mid points (full set, for labels) — compute individually so each
  // label shows that fix's own contribution and timeline.
  // b8aa: a fix with NO canonical impact produces no projection row — the
  // old fallback rendered that as "(+0 pts, Week 0)", which reads as a
  // measured zero. It is labelled "impact not estimated" instead.
  const fixMeta = useMemo(() => {
    if (!seed) return {};
    const out: Record<string, { midPts: number; weekEnd: number; notEstimated: boolean }> = {};
    seed.fixes.forEach((f) => {
      const single = calculateSimulation({
        currentScore: seed.currentScore,
        industry: seed.industry,
        city: seed.city,
        countryCode: seed.countryCode,
        competitorScore: seed.competitorScore,
        platformsCovered: seed.platformsCovered,
        fixes: [f],
        revenueGap: 0,
        revenueSymbol,
      });
      const p = single.fixProjections[0];
      out[f.id] = {
        midPts: p ? p.pointsGained : 0,
        weekEnd: p ? p.weekEnd : 0,
        notEstimated: !p,
      };
    });
    return out;
  }, [seed, revenueSymbol]);

  // Cumulative projection series for the chart (week -> score)
  const projection = useMemo(() => {
    if (!sim || !seed) return { points: [] as { week: number; score: number }[], totalWeeks: 0 };
    const totalWeeks = sim.totalWeeks;
    const points: { week: number; score: number }[] = [
      { week: 0, score: seed.currentScore },
    ];
    let gained = 0;
    // fixProjections are chronological by weekEnd
    for (const fp of sim.fixProjections) {
      // b02b: the chart uses the engine's projection rule (lib/projection):
      // capped at PROJECTION_CAP but never below the current score — the
      // old min(cap, running + pts) drew a 90 falling to 85.
      gained += fp.pointsGained;
      points.push({ week: fp.weekEnd, score: projectScore(seed.currentScore, gained) });
    }
    return { points, totalWeeks };
  }, [sim, seed]);

  // Crossover week: first week cumulative score exceeds the measured competitor
  const crossoverWeek = useMemo(() => {
    if (!seed || seed.competitorScore == null) return null;
    for (const p of projection.points) {
      if (p.score > seed.competitorScore) return p.week;
    }
    return null;
  }, [projection, seed]);

  // b8aa: ONE data-basis object for every surface (bar, share payload,
  // footer). When the basis API has not answered (or failed), the honest
  // fallback is the estimate tier from basisFromCounts(0,0,0) — the old
  // code fell back to sim.confidence (a DIFFERENT quantity: the average
  // fix-impact confidence), which is how two unrelated "confidence"
  // numbers ended up on the page at once.
  const effBasis: ProjectionBasis = basis ?? basisFromCounts(0, 0, 0, seed?.industry ?? '', seed?.countryCode ?? 'US');

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }

  // ax8r: "Copy page link" used to copy window.location.href — the
  // login-gated dashboard URL, so recipients landed on their own scan (or a
  // login wall). Copy/email now use the PUBLIC share URL, creating it first
  // when it doesn't exist yet.
  async function createShareUrl(): Promise<string | null> {
    if (shareUrl) return shareUrl;
    if (!sim || !seed) return null;
    setSharing(true);
    try {
      const res = await fetch('/api/simulator/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId, userId,
          projectionData: {
            businessType: seed.industry,
            city: seed.city,
            currentScore: seed.currentScore,
            projectedScoreMin: sim.projectedScoreMin,
            projectedScoreMax: sim.projectedScoreMax,
            projectedScoreMid: sim.projectedScoreMid,
            confidence: effBasis.confidence,
            basisLabel: effBasis.label,
            totalWeeks: sim.totalWeeks,
            revenueSymbol,
            revenueRecovered: sim.revenueRecovered,
            revenueRecoveredAnnual: sim.revenueRecoveredAnnual,
            fixProjections: sim.fixProjections,
          },
          currentScore: seed.currentScore,
          projectedScore: sim.projectedScoreMid,
          revenueRecovered: sim.revenueRecovered,
          industry: seed.industry,
          isPublic: true,
        }),
      });
      const data = await res.json();
      if (data.url) {
        setShareUrl(data.url);
        return data.url as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    const url = await createShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function shareProjection() {
    const url = await createShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  async function emailToMyself() {
    const url = (await createShareUrl()) ?? window.location.href;
    const subject = encodeURIComponent('My AI Visibility Roadmap — Rankall');
    const body = encodeURIComponent(
      `My projected AI visibility roadmap:\n\n${url}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  // ── Render states ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: GRAY }}>
        Loading your roadmap…
      </div>
    );
  }

  // b8aa: signed-out visitors get a sign-in gate — the no-scan state below
  // is for signed-in accounts without a scan, and showing it to anonymous
  // visitors gave them no login message at all.
  if (signedIn === false) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, marginBottom: 12 }}>
          Your AI Visibility Roadmap
        </h1>
        <p style={{ color: GRAY, marginBottom: 24, fontSize: 15 }}>
          Sign in to view your roadmap. Your projection is seeded from your own latest scan — sign in to see it, or run a free scan to get your first score.
        </p>
        <Link
          href="/login?next=/dashboard/simulator"
          style={{
            display: 'inline-block',
            background: PURPLE,
            color: WHITE,
            padding: '12px 24px',
            borderRadius: 10,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!seed || !sim) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg></div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, marginBottom: 12 }}>
          Your AI Visibility Roadmap
        </h1>
        <p style={{ color: GRAY, marginBottom: 24, fontSize: 15 }}>
          We need a scan to seed your projections.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: PURPLE,
            color: WHITE,
            padding: '12px 24px',
            borderRadius: 10,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Run your first scan to unlock your roadmap <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    );
  }

  // ── Score dial geometry ────────────────────────────────────────────────
  const dialSize = 200;
  const stroke = 16;
  const radius = (dialSize - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const projectedScore = sim.projectedScoreMid;
  const dialFraction = Math.min(1, projectedScore / 100);
  const dashOffset = circ * (1 - dialFraction);

  // ── Chart geometry ─────────────────────────────────────────────────────
  const chartW = 640;
  const chartH = 260;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const maxWeek = Math.max(1, projection.totalWeeks);
  const xFor = (week: number) => padL + (week / maxWeek) * innerW;
  const yFor = (score: number) => padT + (1 - score / 100) * innerH;
  const compScore = seed.competitorScore;
  const competitorY = compScore != null ? yFor(compScore) : null;

  const linePath = projection.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.week)} ${yFor(p.score)}`)
    .join(' ');

  // Green shade polygon: region under projected line where it's above competitor.
  // Only rendered when a measured competitor score exists.
  const abovePoints = compScore != null ? projection.points.filter((p) => p.score > compScore) : [];
  let greenPath = '';
  if (abovePoints.length > 0 && competitorY != null) {
    const startWeek = crossoverWeek ?? abovePoints[0].week;
    const segPoints = projection.points.filter((p) => p.week >= startWeek);
    if (segPoints.length > 0) {
      greenPath =
        `M ${xFor(segPoints[0].week)} ${competitorY} ` +
        segPoints.map((p) => `L ${xFor(p.week)} ${yFor(p.score)}`).join(' ') +
        ` L ${xFor(segPoints[segPoints.length - 1].week)} ${competitorY} Z`;
    }
  }

  const card: React.CSSProperties = {
    background: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  };
  const h2: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 800,
    color: NAVY,
    marginBottom: 16,
  };

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav style={{ fontSize: 13, color: '#64748B', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: '#1B17FF', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
          <span>›</span>
          <span>Simulator</span>
        </nav>

        {/* 1. HERO */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-block',
              background: '#ECEBFF',
              color: PURPLE,
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 100,
              marginBottom: 12,
            }}
          >
            <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg> Recommendation Simulator
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>
            Your AI Visibility Roadmap
          </h1>
          <p style={{ fontSize: 16, color: GRAY, margin: 0 }}>
            See your projected AI visibility improvement — seeded from your latest scan and Rankall&apos;s fix-impact data.
          </p>
          {/* b8aa: provenance — name the business and the scan this
              projection is seeded from (the page showed numbers only). */}
          {seed.businessName && (
            <p style={{ fontSize: 13, color: GRAY, margin: '8px 0 0' }}>
              Projection for <strong style={{ color: NAVY }}>{seed.businessName}</strong>
              {seed.scanInput && <> — from your scan of &ldquo;{seed.scanInput}&rdquo;</>}
              {seed.scanDate && <> on {new Date(seed.scanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}.
            </p>
          )}
        </div>

        {/* 2 + 3 : Dial and checkbox list side by side */}
        <div style={{ ...card, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Score dial — may shrink to the screen width on phones */}
          <div style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%', textAlign: 'center' }}>
            <svg width={dialSize} height={dialSize}>
              <circle
                cx={dialSize / 2}
                cy={dialSize / 2}
                r={radius}
                fill="none"
                stroke={BORDER}
                strokeWidth={stroke}
              />
              <circle
                cx={dialSize / 2}
                cy={dialSize / 2}
                r={radius}
                fill="none"
                stroke={PURPLE}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${dialSize / 2} ${dialSize / 2})`}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                style={{ fontSize: 44, fontWeight: 900, fill: NAVY }}
              >
                {projectedScore}
              </text>
              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                style={{ fontSize: 13, fontWeight: 600, fill: GRAY }}
              >
                projected /100
              </text>
            </svg>
            <div style={{ marginTop: 8, fontSize: 13, color: GRAY }}>
              From <strong style={{ color: NAVY }}>{sim.currentScore}</strong> →{' '}
              <strong style={{ color: PURPLE }}>{projectedScore}</strong>{' '}
              ({sim.gradeBeforeLabel} → {sim.gradeAfterLabel})
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: GRAY }}>
              {sim.noFixesYet
                ? 'No fixes selected or generated yet — the projection equals your current score.'
                : <>Range {sim.projectedScoreMin}–{sim.projectedScoreMax} · {basis ? basis.confidence : sim.confidence}% fix-impact confidence</>}
            </div>
            <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ECEBFF', color: '#1B17FF', border: '1px solid #C9C6FF', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
              <svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Estimated projection — not yet verified. Confirmed only after a real rescan.
            </div>

            {/* Confidence bar + data basis — b8aa: this bar is the DATA
                confidence (how much real data backs the projection, from
                effBasis). The hero line above shows the separate
                fix-impact confidence. They are different quantities and
                are now labelled as such. */}
            {(() => {
              const conf = effBasis.confidence;
              return (
                <div style={{ marginTop: 14, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 5 }}>
                    <span>Data confidence</span><span>{conf}%</span>
                  </div>
                  <div style={{ height: 12, background: '#F1F5F9', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, conf)}%`, height: '100%', background: confidenceColor(conf), transition: 'width .3s' }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: NAVY }}>
                    <strong>{effBasis.badge}</strong>
                    <div style={{ color: GRAY, fontSize: 11, marginTop: 2 }}>
                      {effBasis.label}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Checkbox fix list */}
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <div style={h2}>Toggle your fixes</div>
            {seed.fixes.map((f) => {
              const meta = fixMeta[f.id] || { midPts: 0, weekEnd: 0, notEstimated: true };
              return (
                <label
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    marginBottom: 8,
                    cursor: 'pointer',
                    background: checked[f.id] ? '#ECEBFF' : WHITE,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!checked[f.id]}
                    onChange={() => toggle(f.id)}
                    style={{ width: 18, height: 18, accentColor: PURPLE }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>
                    {f.title}{' '}
                    {/* b8aa: the week is the fix's own time-to-result, not
                        its landing week in the combined (sequential)
                        timeline — labelled as a duration. A fix with no
                        canonical impact says so instead of "+0 pts". */}
                    {meta.notEstimated ? (
                      <span style={{ color: GRAY, fontWeight: 500 }}>
                        (impact not estimated — not counted in the projection)
                      </span>
                    ) : (
                      <>
                        <span style={{ color: GREEN, fontWeight: 700 }}>
                          (+{meta.midPts} pts
                        </span>
                        <span style={{ color: GRAY, fontWeight: 500 }}>
                          , ~{meta.weekEnd} wks to result)
                        </span>
                      </>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 4. Score projection chart */}
        <div style={card}>
          <div style={h2}>Score projection over time</div>
          <div style={{ overflowX: 'auto' }}>
            <svg width={chartW} height={chartH} style={{ maxWidth: '100%' }}>
              {/* Y gridlines */}
              {[0, 25, 50, 75, 100].map((s) => (
                <g key={s}>
                  <line
                    x1={padL}
                    y1={yFor(s)}
                    x2={chartW - padR}
                    y2={yFor(s)}
                    stroke={BORDER}
                    strokeWidth={1}
                  />
                  <text x={padL - 6} y={yFor(s) + 4} textAnchor="end" style={{ fontSize: 10, fill: GRAY }}>
                    {s}
                  </text>
                </g>
              ))}

              {/* Green crossover shade */}
              {greenPath && <path d={greenPath} fill={GREEN} opacity={0.18} />}

              {/* Competitor dotted line — only when a measured competitor score exists */}
              {competitorY != null && compScore != null && (
                <>
                  <line
                    x1={padL}
                    y1={competitorY}
                    x2={chartW - padR}
                    y2={competitorY}
                    stroke={RED}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                  />
                  <text x={chartW - padR} y={competitorY - 6} textAnchor="end" style={{ fontSize: 11, fill: RED, fontWeight: 700 }}>
                    Competitor {compScore}
                  </text>
                </>
              )}

              {/* Projected blue line */}
              <path d={linePath} fill="none" stroke={BLUE} strokeWidth={3} />
              {projection.points.map((p, i) => (
                <circle key={i} cx={xFor(p.week)} cy={yFor(p.score)} r={4} fill={BLUE} />
              ))}

              {/* X labels */}
              <text x={padL} y={chartH - 8} style={{ fontSize: 10, fill: GRAY }}>
                Week 0
              </text>
              <text x={chartW - padR} y={chartH - 8} textAnchor="end" style={{ fontSize: 10, fill: GRAY }}>
                Week {maxWeek}
              </text>
            </svg>
          </div>
          {checkedFixes.length === 0 && (
            <p style={{ color: GRAY, fontSize: 13, marginTop: 8 }}>
              Select at least one fix to see your trajectory.
            </p>
          )}
          {/* b8aa: the horizon is the SUM of the fixes' times because the
              projection runs them one after another — the first pass
              flagged "last fix lands Week 8 but the chart runs to Week 20"
              as unexplained. */}
          {checkedFixes.length > 0 && (
            <p style={{ color: GRAY, fontSize: 12, marginTop: 8 }}>
              Fixes are projected one after another, so the roadmap horizon (Week {projection.totalWeeks}) is the sum of the selected fixes&apos; times to result. Working on fixes in parallel would shorten it.
            </p>
          )}
        </div>

        {/* 5. Platform recovery */}
        <div style={card}>
          <div style={h2}>AI platform coverage</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {Array.from({ length: TOTAL_PLATFORMS }).map((_, i) => {
              const litNow = i < sim.platformsCurrently;
              const litProjected = i < sim.platformsProjected;
              const color = litNow ? GREEN : litProjected ? AMBER : BORDER;
              return (
                <div
                  key={i}
                  title={litNow ? 'Covered now' : litProjected ? 'Recovered with fixes' : 'Not covered'}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    color: WHITE,
                  }}
                >
                  {litProjected ? <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : ''}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 13, color: GRAY }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>{sim.platformsCurrently}</span> covered now →{' '}
            <span style={{ color: AMBER, fontWeight: 700 }}>{sim.platformsProjected}</span> projected after fixes
          </div>
          {/* b8aa: legend — the dots were color-only with no key, and the
              counts are mention COUNTS from the scan (this page does not
              load per-platform rows, so no platform is named here). */}
          <div style={{ fontSize: 12, color: GRAY, marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: GREEN, marginRight: 5 }} />Covered now</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: AMBER, marginRight: 5 }} />Recovered with fixes (estimated)</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: BORDER, marginRight: 5 }} />Not covered</span>
          </div>
          <p style={{ fontSize: 12, color: GRAY, marginTop: 6 }}>
            One dot per AI platform Rankall scans (12 total). &ldquo;Covered now&rdquo; is your scan&apos;s mention count; which platforms mention you is listed on your report.
          </p>
        </div>

        {/* 6. Revenue calculator */}
        <div style={card}>
          <div style={h2}>Revenue recovery calculator</div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 6 }}>
                Monthly AI inquiries (estimate): {inquiries}
              </label>
              <input
                type="range"
                min={50}
                max={500}
                value={inquiries}
                onChange={(e) => setInquiries(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: BLUE, cursor: 'pointer' }}
              />
              <label style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block', margin: '16px 0 6px' }}>
                Avg customer value (estimate): {revenueSymbol}
                {customerValue.toLocaleString()}
              </label>
              <input
                type="range"
                min={valueSliderMin}
                max={valueSliderMax}
                step={10}
                value={Math.min(customerValue, valueSliderMax)}
                onChange={(e) => setCustomerValue(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: BLUE, cursor: 'pointer' }}
              />
            </div>
            <div
              style={{
                flex: '1 1 240px',
                background: '#ECFDF5',
                border: `1px solid ${GREEN}44`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 13, color: GRAY, marginBottom: 4 }}>
                Estimated recovery / month
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: GREEN }}>
                up to {revenueSymbol}
                {sim.revenueRecovered.toLocaleString()}*
              </div>
              <div style={{ fontSize: 13, color: GRAY, margin: '12px 0 4px' }}>
                Estimated recovery / year
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>
                up to {revenueSymbol}
                {sim.revenueRecoveredAnnual.toLocaleString()}*
              </div>
              <div style={{ fontSize: 12, color: GRAY, marginTop: 10 }}>
                Current monthly leak: {revenueSymbol}
                {sim.revenueCurrentLoss.toLocaleString()}
              </div>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>
                *Estimated based on your inputs. Actual revenue impact varies. Not a guarantee of results.
              </p>
              {/* b8aa: the derivation was nowhere on the page — the
                  recovery % had to be reverse-engineered. State it. */}
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                How this is estimated: recovery = current leak × min(60%, points gained × 2.5%). With {projectedScore - sim.currentScore} points gained, that is {Math.min(60, (projectedScore - sim.currentScore) * 2.5)}% of the leak. The leak itself uses your report&apos;s revenue model: the share of AI platforms not mentioning you × monthly inquiries × avg customer value × a 10% conversion rate.
              </p>
            </div>
          </div>
        </div>

        {/* 7. Competitor comparison */}
        <div style={card}>
          <div style={h2}>Your trajectory vs competitor</div>
          {compScore != null ? (
            <>
              <p style={{ fontSize: 15, color: NAVY, margin: '0 0 8px' }}>
                Your competitor sits at{' '}
                <strong style={{ color: RED }}>{compScore}</strong>. Your projected
                score with the selected fixes reaches{' '}
                <strong style={{ color: PURPLE }}>{projectedScore}</strong> by Week{' '}
                {projection.totalWeeks}.
              </p>
              {crossoverWeek !== null ? (
            <div
              style={{
                background: '#F0FDF4',
                border: `1px solid ${GREEN}44`,
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 15,
                fontWeight: 700,
                color: NAVY,
              }}
            >
              <svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"/></svg> You overtake at Week {crossoverWeek} if you start today.
            </div>
          ) : (
            <div
              style={{
                background: '#FEF2F2',
                border: `1px solid ${RED}44`,
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 14,
                color: NAVY,
              }}
            >
              The selected fixes don't yet overtake your competitor — enable more fixes
              to cross the line.
            </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: 15, color: NAVY, margin: 0 }}>
              Your projected score with the selected fixes reaches{' '}
              <strong style={{ color: PURPLE }}>{projectedScore}</strong> by Week{' '}
              {projection.totalWeeks}. No competitor score was measured for this scan,
              so there is no competitor line or overtake week to show.
            </p>
          )}
        </div>

        {/* 8. Share / save */}
        <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <button
            onClick={shareProjection}
            disabled={sharing}
            style={{
              background: PURPLE,
              color: WHITE,
              border: 'none',
              borderRadius: 10,
              padding: '12px 20px',
              fontWeight: 700,
              fontSize: 14,
              cursor: sharing ? 'default' : 'pointer',
              opacity: sharing ? 0.7 : 1,
            }}
          >
            {sharing ? 'Creating link…' : (shareUrl ? (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Public link copied</>) : (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480l0-83.6c0-4 1.5-7.8 4.2-10.8L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"/></svg>{' '}Share My Projection</>))}
          </button>
          {shareUrl && (
            <span style={{ fontSize: 12, color: GRAY, wordBreak: 'break-all' }}>{shareUrl}</span>
          )}
          <button
            onClick={copyLink}
            style={{
              background: WHITE,
              color: NAVY,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 10,
              padding: '12px 20px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {copied && !shareUrl ? (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy page link'}
          </button>
          <button
            onClick={emailToMyself}
            style={{
              background: WHITE,
              color: NAVY,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 10,
              padding: '12px 20px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Email to myself
          </button>
          <button
            onClick={() => window.print()}
            style={{
              background: WHITE,
              color: NAVY,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 10,
              padding: '12px 20px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Download PDF
          </button>
        </div>

        {/* Global projection disclaimer — b8aa: the old footer wording
            duplicated the words "based on" (the basis label already starts
            with them); effBasis carries the one canonical label. */}
        <p style={{ fontSize: 12, color: GRAY, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
          {SIMULATOR_DISCLAIMER} Data basis: {effBasis.label}.
        </p>
      </div>
    </div>
  );
}
