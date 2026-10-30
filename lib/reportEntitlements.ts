// lib/reportEntitlements.ts — server-side entitlement rules for report
// export (PDF / print) and white-label branding. Pure; unit-tested.
//
// - Export needs a CURRENT paid plan with report_export > 0 (free = 0) and
//   not trialing (trial caps), or an admin. An agency's client may export a
//   report branded by that agency when the AGENCY currently holds a
//   non-trial agency plan (the agency pays for its clients' reports).
// - White-label / custom agency branding only renders for an account whose
//   CURRENT plan is agency-tier and not trialing. A downgraded or cancelled
//   agency keeps its agency_settings row, but it no longer renders.
import { getPlanLimit, isAgencyPlan } from './planConfig';

export interface PlanFacts {
  plan: string;
  isTrialing: boolean;
  isAdmin: boolean;
}

export function brandingEntitled(brand: PlanFacts | null): boolean {
  if (!brand) return false;
  if (brand.isAdmin) return true;
  return isAgencyPlan(brand.plan) && !brand.isTrialing;
}

export function reportExportDecision(
  requester: PlanFacts,
  brandingAgency: PlanFacts | null,
): 'ok' | 'trial_blocked' | 'plan_required' {
  if (requester.isAdmin) return 'ok';
  if (requester.isTrialing) return 'trial_blocked';
  if (getPlanLimit(requester.plan, 'report_export') > 0) return 'ok';
  if (brandingAgency && brandingEntitled(brandingAgency)) return 'ok';
  return 'plan_required';
}
