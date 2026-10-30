import Link from 'next/link';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import WeeklyReportButton from './WeeklyReportButton';
import BlogGenerateButton from './BlogGenerateButton';
import EmailTestPanel from './EmailTestPanel';

export const dynamic = 'force-dynamic';

// Phase 3: dedicated admin dashboard. Admin-only. Platform health + recent
// activity pulled from rankall_scans. Revenue is a placeholder until Stripe.
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const WHITE = '#0A0A14';
const GRAY = '#55556A';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const AMBER = '#D97706';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type ScanRow = { business_name?: string | null; input?: string | null; overall_score?: number | null; country_code?: string | null; industry?: string | null; created_at?: string | null };

async function loadStats() {
  const sb = admin();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const countSince = async (since: string): Promise<number> => {
    try {
      const { count } = await sb.from('rankall_scans').select('id', { count: 'exact', head: true }).gt('created_at', since);
      return count ?? 0;
    } catch { return 0; }
  };

  const scansToday = await countSince(dayAgo);
  const scansMonth = await countSince(monthAgo);

  // b88k: the select asked for a `score` column rankall_scans doesn't have,
  // so PostgREST errored and the page said "No scans yet." next to a
  // non-zero monthly count. Select real columns only, and report a load
  // failure as a failure, not as an empty list.
  let recent: ScanRow[] = [];
  let recentError = false;
  try {
    const { data, error } = await sb.from('rankall_scans').select('business_name, input, overall_score, country_code, industry, created_at').order('created_at', { ascending: false }).limit(10);
    if (error) recentError = true;
    recent = (data as ScanRow[]) ?? [];
  } catch { recentError = true; }

  // Top industries + country breakdown from a recent sample (avoids full-table scans).
  let sample: ScanRow[] = [];
  try {
    const { data } = await sb.from('rankall_scans').select('industry, country_code').order('created_at', { ascending: false }).limit(1000);
    sample = (data as ScanRow[]) ?? [];
  } catch { sample = []; }

  const tally = (rows: ScanRow[], key: 'industry' | 'country_code') => {
    const m: Record<string, number> = {};
    for (const r of rows) { const k = (r[key] || '').toString().trim(); if (k) m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  };

  return { scansToday, scansMonth, recent, recentError, topIndustries: tally(sample, 'industry'), countries: tally(sample, 'country_code') };
}

const card: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' };

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: GRAY, fontSize: 18 }}>Access denied</p>
      </div>
    );
  }

  const stats = await loadStats();
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

  const Metric = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div style={{ flex: '1 1 160px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: WHITE, marginBottom: 6 }}>Rankall Admin Dashboard</h1>
        <p style={{ color: GRAY, fontSize: 14, marginBottom: 28 }}>Platform health, recent activity, and system status.</p>

        {/* PLATFORM HEALTH */}
        <div style={card}>
          <h2 style={h2}>Platform Health</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Metric label="Scans today" value={stats.scansToday} color={GREEN} />
            <Metric label="Scans this month" value={stats.scansMonth} color={BLUE} />
            <Metric label="Cache (see QA health)" value="—" color={GRAY} />
            <Metric label="Failed scans (see logs)" value="—" color={AMBER} />
          </div>
        </div>

        {/* WEEKLY REPORT — manual trigger (testing) */}
        <div style={card}>
          <h2 style={h2}>Weekly Visibility Report</h2>
          <WeeklyReportButton />
        </div>

        {/* BLOG — manual generation trigger */}
        <div style={card}>
          <h2 style={h2}>Blog Generator</h2>
          <BlogGenerateButton />
        </div>

        {/* REVENUE placeholder */}
        <div style={card}>
          <h2 style={h2}>Revenue</h2>
          {/* b88k: the Stripe button used to open the QA checklist, and the card
              said "not configured" even when the key was set. */}
          {stripeConfigured ? (
            <p style={{ color: GRAY, fontSize: 14, margin: '0 0 14px' }}>Stripe is connected. Revenue reporting isn&apos;t built into this page yet — see payments in Stripe.</p>
          ) : (
            <p style={{ color: GRAY, fontSize: 14, margin: '0 0 14px' }}>Stripe isn&apos;t connected in this environment: STRIPE_SECRET_KEY is not set.</p>
          )}
          <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: '#ECEBFF', color: BLUE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Open Stripe dashboard ↗</a>
        </div>

        {/* RECENT ACTIVITY */}
        <div style={card}>
          <h2 style={h2}>Recent Activity</h2>
          {stats.recentError ? (
            <p style={{ color: AMBER, fontSize: 13 }}>Couldn&apos;t load recent scans — check the server logs.</p>
          ) : stats.recent.length === 0 ? (
            <p style={{ color: GRAY, fontSize: 13 }}>No scans yet.</p>
          ) : (
            <div>
              {stats.recent.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13, flexWrap: 'wrap' }}>
                  <span style={{ color: WHITE, fontWeight: 600 }}>{r.business_name || r.input || '—'}</span>
                  <span style={{ color: GRAY }}>
                    {(r.overall_score ?? '—')} · {r.country_code || '—'} · {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOP INDUSTRIES + COUNTRIES */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ ...card, flex: '1 1 360px' }}>
            <h2 style={h2}>Top Industries</h2>
            {stats.topIndustries.length === 0 ? <p style={{ color: GRAY, fontSize: 13 }}>No data.</p> : stats.topIndustries.map(([name, count]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                <span style={{ color: WHITE }}>{name}</span><span style={{ color: GRAY }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ ...card, flex: '1 1 360px' }}>
            <h2 style={h2}>Country Breakdown</h2>
            {stats.countries.length === 0 ? <p style={{ color: GRAY, fontSize: 13 }}>No data.</p> : stats.countries.map(([name, count]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 13 }}>
                <span style={{ color: WHITE }}>{name}</span><span style={{ color: GRAY }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SYSTEM STATUS */}
        <div style={card}>
          <h2 style={h2}>System Status</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/admin/qa-checklist" style={{ background: '#ECEBFF', color: BLUE, border: `1px solid #C9C6FF`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>QA Checklist + Health →</Link>
            <Link href="/admin/launch-readiness" style={{ background: '#ECEBFF', color: BLUE, border: `1px solid #C9C6FF`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Launch Readiness →</Link>
          </div>
        </div>

        {/* EMAIL SYSTEM TEST */}
        <EmailTestPanel />
      </div>
    </div>
  );
}
