'use client';
import { useRouter } from 'next/navigation';
import { getPlanConfig, normalizePlan } from '@/lib/planConfig';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free', starter: 'Personal Brand', business: 'Local Business',
  local_pro: 'Local Business', local_pro_seo: 'Local Business', personal_pro: 'Personal Brand',
  agency: 'Agency', agency_seo: 'Agency',
  enterprise: 'Enterprise', government: 'Enterprise',
};

const PLAN_PRICES: Record<string, string> = {
  // 'starter' is the legacy alias for personal_pro (normalizePlan maps it) —
  // same $15 price. It previously held the Local price here, which would
  // have shown a Personal user the wrong amount.
  starter: '$15/mo', business: '$39/mo', agency: '$259/mo',
  local_pro: '$39/mo', local_pro_seo: '$39/mo', personal_pro: '$15/mo',
  agency_seo: '$259/mo', enterprise: 'Custom',
};

const FEATURE_BENEFITS: Record<string, string[]> = {
  // b8a3: both ranking claims said "verified" — there are zero verified
  // outcomes product-wide, and the rankings are expected-impact ESTIMATES
  // from fix metadata (the playbooks page itself says so). The gate copy
  // now matches the pages it guards.
  canSeeFixes: ['AI-generated fix content ready to paste', 'Ranked by expected impact for your industry', 'Step-by-step implementation guides'],
  canSeeCompetitors: ['See exactly which AI platforms recommend your competitors', 'Competitive gap score with monthly trend', 'Win-back recommendations'],
  canSeeSEOHealth: ['Weekly automated SEO audit', 'Technical issue detection with fix priority', 'Rank tracking across 12 AI platforms'],
  canSeeSpendIntel: ['See how much your competitors spend on ads', 'AI recommendation vs paid spend analysis', 'Budget optimization recommendations'],
  canSeePlaybooks: ['Industry-specific fix sequences', 'Ranked by expected impact (estimates from fix data)', 'Highest-impact fixes shown first'],
  canSeePersonalBrand: ['Personal AI name recognition score', 'Reputation monitoring across platforms', 'Pitch kit generator'],
  canSeeAgency: ['Manage unlimited client accounts', 'Bulk scanning and reporting', 'White-label dashboard option'],
  canSeeIntelGraph: ['Visual map of all AI recommendation flows', 'Industry competitor network analysis', 'Market share intelligence'],
};

export function PlanGuard({
  feature,
  requiredPlan,
  currentPlan,
  isAdmin,
  children,
}: {
  feature: string;
  requiredPlan: string;
  currentPlan: string;
  // ax86: admins bypass plan gates entirely.
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const normCurrent = normalizePlan(currentPlan);

  // Enterprise/government always has access (normalizePlan maps government→enterprise)
  if (normCurrent === 'enterprise') {
    return <>{children}</>;
  }

  // ax86: admins bypass plan gates entirely — an admin on a free-tier
  // account must not hit upgrade walls inside dashboard features.
  if (isAdmin) {
    return <>{children}</>;
  }

  // PRIMARY CHECK: does the user's actual plan config grant this feature?
  // `feature` is a canSee* flag (e.g. canSeeFixes). This is authoritative and
  // correctly recognizes the new starter/business plans — unlike the old
  // ordered-list check, which locked paid starter/business users out of
  // features they had already paid for (currentIdx was -1 for those plans).
  const cfg = getPlanConfig(currentPlan);
  if (cfg.canSeeEverything) return <>{children}</>;
  if (feature && (cfg as unknown as Record<string, boolean>)[feature] === true) {
    return <>{children}</>;
  }

  // FALLBACK: ordered-plan check (now includes starter/business) for any
  // requiredPlan-based usage.
  const PLAN_ORDER = ['free', 'personal_pro', 'business', 'agency', 'enterprise'];
  const currentIdx = PLAN_ORDER.indexOf(normCurrent);
  const requiredIdx = PLAN_ORDER.indexOf(normalizePlan(requiredPlan));
  const hasAccess =
    normCurrent === normalizePlan(requiredPlan) ||
    (requiredIdx !== -1 && currentIdx >= requiredIdx);

  if (hasAccess) return <>{children}</>;

  const benefits = FEATURE_BENEFITS[feature] || ['Access premium features', 'Unlock advanced analytics', 'Get more insights'];
  const price = PLAN_PRICES[requiredPlan];
  const requiredLabel = PLAN_LABELS[requiredPlan] || requiredPlan;
  const currentLabel = PLAN_LABELS[currentPlan] || currentPlan;

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px',
    }}>
      <div style={{
        maxWidth: 480, width: '100%', background: '#FFFFFF',
        border: '2px solid #1B17FF', borderRadius: 20,
        padding: '40px 36px', textAlign: 'center',
        boxShadow: '0 0 0 4px rgba(124,58,237,0.08)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 448 512" width="48" height="48" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg></div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A14', marginBottom: 8, lineHeight: 1.3 }}>
          Unlock {requiredLabel}
        </h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 28, lineHeight: 1.6 }}>
          This feature is available on <strong>{requiredLabel}</strong> and above.
        </p>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 28, textAlign: 'left' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>What you unlock:</p>
          {benefits.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
              <span style={{ fontSize: 13, color: '#374151' }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700 }}>{currentLabel}</span>
          <span style={{ color: '#94A3B8', fontSize: 18, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></span>
          <span style={{ background: '#ECEBFF', color: '#1B17FF', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, border: '1.5px solid #1B17FF' }}>{requiredLabel}</span>
        </div>

        <button
          onClick={() => router.push(`/pricing?upgrade=${requiredPlan}`)}
          style={{
            width: '100%', background: '#1B17FF', color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >
          Upgrade to {requiredLabel}{price ? ` — ${price}` : ''} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </button>
        <button
          onClick={() => router.push('/pricing')}
          style={{
            width: '100%', background: 'transparent', color: '#64748B', border: 'none',
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          See all plans <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </button>
      </div>
    </div>
  );
}
