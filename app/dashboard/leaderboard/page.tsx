'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBrowserClient } from '@/lib/supabase';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const PURPLE = '#7C3AED';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';

const scoreCol = (s: number) => s >= 70 ? GREEN : s >= 40 ? AMBER : RED;

const INDUSTRIES = [
  'general','dentist','restaurant','lawyer','plumber','hvac','medspa','realestate',
  'gym','accountant','chiropractor','veterinarian','autorepair','hotel','electrician',
  'landscaping','photographer','weddingvenue','therapist',
];

interface Row {
  id: string;
  name: string;
  score: number;
  isUser: boolean;
  trend: number | null;
  date: string | null;
}

function Breadcrumb({ page }: { page: string }) {
  return (
    <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
      <Link href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
      <span style={{ margin: '0 8px', color: LGRAY }}>›</span>
      <span>{page}</span>
    </nav>
  );
}

export default function LeaderboardPage() {
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [industry, setIndustry] = useState('general');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('US');
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  // b89w: no sample rows anywhere — a short or failed result is an
  // honest empty/error state, never a table of invented numbers.
  const [gate, setGate] = useState<'upgrade' | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    setCountry(match ? match.split('=')[1] : 'US');

    async function init() {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSignedIn(true);
          setUserId(session.user.id);
          const { data } = await supabase
            .from('rankall_scans')
            .select('industry, location')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            if (data.industry) setIndustry(data.industry);
            if (data.location) setLocation(data.location);
          }
        }
      } catch { /* graceful */ }
      setLoaded(true);
    }
    init();
  }, []);

  useEffect(() => {
    if (!loaded || !signedIn) return;
    async function query() {
      setLoadError(false);
      setGate(null);
      try {
        // Cross-user ranking comes from the server (owner-only RLS hides other
        // users' scans from the browser). The response is anonymised: only
        // the viewer's own rows are named.
        const params = new URLSearchParams({ industry, location });
        const res = await fetch(`/api/dashboard/leaderboard?${params.toString()}`);
        // b89w: the API's verdicts are distinct states, not sample data —
        // 403 is the plan gate (the API enforces the same dashboardAccess
        // rule as the nav), anything else non-OK is a load failure.
        if (res.status === 403) { setGate('upgrade'); setRows([]); return; }
        if (!res.ok) { setLoadError(true); setRows([]); return; }
        const json = await res.json().catch(() => null);
        const data = Array.isArray(json?.rows) ? (json.rows as Array<{ rank: number; name: string; score: number; isUser: boolean; date: string | null }>) : null;
        if (!data) { setLoadError(true); setRows([]); return; }
        const mapped: Row[] = data.map((r) => ({
          id: `rank-${r.rank}`,
          name: r.name,
          score: r.score,
          isUser: r.isUser,
          trend: null,
          date: r.date ?? null,
        }));
        setRows(mapped);
      } catch {
        setLoadError(true);
        setRows([]);
      }
    }
    query();
  }, [loaded, signedIn, industry, country, userId, location, reloadTick]);

  const userIdx = rows.findIndex(r => r.isUser);
  const userRowCount = rows.filter(r => r.isUser).length;

  if (!loaded) return <div style={{ padding: '48px 32px', textAlign: 'center', color: GRAY }}>Loading…</div>;

  // b89w: logged-out visitors get a sign-in gate — the page previously
  // rendered the full shell plus sample rows to visitors.
  if (!signedIn) return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view the Leaderboard.</p>
      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Rankings are built from real scans — your own businesses are named, every other business is anonymous.</p>
      <Link href="/login?next=/dashboard/leaderboard" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
    </div>
  );

  if (gate === 'upgrade') return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>The Leaderboard is available on Local Business plans and above.</p>
      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>See how you rank against similar businesses in your area, with every other business shown anonymously.</p>
      <Link href="/pricing" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Upgrade</Link>
    </div>
  );

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1px solid #E7E7F0}.btn-line:hover{background:#F6F6FB;color:#0A0A14}
        .btn-ghost{background:transparent;color:#0A0A14}.btn-ghost:hover{background:#F6F6FB;color:#0A0A14}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb page="Leaderboard" />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 576 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg> Industry Leaderboard</h1>
        <p style={{ fontSize: 14, color: GRAY }}>See how you rank against similar businesses in your area. Only your own businesses are named — every other business is shown anonymously.</p>
      </div>


      {/* Filters */}
      <div className="card dash-card" style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div>
          <label className="lbl" style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 6, letterSpacing: 0, textTransform: 'none' }}>Industry</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: BG, outline: 'none' }}>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 6, letterSpacing: 0, textTransform: 'none' }}>City / Region</label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Chicago IL"
            style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: BG, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* User rank summary */}
      {userIdx >= 0 && (
        <div style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: PURPLE }}>
            {userRowCount > 1
              ? `Your businesses hold ${userRowCount} of the ${rows.length} ranked spots in ${industry}${location ? ` in ${location}` : ''} — your best is #${userIdx + 1}.`
              : `You rank #{userIdx + 1} of {rows.length} businesses in ${industry}${location ? ` in ${location}` : ''}.`}
          </p>
        </div>
      )}

      {loadError && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#991B1B', fontWeight: 600, margin: 0 }}>
            Couldn&apos;t load the leaderboard. <button onClick={() => setReloadTick(t => t + 1)} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Retry</button>
          </p>
        </div>
      )}

      {!loadError && rows.length === 0 && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: AMBER, fontWeight: 600 }}>
            Not enough data yet for {industry} in your market — real rankings appear as more businesses are scanned.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="card dash-card" style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24, padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 90px', background: NAVY, padding: '12px 18px' }}>
          {['Rank', 'Business', 'Score', 'Trend'].map((h, i) => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
          ))}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>No businesses ranked yet for this filter — run a scan to start the ranking.</p>
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 90px', padding: '13px 18px', borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none', alignItems: 'center', background: r.isUser ? '#F5F3FF' : 'transparent' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: r.isUser ? PURPLE : (i < 3 ? NAVY : GRAY) }}>{i === 0 ? <svg viewBox="0 0 512 512" width="14" height="14" fill="#F59E0B" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg> : i === 1 ? <svg viewBox="0 0 512 512" width="14" height="14" fill="#9CA3AF" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg> : i === 2 ? <svg viewBox="0 0 512 512" width="14" height="14" fill="#B45309" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg> : `#${i + 1}`}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: r.isUser ? 800 : 600, color: r.isUser ? PURPLE : NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              {/* b89w: the row's source — the date of the scan it ranks. */}
              {r.date && <span style={{ display: 'block', fontSize: 11, color: LGRAY }}>Latest scan · {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: scoreCol(r.score), textAlign: 'center' }}>{r.score}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.trend == null ? LGRAY : r.trend > 0 ? GREEN : r.trend < 0 ? RED : GRAY, textAlign: 'center' }}>
              {r.trend == null ? '—' : r.trend > 0 ? `↑ ${r.trend}` : r.trend < 0 ? `↓ ${Math.abs(r.trend)}` : '–'}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ background: NAVY, borderRadius: 18, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Climb the leaderboard by closing your AI visibility gaps.</p>
        <Link href="/dashboard/fix" className="btn btn-blue">
          Improve your rank <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
      </div>
    </div>
  );
}
