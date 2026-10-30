'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

type FunnelData = {
  sent: number; opened: number; video_viewed: number;
  report_visited: number; signed_up: number; converted: number;
};
type SegmentRow = { label: string; conv_rate: number };
type HotLead = {
  business_name: string; city: string; industry: string;
  scan_id: string; score: number; competitor_score: number;
  open_count: number; video_pct: number; visit_count: number;
  last_active: string;
};
type SimStats = {
  viewsThisWeek: number; conversionRate: number; bestScoreRange: string;
  bestIndustry: string; avgRecovery: number; totalViews: number;
};
type DomainHealth = {
  domain: string; status: string; sent_today: number; daily_limit: number;
  sent_this_month: number; bounce_rate: number; spam_complaint_count: number;
  pause_reason: string | null;
};

export default function OutreachIntelligencePage() {
  const router = useRouter();
  // b88q: non-admins were silently redirected to /dashboard — no
  // denial message anywhere. The page now renders the denial
  // explicitly, like the server-gated admin pages.
  const [authorized, setAuthorized] = useState<'checking' | 'ok' | 'denied'>('checking');
  useEffect(() => {
    getBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!isAdminUser(user?.email)) { setAuthorized('denied'); }
      else { setAuthorized('ok'); }
    });
  }, [router]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [byIndustry, setByIndustry] = useState<SegmentRow[]>([]);
  const [byCountry, setByCountry] = useState<SegmentRow[]>([]);
  const [simStats, setSimStats] = useState<SimStats | null>(null);
  const [domains, setDomains] = useState<DomainHealth[]>([]);

  useEffect(() => {
    async function loadDomains() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      try {
        const res = await fetch('/api/admin/domain-health');
        if (res.ok) {
          const j = await res.json();
          setDomains(j.domains ?? []);
        }
      } catch {}
    }
    loadDomains();
  }, []);

  useEffect(() => {
    async function loadSim() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      try {
        const res = await fetch('/api/admin/simulator-stats');
        if (res.ok) setSimStats(await res.json());
      } catch {}
    }
    loadSim();
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      // Load outreach_intelligence aggregate (or outreach_targets with joins)
      const { data: targets } = await supabase
        .from('outreach_targets')
        .select('status, industry, country_code, scan_id, rankall_score, competitor_name, business_name, city')
        .order('created_at', { ascending: false })
        .limit(500);

      const { data: videoViews } = await supabase
        .from('video_views')
        .select('scan_id, event, clicked_cta')
        .order('viewed_at', { ascending: false })
        .limit(2000);

      if (targets) {
        const sent = targets.length;
        const videoScanIds = new Set(videoViews?.filter(v => v.event === 'video_page_viewed').map(v => v.scan_id) ?? []);
        const ctaClicked = new Set(videoViews?.filter(v => v.clicked_cta).map(v => v.scan_id) ?? []);
        const converted = targets.filter(t => t.status === 'converted').length;
        const signedUp = targets.filter(t => t.status === 'signed_up' || t.status === 'converted').length;

        setFunnel({
          sent,
          opened: targets.filter(t => t.status !== 'pending').length,
          video_viewed: videoScanIds.size,
          report_visited: ctaClicked.size,
          signed_up: signedUp,
          converted,
        });

        // Industry breakdown
        const industryMap: Record<string, { total: number; conv: number }> = {};
        targets.forEach(t => {
          const ind = t.industry ?? 'Unknown';
          if (!industryMap[ind]) industryMap[ind] = { total: 0, conv: 0 };
          industryMap[ind].total++;
          if (t.status === 'converted') industryMap[ind].conv++;
        });
        setByIndustry(Object.entries(industryMap)
          .map(([label, d]) => ({ label, conv_rate: d.total > 0 ? (d.conv / d.total) * 100 : 0 }))
          .sort((a, b) => b.conv_rate - a.conv_rate).slice(0, 5));

        // Country breakdown
        const countryMap: Record<string, { total: number; conv: number }> = {};
        targets.forEach(t => {
          const c = t.country_code ?? 'US';
          if (!countryMap[c]) countryMap[c] = { total: 0, conv: 0 };
          countryMap[c].total++;
          if (t.status === 'converted') countryMap[c].conv++;
        });
        setByCountry(Object.entries(countryMap)
          .map(([label, d]) => ({ label, conv_rate: d.total > 0 ? (d.conv / d.total) * 100 : 0 }))
          .sort((a, b) => b.conv_rate - a.conv_rate).slice(0, 5));

        // Hot leads: video viewed or cta clicked
        const hot = targets
          .filter(t => t.scan_id && (videoScanIds.has(t.scan_id) || ctaClicked.has(t.scan_id)))
          .slice(0, 10)
          .map(t => ({
            business_name: t.business_name ?? '—',
            city: t.city ?? '—',
            industry: t.industry ?? '—',
            scan_id: t.scan_id ?? '',
            score: t.rankall_score ?? 0,
            competitor_score: 0,
            open_count: videoScanIds.has(t.scan_id ?? '') ? 1 : 0,
            video_pct: ctaClicked.has(t.scan_id ?? '') ? 100 : 60,
            visit_count: ctaClicked.has(t.scan_id ?? '') ? 1 : 0,
            last_active: 'recently',
          }));
        setHotLeads(hot);
      }
      setLoadedAt(new Date().toLocaleString());
    }
    load();
  }, []);

  if (authorized === 'checking') {
    return <div style={{ padding: 40, color: '#6b7280', fontFamily: 'sans-serif' }}>Checking access…</div>;
  }
  if (authorized === 'denied') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#0A0A14' }}>Access denied — admin only.</p>
      </div>
    );
  }

  const stat = (label: string, value: number | string) => (
    <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20, textAlign: 'center' }}>
      <p style={{ fontSize: 28, fontWeight: 700, color: '#0A0A14', margin: '0 0 4px' }}>{value}</p>
      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{label}</p>
    </div>
  );

  const funnelPct = (n: number, of: number) => of > 0 ? `${Math.round((n / of) * 100)}%` : '0%';

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Outreach Intelligence</h1>
      <p style={{ color: '#6b7280', margin: '0 0 8px' }}>Conversion funnel and hot lead tracking</p>
      <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 32px', lineHeight: 1.6 }}>
        Sources: funnel, industry, and country figures are computed live from outreach_targets and video_views (most recent 500 targets).
        Simulator figures come from simulation_views (public Simulator views).{loadedAt ? ` Loaded ${loadedAt}.` : ''}
      </p>

      {funnel && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 32 }}>
            {stat('Sent', funnel.sent)}
            {stat('Opened', `${funnel.opened} (${funnelPct(funnel.opened, funnel.sent)})`)}
            {stat('Video Viewed', `${funnel.video_viewed} (${funnelPct(funnel.video_viewed, funnel.sent)})`)}
            {stat('Report Click', `${funnel.report_visited} (${funnelPct(funnel.report_visited, funnel.sent)})`)}
            {stat('Signed Up', `${funnel.signed_up} (${funnelPct(funnel.signed_up, funnel.sent)})`)}
            {stat('Converted', `${funnel.converted} (${funnelPct(funnel.converted, funnel.sent)})`)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>By Industry</h3>
              {byIndustry.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No data yet.</p>}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {byIndustry.map(row => (
                    <tr key={row.label}>
                      <td style={{ padding: '6px 0', color: '#55556A' }}>{row.label}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: '#1B17FF' }}>{row.conv_rate.toFixed(1)}% conv</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>By Country</h3>
              {byCountry.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No data yet.</p>}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {byCountry.map(row => (
                    <tr key={row.label}>
                      <td style={{ padding: '6px 0', color: '#55556A' }}>{row.label}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: '#1B17FF' }}>{row.conv_rate.toFixed(1)}% conv</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {simStats && (
        <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20, marginBottom: 32 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>📊 Simulator Performance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {stat('Views this week', simStats.viewsThisWeek)}
            {stat('Conversion rate', `${simStats.conversionRate}%`)}
            {stat('Best score range', simStats.bestScoreRange)}
            {stat('Best industry', simStats.bestIndustry)}
            {stat('Avg recovery', `$${simStats.avgRecovery.toLocaleString()}`)}
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '14px 0 0', lineHeight: 1.6 }}>
            From simulation_views: &quot;Views this week&quot; is the last 7 days; conversion rate, best range, and best industry are all-time
            (best range/industry show — until at least one view converts). Avg recovery is the average revenue recovered per converted view.
          </p>
        </div>
      )}

      {(() => {
        const STATUS_BADGE: Record<string, { emoji: string; label: string }> = {
          warming: { emoji: '🟢', label: 'warming' },
          active:  { emoji: '🔵', label: 'active' },
          'at risk': { emoji: '🟡', label: 'at risk' },
          paused:  { emoji: '🔴', label: 'paused' },
        };
        const paused = domains.filter(d => d.status === 'paused');
        return (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>📡 Domain Health Monitor</h2>
            {paused.length > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
                {paused.map(d => (
                  <p key={d.domain} style={{ fontSize: 13, color: '#92400E', margin: '2px 0' }}>
                    ⚠️ <strong>{d.domain}</strong> is paused — {d.pause_reason || 'no reason given'}
                  </p>
                ))}
              </div>
            )}
            {domains.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No sending domains tracked yet.</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                      <th style={{ padding: '6px 8px' }}>Domain</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                      <th style={{ padding: '6px 8px' }}>Today</th>
                      <th style={{ padding: '6px 8px' }}>Monthly</th>
                      <th style={{ padding: '6px 8px' }}>Bounce%</th>
                      <th style={{ padding: '6px 8px' }}>Spam</th>
                      <th style={{ padding: '6px 8px' }}>Daily Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map(d => {
                      const b = STATUS_BADGE[d.status] ?? { emoji: '⚪', label: d.status };
                      return (
                        <tr key={d.domain} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontWeight: 600, color: '#0A0A14' }}>{d.domain}</td>
                          <td style={{ padding: '8px' }}>{b.emoji} {b.label}</td>
                          <td style={{ padding: '8px' }}>{d.sent_today ?? 0}</td>
                          <td style={{ padding: '8px' }}>{d.sent_this_month ?? 0}</td>
                          <td style={{ padding: '8px' }}>{Number(d.bounce_rate ?? 0).toFixed(1)}%</td>
                          <td style={{ padding: '8px' }}>{d.spam_complaint_count ?? 0}</td>
                          <td style={{ padding: '8px' }}>{d.daily_limit ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>🔥 Hot Leads</h2>
      {hotLeads.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>No hot leads yet. Send outreach to get started.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {hotLeads.map((lead, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 600, margin: '0 0 2px' }}>{lead.business_name} — {lead.city}</p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 6px' }}>{lead.industry} · Score: {lead.score}/100</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                  Opened {lead.open_count}x · Video {lead.video_pct}% · Report {lead.visit_count}x · {lead.last_active}
                </p>
              </div>
              {lead.scan_id && (
                <a href={`/report/${lead.scan_id}`} style={{ background: '#1B17FF', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  View Report
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
