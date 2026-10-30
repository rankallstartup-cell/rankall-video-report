// Phase 21: /admin/scan-accuracy — admin-only debug panel. Lists the last 20
// scans with score, coverage, confidence, and data-quality status. Read-only.
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import { calculateScanConfidence } from '@/lib/scanAccuracy';

export const dynamic = 'force-dynamic';

const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const BLUE = '#1B17FF';
const GRAY = '#55556A';

interface ScanRow {
  id: string;
  input: string | null;
  business_name: string | null;
  overall_score: number | null;
  created_at: string;
  data_quality_status: string | null;
  data_quality_score: number | null;
  mentioned_count: number | null;
  country_code: string | null;
  competitor_name: string | null;
  user_id: string | null;
}

export default async function ScanAccuracyPage() {
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
        <p style={{ color: GRAY, fontSize: 18 }}>Access denied — admin only.</p>
      </div>
    );
  }

  // Read via service-role client (RLS bypass for the admin view).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  let rows: ScanRow[] = [];
  try {
    const { data } = await admin
      .from('rankall_scans')
      .select('id, input, business_name, overall_score, created_at, data_quality_status, data_quality_score, mentioned_count, country_code, competitor_name, user_id')
      .order('created_at', { ascending: false })
      .limit(20);
    rows = (data as ScanRow[]) || [];
  } catch { rows = []; }

  const TOTAL_PLATFORMS = 12;

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '32px 20px', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎯 Scan Accuracy</h1>
        <p style={{ color: GRAY, fontSize: 13, marginBottom: 20 }}>
          Last 20 scans. Confidence is estimated from competitor availability + data-quality
          score (per-scan responded-count isn&apos;t stored, so coverage is assumed full).
        </p>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <p style={{ color: GRAY, fontSize: 13 }}>No scans found.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: GRAY }}>
                  {['Business', 'Date', 'Query', 'Score', 'Mentioned', 'Confidence', 'DQ Status', 'Warnings', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const hasCompetitor = !!(r.competitor_name && r.competitor_name.trim());
                  const conf = calculateScanConfidence(TOTAL_PLATFORMS, TOTAL_PLATFORMS, r.mentioned_count ?? 0, hasCompetitor, false);
                  const dqScore = r.data_quality_score ?? 100;
                  const warnings: string[] = [];
                  if (!hasCompetitor) warnings.push('no competitor');
                  if (dqScore < 85) warnings.push(`DQ ${dqScore}`);
                  if ((r.overall_score ?? 0) === 0) warnings.push('score 0');
                  const confColor = conf.level === 'very_high' || conf.level === 'high' ? '#059669' : conf.level === 'medium' ? '#D97706' : '#DC2626';
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}` }}>{r.business_name || '—'}<br /><span style={{ color: GRAY, fontSize: 10 }}>{r.id.slice(0, 8)}</span></td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: GRAY, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: GRAY, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.input || '—'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700 }}>{r.overall_score ?? '—'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}` }}>{r.mentioned_count ?? 0}/{TOTAL_PLATFORMS}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: confColor, fontWeight: 700 }}>{conf.level} ({conf.percentage}%)</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: (r.data_quality_status && r.data_quality_status !== 'clean') ? '#D97706' : GRAY }}>{r.data_quality_status || 'clean'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, color: warnings.length ? '#DC2626' : GRAY }}>{warnings.length ? warnings.join(', ') : '—'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${BORDER}` }}>
                        {/* b88v: /report/[id] only serves public/ownerless
                            scans (canServePublicShare) — linking a private
                            owned scan produced a dead "Report not found".
                            Owned scans get an honest label instead. */}
                        {r.user_id
                          ? <span style={{ color: GRAY }}>Private scan — no public report</span>
                          : <a href={`/report/${r.id}`} style={{ color: BLUE, textDecoration: 'none' }}>View Report →</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p style={{ color: GRAY, fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
          Mentioned counts the platforms that mentioned the business out of all {TOTAL_PLATFORMS} platforms scanned.
          Per-scan responded counts are not stored, so a platform that returned no response counts as not mentioning (coverage assumed full, as noted above).
          Rows show the scan date and the first 8 characters of the scan ID so repeat scans of the same business can be told apart.
        </p>
      </div>
    </div>
  );
}
