'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0F172A';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GRAY   = '#64748B';
const PURPLE = '#7c3aed';

interface AgencyInfo {
  agency_name: string;
  agency_email: string | null;
}

export default function ClientContactPage() {
  const [loading, setLoading]   = useState(true);
  const [agency, setAgency]     = useState<AgencyInfo | null>(null);
  const [error, setError]       = useState<string | null>(null);
  // b89h: distinct states like the sibling client pages — signed-out
  // is a gate, no-client is a state (with the SAME wording the
  // overview API uses), and a failed lookup is a failure with Retry
  // (the old code ignored query errors, so a failed agency_clients
  // lookup was misreported as "No client account found.").
  const [errKind, setErrKind] = useState<'unauth' | 'noclient' | 'failed' | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setErrKind(null);
      const supabase = getBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErrKind('unauth'); setLoading(false); return; }

      const { data: clientRow, error: clientErr } = await supabase
        .from('agency_clients')
        .select('agency_user_id')
        .eq('client_user_id', user.id)
        .maybeSingle();

      if (clientErr) { setError('Failed to load your agency contact. Please try again.'); setErrKind('failed'); setLoading(false); return; }
      if (!clientRow) { setError('No client account found. Please contact your agency.'); setErrKind('noclient'); setLoading(false); return; }

      const { data: settings } = await supabase
        .from('agency_settings')
        .select('agency_name, agency_email')
        .eq('agency_user_id', (clientRow as { agency_user_id: string }).agency_user_id)
        .maybeSingle();

      setAgency({
        agency_name: (settings as AgencyInfo | null)?.agency_name || 'Your Agency',
        agency_email: (settings as AgencyInfo | null)?.agency_email || null,
      });
      setLoading(false);
    }
    load();
  }, [reloadTick]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
        <p style={{ color: GRAY, fontSize: 15 }}>Loading…</p>
      </div>
    );
  }

  if (errKind === 'unauth') {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>Contact My Agency</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Sign in to contact your agency.</p>
          <Link href="/login?next=/dashboard/client/contact" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>Contact My Agency</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 28px' }}>Your account is managed by a Rankall partner agency.</p>
          <div style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px' }}>
            <p style={{ color: errKind === 'noclient' ? GRAY : '#DC2626', fontSize: 14, margin: 0 }}>{error}</p>
            {errKind === 'failed' && (
              <button onClick={() => setReloadTick(t => t + 1)} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10 }}>Retry</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const agencyName  = agency?.agency_name || 'Your Agency';
  const agencyEmail = agency?.agency_email;

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif', padding: '28px 24px' }}>
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
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Contact My Agency</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Your account is managed by a Rankall partner agency.</p>
          </div>
        </header>

        <div className="card dash-card">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: PURPLE, color: '#fff', borderRadius: 100,
            padding: '5px 14px', fontSize: 12, fontWeight: 700, marginBottom: 20,
          }}>
            Managed by {agencyName}
          </div>

          <p style={{ fontSize: 16, color: NAVY, lineHeight: 1.7, margin: '0 0 20px' }}>
            Your account is managed by <strong>{agencyName}</strong>.{' '}
            {agencyEmail
              ? <>Contact us at <a href={`mailto:${agencyEmail}`} style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>{agencyEmail}</a> for support.</>
              : <>Please reach out to your account manager at <strong>{agencyName}</strong> for support.</>}
          </p>

          {agencyEmail && (
            <a href={`mailto:${agencyEmail}`} className="btn btn-blue">
              Email {agencyName} →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
