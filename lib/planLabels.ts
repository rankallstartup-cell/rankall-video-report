// lib/planLabels.ts
// CUSTOMER-FACING plan display names. Canonical plan IDs (personal_pro, business,
// …) are unchanged everywhere in logic — this only maps an id to what the user
// sees. Rename display text here; never touch the ids or normalizePlan().

export const PLAN_LABELS: Record<string, string> = {
  personal_pro: 'Personal Brand',
  business: 'Local Business',
  agency: 'Agency',
  free: 'Free',
  enterprise: 'Enterprise',
};

export function getPlanLabel(plan: string | null | undefined): string {
  const p = (plan || '').toString();
  return PLAN_LABELS[p] || p;
}
