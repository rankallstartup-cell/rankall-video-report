'use client';

import { useState, useEffect } from 'react';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const GREEN  = '#059669';

// b88t: labels carry the FOUNDER prices (lib/publicStats /
// countryConfig US tiers) and bullets derive from PLAN_LIMITS —
// the old cards understated scan limits (50/20/500 vs the real
// 200/100/1000), understated what Free can see (Free sees all 11
// platforms), capped agency client accounts on one card against
// the unlimited truth, and left Enterprise / Government
// unpriced. Agency + SEO $799 is the countryConfig US tier price
// for agencySeo. Local Pro + SEO has NO bundle price anywhere —
// it stays unpriced rather than inventing one. Product Pro /
// SEO / Global Brand Intelligence are packages that map onto
// these plan keys; they are not separate switchable keys (see
// VALID_PLANS in /api/admin/switch-plan).
const PLANS: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'free',          label: 'Free',                    color: GRAY,    bg: '#F1F5F9' },
  { key: 'local_pro',     label: 'Local Pro · $39',         color: BLUE,    bg: '#ECEBFF' },
  { key: 'personal_pro',  label: 'Personal Pro · $15',      color: '#1B17FF', bg: '#ECEBFF' },
  { key: 'local_pro_seo', label: 'Local Pro + SEO',         color: '#0891B2', bg: '#ECFEFF' },
  { key: 'agency',        label: 'Agency · $259',           color: '#D97706', bg: '#FFFBEB' },
  { key: 'agency_seo',    label: 'Agency + SEO · $799',     color: '#DC2626', bg: '#FEF2F2' },
  { key: 'enterprise',    label: 'Enterprise · $499',       color: NAVY,    bg: '#F6F6FB' },
  { key: 'government',    label: 'Government · $1,200',     color: GREEN,   bg: '#ECFDF5' },
];

const PLAN_BULLETS: Record<string, string[]> = {
  free:          ['3 local scans/month', 'All 12 platforms shown', 'No exports / API / white-label'],
  local_pro:     ['200 local scans/month', 'All 12 platforms', 'Fix engine + competitor intel'],
  personal_pro:  ['100 personal scans/month', 'Personal brand dashboard', 'Reputation monitoring'],
  local_pro_seo: ['200 local scans/month', 'SEO Health + URL intelligence', 'Everything in Local Pro'],
  agency:        ['1,000 scans/month', 'Unlimited client accounts', 'Intelligence Graph'],
  agency_seo:    ['1,000 scans/month', 'Unlimited client accounts', 'SEO for client sites'],
  enterprise:    ['Unlimited scans', 'All features', 'Dedicated support'],
  government:    ['Unlimited scans', 'City intelligence', 'Government dashboard'],
};

export default function PlanSwitcherPage() {
  const { checking, isAdmin } = useAdminGuard();
  const { rawPlan, userId } = usePlan();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [switching, setSwitching]     = useState<string | null>(null);
  const [message, setMessage]         = useState<string>('');

  useEffect(() => {
    setCurrentPlan(rawPlan);
  }, [rawPlan]);

  async function switchPlan(plan: string, planLabel: string) {
    if (!userId) return;
    if (!confirm(`Switch to ${planLabel}? Your dashboard will update immediately.`)) return;
    setSwitching(plan);
    setMessage('');
    try {
      const res = await fetch('/api/admin/switch-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage(`Error: ${data.error ?? 'Unknown error'}`);
        setSwitching(null);
        return;
      }
      setMessage(`Switched to ${plan}. Refreshing...`);
      setCurrentPlan(plan);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMessage(`Error: ${String(e)}`);
      setSwitching(null);
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: BG }}>
        <p style={{ color: LGRAY, fontSize: 14 }}>Checking access...</p>
      </div>
    );
  }
  if (!isAdmin) return null;

  const currentCfg = PLANS.find(p => p.key === currentPlan);

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none', marginBottom: 20 }}>
        ← Back to Dashboard
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Plan Switcher — Testing Only 🔄</h1>
      <p style={{ fontSize: 13, color: GRAY, marginBottom: 24 }}>Switch between plans to test different user experiences. Click any card to switch instantly.</p>

      {/* Current plan */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Current Plan</p>
        {currentCfg ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: currentCfg.bg, border: `1.5px solid ${currentCfg.color}33`, borderRadius: 100, padding: '6px 16px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: currentCfg.color }}>{currentCfg.label}</span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: LGRAY }}>Loading…</span>
        )}
      </div>

      {/* Plan grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {PLANS.map(p => {
          const isCurrent = p.key === currentPlan;
          const isLoading = switching === p.key;
          const bullets = PLAN_BULLETS[p.key] ?? [];
          return (
            <button
              key={p.key}
              onClick={() => switchPlan(p.key, p.label)}
              disabled={isCurrent || !!switching}
              style={{
                background: isCurrent ? p.bg : W,
                border: `${isCurrent ? '2.5px' : '2px'} solid ${isCurrent ? p.color : BORDER}`,
                borderRadius: 12,
                padding: '14px 18px',
                cursor: isCurrent || switching ? 'default' : 'pointer',
                textAlign: 'left',
                opacity: switching && !isLoading ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isCurrent && !switching) e.currentTarget.style.borderColor = p.color; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = BORDER; }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? p.color : NAVY, marginBottom: 4 }}>
                {isLoading ? 'Switching…' : p.label}
              </div>
              {isCurrent && (
                <div style={{ fontSize: 10, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, background: `${p.color}18`, display: 'inline-block', borderRadius: 4, padding: '1px 6px' }}>✓ Current</div>
              )}
              <ul style={{ margin: '6px 0 0', padding: '0 0 0 14px', listStyle: 'disc' }}>
                {bullets.map((b, i) => (
                  <li key={i} style={{ fontSize: 10, color: GRAY, lineHeight: 1.6 }}>{b}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: LGRAY, lineHeight: 1.6, marginBottom: 20 }}>
        Prices are the US founder prices (lib/publicStats; Agency + SEO is the countryConfig US tier price).
        Local Pro + SEO has no separate bundle price — Local Pro and SEO are sold separately.
        Product Pro, SEO, and Global Brand Intelligence are packages that run on the plan keys above, not separate switchable keys.
        Scan limits come from PLAN_LIMITS (lib/planConfig).
      </p>

      {/* Message */}
      {message && (
        <div style={{
          background: message.startsWith('Error') ? '#FEF2F2' : '#ECFDF5',
          border: `1.5px solid ${message.startsWith('Error') ? '#FCA5A5' : '#6EE7B7'}`,
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: message.startsWith('Error') ? '#DC2626' : '#059669',
        }}>
          {message}
        </div>
      )}
    </div>
  );
}
