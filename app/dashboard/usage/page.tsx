'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePlan } from '@/lib/usePlan';
import { getPlanMeta, isAdminUser } from '@/lib/planConfig';
import { UNLIMITED_LIMIT, usageBarPercent } from '@/lib/usageDisplay';

// Phase 2: read-only usage page. Shows current plan, monthly usage, remaining,
// reset date, and progress bars. Source of truth is /api/usage/summary (DB).
const BG = '#F8FAFC';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#E2E8F0';
const GRAY = '#64748B';
const LGRAY = '#94A3B8';
const PURPLE = '#1B17FF';
const GREEN = '#059669';
const AMBER = '#D97706';
const RED = '#DC2626';

type FeatureUsage = { used: number; limit: number; remaining: number };
type Summary = Record<string, FeatureUsage>;

// Human labels + display order for the feature keys.
const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: 'local_scan', label: 'Local Scans' },
  { key: 'personal_scan', label: 'Personal Scans' },
  { key: 'product_scan', label: 'Product Scans' },
  { key: 'competitor_scan', label: 'Competitor Scans' },
  { key: 'ai_inbox', label: 'AI Inbox Searches' },
  { key: 'simulator', label: 'Simulator Runs' },
  { key: 'report_export', label: 'Report Exports' },
  { key: 'demo_video', label: 'Demo Videos' },
  { key: 'agency_client_scan', label: 'Agency Client Scans' },
];

const UNLIMITED = UNLIMITED_LIMIT;

function barColor(used: number, limit: number): string {
  if (limit >= UNLIMITED) return GREEN;
  if (limit === 0) return BORDER;
  const pct = used / limit;
  if (pct >= 1) return RED;
  if (pct >= 0.8) return AMBER;
  return PURPLE;
}

function nextResetDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function UsagePage() {
  const { rawPlan, userId, userEmail, loading: planLoading } = usePlan();
  // b8af: show the account's real plan. Admins get every feature (the
  // effective plan is Enterprise) and their usage is never counted, so the
  // page says that instead of labelling a Free account "Enterprise".
  const isAdmin = isAdminUser(userEmail);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (planLoading) return;
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/usage/summary?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.summary) setSummary(d.summary as Summary); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, planLoading]);

  const meta = getPlanMeta(rawPlan);
  // Admins are never metered (incrementUsage returns early for admins),
  // so an admin's counts stay 0 no matter how many scans they run — the
  // 0s are a policy artifact, not measured zero usage. Say so instead of
  // presenting 0 as if it were measured.
  const isAdminView = isAdmin;

  // Only show features the plan actually has access to (limit > 0 or unlimited).
  const rows = useMemo(() => {
    if (!summary) return [];
    return FEATURE_LABELS
      .filter((f) => summary[f.key] && summary[f.key].limit > 0)
      .map((f) => ({ ...f, ...summary[f.key] }));
  }, [summary]);

  const card: React.CSSProperties = { background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 };

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
          <span>›</span><span>Usage</span>
        </nav>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 6px' }}>Usage</h1>
        <p style={{ fontSize: 15, color: GRAY, margin: '0 0 24px' }}>Your monthly usage across cost-protected features. Resets {nextResetDate()}.</p>

        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Current plan</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: NAVY }}>{meta.icon} {meta.label}</div>
          </div>
          {isAdmin && (
            <div style={{ fontSize: 13, color: GRAY, flexBasis: '100%' }}>Admin account: every feature is unlocked and your usage isn&apos;t counted against a limit.</div>
          )}
          {meta.isFree && !isAdmin && (
            <Link href="/pricing" style={{ background: PURPLE, color: W, borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Upgrade →</Link>
          )}
        </div>

        {isAdminView && (
          <div style={card}><p style={{ color: GRAY, margin: 0 }}>Admin account — admin activity isn&apos;t metered, so the counts below stay 0. Plan limits don&apos;t apply to admins.</p></div>
        )}

        {(loading || planLoading) && <div style={{ color: GRAY, fontSize: 14 }}>Loading usage…</div>}

        {!loading && !planLoading && !userId && (
          <div style={card}><p style={{ color: GRAY, margin: 0 }}>Sign in to view your usage.</p></div>
        )}

        {!loading && summary && rows.length === 0 && (
          <div style={card}><p style={{ color: GRAY, margin: 0 }}>Your plan has no metered features. Enjoy unlimited access, or <Link href="/pricing" style={{ color: PURPLE }}>see plans</Link>.</p></div>
        )}

        {rows.length > 0 && (
          <div style={card}>
            {rows.map((r, i) => {
              const unlimited = r.limit >= UNLIMITED;
              const pct = usageBarPercent(r.used, r.limit);
              return (
                <div key={r.key} style={{ padding: '14px 0', borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{r.label}</span>
                    <span style={{ fontSize: 13, color: GRAY }}>
                      {isAdmin ? 'Not counted (admin)' : unlimited ? `${r.used} used · Unlimited` : `${r.used} / ${r.limit}`}
                    </span>
                  </div>
                  {/* b8af: an "Unlimited" row has no meaningful progress —
                      the old code rendered a 100%-FULL green bar at 0 used,
                      implying full usage. No bar for unlimited rows. */}
                  {!unlimited && (
                    <div style={{ height: 10, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor(r.used, r.limit), transition: 'width .3s' }} />
                    </div>
                  )}
                  {!unlimited && !isAdmin && (
                    <div style={{ fontSize: 11, color: r.remaining === 0 ? RED : LGRAY, marginTop: 4 }}>
                      {r.remaining === 0 ? `Limit reached — resets ${nextResetDate()}` : `${r.remaining} remaining`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
