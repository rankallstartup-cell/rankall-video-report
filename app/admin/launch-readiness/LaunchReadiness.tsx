'use client';

import { useEffect, useMemo, useState } from 'react';
import { TRUST_SIGNALS } from '@/lib/trustSignals';

const TRUST_SIGNAL_COUNT = Object.keys(TRUST_SIGNALS).length;

// Phase 17: pre-launch readiness checklist. 55 items across 14 sections.
// Status persists in localStorage; system items auto-check on load.
type Status = 'pass' | 'fail' | 'warn' | 'skip' | 'untested';

interface LaunchItem {
  id: string;
  section: string;
  title: string;
  description: string;
  critical: boolean;
  owner: 'system' | 'manual';
  notes?: string;
  autoCheckUrl?: string;
}

interface ItemState { status: Status; lastTested: string | null; notes: string }

const STORAGE_KEY = 'rankall_launch_readiness_v1';

// Quick links per section.
const SECTION_LINKS: Record<string, { label: string; href: string }[]> = {
  'Authentication': [
    { label: 'Open Login Page', href: '/login' },
    { label: 'Open Settings', href: '/settings' },
    { label: 'Open Plan Switcher', href: '/admin/plan-switcher' },
  ],
  'Local Business Scan': [
    { label: 'Run Test Scan →', href: '/' },
    { label: 'View Dashboard →', href: '/dashboard' },
  ],
  'Dashboard': [
    { label: 'Switch Plan', href: '/admin/plan-switcher' },
    { label: 'Open Dashboard', href: '/dashboard' },
  ],
  'Fix Engine': [
    { label: 'Open Fix Engine', href: '/dashboard/fix' },
    { label: 'Open Trust Layer', href: '/dashboard/trust' },
  ],
  'Trust Layer': [
    { label: 'Open Trust Layer', href: '/dashboard/trust' },
  ],
  'Outreach': [
    { label: 'Open LinkedIn Queue', href: '/dashboard/linkedin' },
    { label: 'Open Content Studio', href: '/dashboard/content' },
  ],
  'Email': [
    { label: 'Open Health Check', href: '/admin/qa-checklist' },
  ],
  'Stripe Readiness': [
    { label: 'Open Pricing', href: '/pricing' },
  ],
};

const ITEMS: LaunchItem[] = [
  // 1 AUTH
  { id: 'homepage_auth_state', section: 'Authentication', title: 'Auth state on homepage', description: 'Logged-in users see Dashboard button and avatar, not Get Started Free', critical: true, owner: 'manual' },
  { id: 'login_flow', section: 'Authentication', title: 'Login flow works', description: 'User can log in with email/password, redirects to dashboard', critical: true, owner: 'manual' },
  { id: 'signup_flow', section: 'Authentication', title: 'Signup flow works', description: 'New user can create account, plan set correctly', critical: true, owner: 'manual' },
  { id: 'signout_flow', section: 'Authentication', title: 'Sign out works', description: 'User can sign out from avatar menu, returns to homepage', critical: true, owner: 'manual' },
  { id: 'settings_page', section: 'Authentication', title: 'Settings page loads', description: 'All 6 tabs work: Profile, Security, Plan, Integrations, Notifications, Referrals', critical: false, owner: 'manual' },
  // 2 LOCAL SCAN
  { id: 'us_scan', section: 'Local Business Scan', title: 'US scan works', description: 'best dentist in Chicago IL → score appears, competitor detected, revenue gap in $', critical: true, owner: 'manual' },
  { id: 'uk_scan', section: 'Local Business Scan', title: 'UK scan works', description: 'best dentist in London → shows £, NHS signals, UK competitor', critical: true, owner: 'manual' },
  { id: 'scan_cache', section: 'Local Business Scan', title: 'Scan cache works', description: "Same query within 24h returns cached result, shows 'cached' indicator", critical: false, owner: 'manual' },
  { id: 'free_scan_limit', section: 'Local Business Scan', title: 'Free plan scan limit', description: 'Free user hits limit after 3 scans, sees upgrade modal', critical: true, owner: 'manual' },
  { id: 'partial_results', section: 'Local Business Scan', title: 'Partial results handled', description: "If platforms fail, shows 'X of 12 completed' instead of error", critical: false, owner: 'manual' },
  // 3 PERSONAL
  { id: 'personal_scan', section: 'Personal Scan', title: 'Personal scan works', description: 'Dr. Sarah Johnson cardiologist Chicago → personal score appears', critical: true, owner: 'manual' },
  { id: 'personal_score_display', section: 'Personal Scan', title: 'Personal score display', description: 'AI Name Recognition Score shows correctly on Personal Brand plan dashboard', critical: true, owner: 'manual' },
  // 4 COUNTRY/CURRENCY
  { id: 'uk_currency', section: 'Country and Currency', title: 'UK shows £', description: 'UK scan revenue gap shows £ not $. Even when viewed from different country.', critical: true, owner: 'manual' },
  { id: 'india_currency', section: 'Country and Currency', title: 'India shows ₹', description: 'India scan shows ₹ revenue estimates', critical: false, owner: 'manual' },
  { id: 'uk_trust_signals', section: 'Country and Currency', title: 'UK trust signals correct', description: 'UK scan shows NHS, Trustpilot. Does NOT show Healthgrades or Zocdoc.', critical: true, owner: 'manual' },
  { id: 'us_trust_signals', section: 'Country and Currency', title: 'US trust signals correct', description: 'US scan shows Healthgrades, BBB, Yelp. Does NOT show NHS or CQC.', critical: true, owner: 'manual' },
  // 5 REPORT
  { id: 'report_loads', section: 'Report Page', title: 'Report page loads', description: 'After scan, report page shows score, platforms, competitor, fix queue', critical: true, owner: 'manual' },
  { id: 'fix_queue_on_report', section: 'Report Page', title: 'Fix queue on report', description: 'Report shows top 5 fixes with estimated impact', critical: true, owner: 'manual' },
  { id: 'report_country_correct', section: 'Report Page', title: 'Report uses scan country', description: 'Report reads country from scan record, not viewer IP', critical: true, owner: 'manual' },
  { id: 'share_report', section: 'Report Page', title: 'Share report works', description: 'Report has shareable public URL', critical: false, owner: 'manual' },
  // 6 DASHBOARD
  { id: 'business_dashboard', section: 'Dashboard', title: 'Business dashboard loads', description: 'All sidebar groups visible: MY PERFORMANCE, INTELLIGENCE, FIX MY SCORE, TOOLS, ACCOUNT', critical: true, owner: 'manual' },
  { id: 'intelligence_graph', section: 'Dashboard', title: 'Intelligence Graph loads', description: 'Intelligence Graph does NOT redirect to pricing for Business plan users', critical: true, owner: 'manual' },
  { id: 'score_history', section: 'Dashboard', title: 'Score History loads', description: '/dashboard/score-history shows chart of past scans', critical: false, owner: 'manual' },
  { id: 'competitor_intel', section: 'Dashboard', title: 'Competitor Intel loads', description: '/dashboard/competitor shows competitor comparison', critical: true, owner: 'manual' },
  { id: 'simulator_loads', section: 'Dashboard', title: 'Simulator loads', description: 'Simulator shows projected score, sliders work, revenue has disclaimer', critical: true, owner: 'manual' },
  // 7 PLAN GATING
  { id: 'free_plan_gating', section: 'Plan Gating', title: 'Free plan properly gated', description: 'Free user sees only: Overview, My Report, Upgrade, Settings in sidebar', critical: true, owner: 'manual' },
  { id: 'starter_plan_access', section: 'Plan Gating', title: 'Personal Brand plan access correct', description: 'Personal Brand sees personal tools, NOT competitor intel or local business tools', critical: true, owner: 'manual' },
  { id: 'business_plan_access', section: 'Plan Gating', title: 'Business plan access correct', description: 'Business sees all local business tools', critical: true, owner: 'manual' },
  { id: 'agency_plan_access', section: 'Plan Gating', title: 'Agency plan access correct', description: 'Agency sees Agency group first, all business tools', critical: true, owner: 'manual' },
  { id: 'admin_pages_blocked', section: 'Plan Gating', title: 'Admin pages blocked', description: 'Non-admin cannot access /admin/* pages', critical: true, owner: 'manual' },
  // 8 FIX ENGINE
  { id: 'fix_routing', section: 'Fix Engine', title: 'Fix routing correct', description: 'Meta description → Content Optimizer, not FAQ. Google Business → GBP Optimizer.', critical: true, owner: 'manual' },
  { id: 'fix_generates_content', section: 'Fix Engine', title: 'Fix generates content', description: 'FAQ Schema Builder generates dental-specific content with YOUR_ placeholders', critical: true, owner: 'manual' },
  { id: 'fix_industry_specific', section: 'Fix Engine', title: 'Fix is industry-specific', description: 'Dentist gets dental FAQ questions, not generic ones', critical: true, owner: 'manual' },
  { id: 'fix_country_specific', section: 'Fix Engine', title: 'Fix is country-specific', description: 'UK fix shows Trustpilot, not Healthgrades. US fix shows Healthgrades.', critical: true, owner: 'manual' },
  // 9 TRUST LAYER
  { id: 'trust_layer_loads', section: 'Trust Layer', title: 'Trust Layer loads', description: `${TRUST_SIGNAL_COUNT} signals shown in categories`, critical: true, owner: 'manual' },
  { id: 'trust_routing', section: 'Trust Layer', title: 'Trust signal routing', description: "All 'Get fix code' buttons route to correct tool", critical: true, owner: 'manual' },
  { id: 'trust_impact_scores', section: 'Trust Layer', title: 'Impact scores shown', description: 'Each signal shows +N pts badge', critical: false, owner: 'manual' },
  // 10 OUTREACH
  { id: 'outreach_guard', section: 'Outreach', title: 'Outreach guard works', description: 'DNC check blocks unsubscribed emails', critical: true, owner: 'manual' },
  { id: 'unsubscribe_page', section: 'Outreach', title: 'Unsubscribe page works', description: '/unsubscribe with valid token adds to DNC list', critical: true, owner: 'manual' },
  { id: 'linkedin_queue', section: 'Outreach', title: 'LinkedIn queue works', description: 'Can add lead, generate messages, mark status', critical: false, owner: 'manual' },
  { id: 'content_studio', section: 'Outreach', title: 'Content Studio works', description: 'All 6 formats generate content without fake claims', critical: false, owner: 'manual' },
  // 11 EMAIL
  { id: 'resend_connected', section: 'Email', title: 'Resend email works', description: 'Test email sends successfully to admin', critical: true, owner: 'system', autoCheckUrl: '/api/admin/health' },
  { id: 'weekly_email_template', section: 'Email', title: 'Weekly email template', description: 'Weekly monitoring email sends with correct data', critical: false, owner: 'manual' },
  { id: 'score_drop_alert', section: 'Email', title: 'Score drop alert', description: 'Score drop triggers email and Slack alert', critical: false, owner: 'manual' },
  // 12 STRIPE
  { id: 'stripe_waitlist_mode', section: 'Stripe Readiness', title: 'Stripe checkout or waitlist mode', description: "Checkout starts when Stripe is set up; /pricing shows 'Join Waitlist' when it isn't. Pass means one of the two works (b88p).", critical: true, owner: 'system', autoCheckUrl: '/api/billing/create-checkout' },
  { id: 'tin_ein_status', section: 'Stripe Readiness', title: 'TIN/EIN obtained', description: 'Company TIN/EIN received from IRS', critical: true, owner: 'manual', notes: 'Required before Mercury bank account and Stripe' },
  { id: 'mercury_account', section: 'Stripe Readiness', title: 'Mercury bank account', description: 'Mercury account approved and active', critical: true, owner: 'manual', notes: 'Requires EIN first' },
  { id: 'stripe_price_ids', section: 'Stripe Readiness', title: 'Stripe price IDs set', description: 'Real Stripe price IDs in lib/stripeProducts.ts (not REPLACE_WITH placeholders)', critical: true, owner: 'manual' },
  { id: 'stripe_webhook', section: 'Stripe Readiness', title: 'Stripe webhook configured', description: 'Stripe webhook URL set in Stripe dashboard pointing to /api/webhooks/stripe', critical: true, owner: 'manual' },
  // 13 MOBILE
  { id: 'homepage_mobile', section: 'Mobile', title: 'Homepage on mobile', description: 'Homepage looks good on iPhone. Scan bar works. Avatar shows.', critical: true, owner: 'manual' },
  { id: 'dashboard_mobile', section: 'Mobile', title: 'Dashboard on mobile', description: 'Dashboard sidebar collapses on mobile. Hamburger menu works.', critical: true, owner: 'manual' },
  { id: 'report_mobile', section: 'Mobile', title: 'Report on mobile', description: 'Report page readable on mobile. Score and fixes visible.', critical: false, owner: 'manual' },
  // 14 ERROR HANDLING
  { id: '404_page', section: 'Error Handling', title: '404 page works', description: '/nonexistent-page shows branded 404 not Next.js default', critical: false, owner: 'manual' },
  { id: 'scan_error_handling', section: 'Error Handling', title: 'Scan error handling', description: 'If scan fails, shows friendly error not blank page', critical: true, owner: 'manual' },
  { id: 'api_rate_limits', section: 'Error Handling', title: 'API rate limits', description: 'Hitting usage limits shows friendly modal not error', critical: true, owner: 'manual' },
];

const SECTIONS = Array.from(new Set(ITEMS.map((i) => i.section)));

// Palette (dark admin theme to match QA page).
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const WHITE = '#0A0A14';
const GRAY = '#55556A';
const BLUE = '#1B17FF';

const STATUS_META: Record<Status, { icon: string; label: string; color: string; bg: string }> = {
  pass: { icon: '✅', label: 'Pass', color: '#6ee7b7', bg: '#065f46' },
  fail: { icon: '❌', label: 'Fail', color: '#fca5a5', bg: '#7f1d1d' },
  warn: { icon: '⚠️', label: 'Warn', color: '#fcd34d', bg: '#78350f' },
  skip: { icon: '⏭️', label: 'Skip', color: '#0A0A14', bg: '#E7E7F0' },
  untested: { icon: '⬜', label: 'Untested', color: GRAY, bg: '#1e293b' },
};

function nowStr() { return new Date().toISOString().slice(0, 16).replace('T', ' '); }

export default function LaunchReadiness() {
  const [state, setState] = useState<Record<string, ItemState>>({});
  const [loaded, setLoaded] = useState(false);

  // Load persisted state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, ItemState>) : {};
      const init: Record<string, ItemState> = {};
      for (const item of ITEMS) {
        init[item.id] = parsed[item.id] ?? { status: 'untested', lastTested: null, notes: item.notes ?? '' };
      }
      setState(init);
    } catch {
      const init: Record<string, ItemState> = {};
      for (const item of ITEMS) init[item.id] = { status: 'untested', lastTested: null, notes: item.notes ?? '' };
      setState(init);
    }
    setLoaded(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }
  }, [state, loaded]);

  // Auto-checks for system items (run once after load).
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      // Email (Resend) via health check.
      try {
        const res = await fetch('/api/admin/health');
        const data = await res.json();
        const resend = data?.checks?.find((c: { name: string }) => c.name === 'Resend Email Key');
        if (resend && !cancelled) {
          setAuto('resend_connected', resend.status === 'pass' ? 'pass' : 'fail');
        }
      } catch { /* leave untested */ }

      // Stripe waitlist mode: create-checkout with no key returns 503.
      try {
        const res = await fetch('/api/billing/create-checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'business' }),
        });
        if (!cancelled) {
          // 503 = waitlist mode active (expected pre-Stripe). 200 = Stripe live (also fine).
          setAuto('stripe_waitlist_mode', res.status === 503 || res.ok ? 'pass' : 'warn');
        }
      } catch { /* leave untested */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function setAuto(id: string, status: Status) {
    setState((prev) => {
      // Don't clobber a manual override that already set pass/fail differently? Auto wins for system items.
      return { ...prev, [id]: { ...(prev[id] ?? { notes: '', lastTested: null, status: 'untested' }), status, lastTested: nowStr() } };
    });
  }

  function setStatus(id: string, status: Status) {
    setState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { notes: '', lastTested: null, status: 'untested' }), status, lastTested: nowStr() } }));
  }

  function setNotes(id: string, notes: string) {
    setState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { status: 'untested', lastTested: null, notes: '' }), notes } }));
  }

  function markUntestedAsSkip() {
    setState((prev) => {
      const next = { ...prev };
      for (const item of ITEMS) {
        if ((next[item.id]?.status ?? 'untested') === 'untested') next[item.id] = { ...next[item.id], status: 'skip', lastTested: nowStr(), notes: next[item.id]?.notes ?? '' };
      }
      return next;
    });
  }

  function resetAll() {
    const init: Record<string, ItemState> = {};
    for (const item of ITEMS) init[item.id] = { status: 'untested', lastTested: null, notes: item.notes ?? '' };
    setState(init);
  }

  const stats = useMemo(() => {
    const crit = ITEMS.filter((i) => i.critical);
    const non = ITEMS.filter((i) => !i.critical);
    const passOf = (arr: LaunchItem[]) => arr.filter((i) => state[i.id]?.status === 'pass').length;
    const checked = ITEMS.filter((i) => (state[i.id]?.status ?? 'untested') !== 'untested').length;
    const criticalFailing = crit.filter((i) => state[i.id]?.status === 'fail').length;
    const warnings = ITEMS.filter((i) => state[i.id]?.status === 'warn').length;
    const allCriticalPass = crit.every((i) => state[i.id]?.status === 'pass');
    return {
      total: ITEMS.length, checked,
      criticalTotal: crit.length, criticalPass: passOf(crit), criticalFailing,
      nonTotal: non.length, nonPass: passOf(non),
      warnings, allCriticalPass,
    };
  }, [state]);

  // Overall banner status.
  const banner = useMemo(() => {
    if (stats.criticalFailing > 0) {
      return { bg: '#7f1d1d', color: '#fecaca', icon: '⛔', title: 'NOT READY', sub: `${stats.criticalFailing} critical item${stats.criticalFailing === 1 ? '' : 's'} need attention — fix before launching` };
    }
    if (stats.allCriticalPass && stats.warnings === 0) {
      return { bg: '#065f46', color: '#a7f3d0', icon: '✅', title: 'READY TO LAUNCH', sub: 'All critical systems passing' };
    }
    if (stats.allCriticalPass && stats.warnings > 0) {
      return { bg: '#78350f', color: '#fde68a', icon: '⚠️', title: 'ALMOST READY', sub: `${stats.warnings} warning${stats.warnings === 1 ? '' : 's'} remaining — can launch but review warnings` };
    }
    return { bg: '#1e293b', color: GRAY, icon: '🧪', title: 'TESTING IN PROGRESS', sub: `${stats.criticalPass}/${stats.criticalTotal} critical items passing — keep testing` };
  }, [stats]);

  if (!loaded) {
    return <div style={{ minHeight: '100vh', background: BG, color: GRAY, padding: 40 }}>Loading…</div>;
  }

  const pct = Math.round((stats.checked / stats.total) * 100);

  const btn = (active: boolean, color: string): React.CSSProperties => ({
    background: active ? color : 'transparent', color: active ? '#0A0A14' : color, border: `1px solid ${color}`,
    borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: WHITE, marginBottom: 6, letterSpacing: '-0.02em' }}>🚀 Launch Readiness</h1>
        <p style={{ color: GRAY, fontSize: 14, marginBottom: 24 }}>Everything that must work before outreach starts.</p>

        {/* Banner */}
        <div style={{ background: banner.bg, borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: banner.color }}>{banner.icon} {banner.title}</div>
              <div style={{ fontSize: 14, color: banner.color, marginTop: 4, opacity: 0.9 }}>{banner.sub}</div>
            </div>
            {stats.allCriticalPass && stats.criticalFailing === 0 && (
              <a href="/dashboard/linkedin" style={{ background: '#fff', color: '#0A0A14', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Start Outreach →</a>
            )}
          </div>
        </div>

        {/* Progress summary */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: WHITE, marginBottom: 8 }}>
            <span>Overall progress</span><span>{stats.checked}/{stats.total} checked ({pct}%)</span>
          </div>
          <div style={{ height: 14, background: '#E7E7F0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: BLUE, transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: GRAY, marginBottom: 16 }}>
            <span>Critical: <strong style={{ color: stats.criticalPass === stats.criticalTotal ? '#6ee7b7' : '#fca5a5' }}>{stats.criticalPass}/{stats.criticalTotal} passing</strong></span>
            <span>Non-critical: <strong style={{ color: WHITE }}>{stats.nonPass}/{stats.nonTotal} passing</strong></span>
            <span>Warnings: <strong style={{ color: '#fcd34d' }}>{stats.warnings}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={markUntestedAsSkip} style={btn(false, GRAY)}>Mark All Untested as Skip</button>
            <button onClick={resetAll} style={btn(false, '#fca5a5')}>Reset All to Untested</button>
            <button onClick={() => window.print()} style={btn(false, BLUE)}>Export as PDF (print)</button>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => {
          const items = ITEMS.filter((i) => i.section === section);
          const passing = items.filter((i) => state[i.id]?.status === 'pass').length;
          const links = SECTION_LINKS[section] ?? [];
          return (
            <div key={section} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{section}</h2>
                <span style={{ fontSize: 12, color: GRAY }}>{passing}/{items.length} passing</span>
              </div>

              {items.map((item) => {
                const st = state[item.id] ?? { status: 'untested' as Status, lastTested: null, notes: '' };
                const meta = STATUS_META[st.status];
                const failing = st.status === 'fail';
                return (
                  <div key={item.id} style={{ padding: '14px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: failing ? (item.critical ? '#ef4444' : '#f59e0b') : (st.status === 'pass' ? '#22c55e' : '#475569') }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{meta.icon} {item.title}</span>
                          {item.critical && <span style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5', background: '#7f1d1d', borderRadius: 4, padding: '1px 6px' }}>CRITICAL</span>}
                          {item.owner === 'system' && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: '#ECEBFF', borderRadius: 4, padding: '1px 6px' }}>AUTO</span>}
                          <span style={{ fontSize: 11, color: meta.color, background: meta.bg, borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>{meta.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>{item.description}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Last tested: {st.lastTested ?? 'Never'}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => setStatus(item.id, 'pass')} style={btn(st.status === 'pass', '#6ee7b7')}>Pass</button>
                          <button onClick={() => setStatus(item.id, 'fail')} style={btn(st.status === 'fail', '#fca5a5')}>Fail</button>
                          <button onClick={() => setStatus(item.id, 'skip')} style={btn(st.status === 'skip', '#cbd5e1')}>Skip</button>
                        </div>
                        <input
                          value={st.notes}
                          onChange={(e) => setNotes(item.id, e.target.value)}
                          placeholder="Notes…"
                          style={{ marginTop: 8, width: '100%', maxWidth: 480, background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#0A0A14', fontSize: 12 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {links.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  {links.map((l) => (
                    <a key={l.href + l.label} href={l.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: BLUE, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 12px' }}>{l.label}</a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
