'use client';

import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { usePlan } from '@/lib/usePlan';
import { normalizePlan } from '@/lib/planConfig';
import { tierPrice } from '@/lib/publicStats';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#E7E7F0';
const PURPLE = '#7C3AED';
const BLUE = '#2563EB';
const GRAY = '#64748B';

export default function EnterpriseDashboardPage() {
  const { plan, rawPlan, loading, userId } = usePlan();

  if (loading) return <div style={{ padding: '48px 24px', textAlign: 'center', color: GRAY }}>Loading…</div>;

  // b89t: this page previously rendered for everyone — logged-out
  // visitors and Free accounts alike — asserting "Your enterprise
  // account" and a "dedicated account manager" as present-tense
  // facts. Entitlement is the account's REAL plan (rawPlan): the
  // canonical 'enterprise' plan (Enterprise / Government / Global
  // Brand Intelligence map to it).
  if (!userId) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view the Enterprise Dashboard.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Enterprise is a paid plan — its dashboard is available to Enterprise accounts.</p>
        <Link href="/login?next=/dashboard/enterprise" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    );
  }

  const entitled = normalizePlan(rawPlan) === 'enterprise';
  const adminResolved = !entitled && plan !== rawPlan;

  if (!entitled && !adminResolved) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'inherit' }}>
        <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
          <span>›</span>
          <span>Enterprise</span>
        </nav>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 10px', letterSpacing: '-0.5px' }}>Enterprise Dashboard</h1>
          <p style={{ fontSize: 16, color: GRAY, lineHeight: 1.6, margin: '0 0 28px' }}>
            This dashboard is part of the Enterprise plan (${tierPrice('Enterprise')}/mo). Enterprise adds custom AI visibility
            intelligence across your markets, brands, and locations — with no usage limits and a dedicated account manager.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/pricing" style={{ display: 'inline-block', background: PURPLE, color: '#fff', textDecoration: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 700 }}>
              See Enterprise pricing
            </Link>
            <Link href="/contact" style={{ display: 'inline-block', background: W, border: `1.5px solid ${BORDER}`, color: NAVY, textDecoration: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 700 }}>
              Contact sales
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
        <span>›</span>
        <span>Enterprise</span>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {adminResolved && (
          <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600, margin: 0 }}>
              Admin view — your account plan is {rawPlan}; this dashboard is gated to Enterprise accounts for customers.
            </p>
          </div>
        )}
        <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg></div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 10px', letterSpacing: '-0.5px' }}>Enterprise Dashboard</h1>
        <p style={{ fontSize: 16, color: GRAY, lineHeight: 1.6, margin: '0 0 28px' }}>
          Your enterprise account gives you access to custom AI visibility intelligence across your
          markets, brands, and locations — with no usage limits and dedicated support.
        </p>

        <div className="card dash-card">
          <p className="lbl" style={{ margin: '0 0 8px' }}>Your dedicated account manager</p>
          <p style={{ fontSize: 15, color: NAVY, lineHeight: 1.6, margin: '0 0 16px' }}>
            Reach your account manager any time for custom reports, API access, onboarding, and
            tailored intelligence for your organization.
          </p>
          <Link href="/contact" className="btn btn-blue">
            Contact Support <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Link href="/dashboard/intelligence" className="card dash-card" style={{ padding: '18px 20px', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M184 0c30.9 0 56 25.1 56 56l0 400c0 30.9-25.1 56-56 56c-28.9 0-52.7-21.9-55.7-50.1c-5.2 1.4-10.7 2.1-16.3 2.1c-35.3 0-64-28.7-64-64c0-7.4 1.3-14.6 3.6-21.2C21.4 367.4 0 338.2 0 304c0-31.9 18.7-59.5 45.8-72.3C37.1 220.8 32 207 32 192c0-30.7 21.6-56.3 50.4-62.6C80.8 123.9 80 118 80 112c0-29.9 20.6-55.1 48.3-62.1C131.3 21.9 155.1 0 184 0zM328 0c28.9 0 52.6 21.9 55.7 49.9c27.8 7 48.3 32.1 48.3 62.1c0 6-.8 11.9-2.4 17.4c28.8 6.2 50.4 31.9 50.4 62.6c0 15-5.1 28.8-13.8 39.7C493.3 244.5 512 272.1 512 304c0 34.2-21.4 63.4-51.6 74.8c2.3 6.6 3.6 13.8 3.6 21.2c0 35.3-28.7 64-64 64c-5.6 0-11.1-.7-16.3-2.1c-3 28.2-26.8 50.1-55.7 50.1c-30.9 0-56-25.1-56-56l0-400c0-30.9 25.1-56 56-56z"/></svg></div>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>Global Intelligence</p>
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>AI recommendation trends across your markets.</p>
          </Link>
          <Link href="/dashboard/agency" className="card dash-card" style={{ padding: '18px 20px', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}><svg viewBox="0 0 384 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16-16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z"/></svg></div>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>Multi-Account</p>
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Manage all your brands and locations.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
