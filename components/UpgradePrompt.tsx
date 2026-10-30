'use client';

import Link from 'next/link';
import { PLAN_CONFIG, type PlanType } from '@/lib/planConfig';

interface UpgradePromptProps {
  requiredPlan: string
  feature?: string
  upgradeParam?: string
  compact?: boolean
}

const PLAN_ICON_KEY: Record<string, 'bolt' | 'user' | 'magnifying-glass' | 'building' | 'rocket' | 'landmark'> = {
  local_pro:     'bolt',
  personal_pro:  'user',
  local_pro_seo: 'magnifying-glass',
  agency:        'building',
  agency_seo:    'rocket',
  enterprise:    'landmark',
  government:    'landmark',
}
const planIcon = (key: string, size: number) => {
  const icons: Record<string, { vb: string; d: string }> = {
    bolt: { vb: '0 0 448 512', d: 'M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z' },
    user: { vb: '0 0 448 512', d: 'M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z' },
    'magnifying-glass': { vb: '0 0 512 512', d: 'M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z' },
    building: { vb: '0 0 384 512', d: 'M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z' },
    rocket: { vb: '0 0 512 512', d: 'M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z' },
    landmark: { vb: '0 0 512 512', d: 'M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z' },
  };
  const ic = icons[key] ?? icons.bolt;
  return (<svg viewBox={ic.vb} width={size} height={size} fill="currentColor" aria-hidden="true"><path d={ic.d} /></svg>);
};

const PLAN_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  local_pro:     { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  personal_pro:  { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  local_pro_seo: { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  agency:        { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  agency_seo:    { color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
  enterprise:    { color: '#0F172A', bg: '#F1F5F9', border: '#CBD5E1' },
  government:    { color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
}

export default function UpgradePrompt({ requiredPlan, feature, upgradeParam, compact = false }: UpgradePromptProps) {
  const style  = PLAN_COLORS[requiredPlan] ?? PLAN_COLORS.local_pro
  const iconKey = PLAN_ICON_KEY[requiredPlan] ?? 'bolt'
  const param  = upgradeParam ?? requiredPlan
  // b8a8: the plan name was derived by title-casing the plan KEY, which
  // mangled real plan names ("local_pro_seo" → "Local Pro Seo" instead of
  // "Local Pro + SEO"). Use the plan's configured display name when the
  // key is a known plan; fall back to the title-cased key otherwise.
  const planDisplay = (PLAN_CONFIG as Record<string, { displayName?: string }>)[requiredPlan as PlanType]?.displayName
    ?? requiredPlan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  if (compact) {
    return (
      <div style={{ background: style.bg, border: `1.5px solid ${style.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: style.color, fontWeight: 600, margin: 0 }}>
          {planIcon(iconKey, 13)} {feature ?? 'This feature'} is included in <strong>{planDisplay}</strong>
        </p>
        <Link href={`/pricing?upgrade=${param}`} style={{ background: style.color, borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Upgrade to unlock <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: style.bg, border: `2px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
          {planIcon(iconKey, 28)}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
          {feature ? `${feature} requires` : 'Upgrade required'}
        </h2>
        <p style={{ fontSize: 15, fontWeight: 700, color: style.color, marginBottom: 12 }}>
          {planDisplay}
        </p>
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 28 }}>
          {feature
            ? `${feature} is included in the ${planDisplay} plan. Upgrade to unlock this feature and everything else in the plan.`
            : `This page is included in the ${planDisplay} plan. Upgrade to get access.`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={`/pricing?upgrade=${param}`} style={{ background: style.color, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: `0 4px 14px ${style.color}33` }}>
            Upgrade to {planDisplay} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </Link>
          <Link href="/dashboard" style={{ background: '#F1F5F9', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, color: '#0F172A', textDecoration: 'none' }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
