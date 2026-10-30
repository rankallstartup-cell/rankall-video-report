// lib/permissions.ts
// Phase 3: central permission checks. Every gate in the app should resolve to
// one of these so access logic lives in exactly one place.
import { UserRole, isAdmin, isAgencyRole } from './roles';
import { normalizePlan } from './planConfig';

export interface UserContext {
  role: UserRole;
  plan: string;
  email: string;
}

export function canAccessAdmin(ctx: UserContext): boolean {
  return isAdmin(ctx.role);
}

export function canAccessAgency(ctx: UserContext): boolean {
  return (
    isAdmin(ctx.role) ||
    isAgencyRole(ctx.role) ||
    ['agency', 'enterprise'].includes(normalizePlan(ctx.plan))
  );
}

export function canManageClients(ctx: UserContext): boolean {
  return canAccessAgency(ctx);
}

export function canViewBilling(_ctx: UserContext): boolean {
  return true; // all authenticated users
}

export function canGenerateProposal(ctx: UserContext): boolean {
  return canAccessAgency(ctx);
}

export function canExportReports(ctx: UserContext): boolean {
  return ['business', 'agency', 'enterprise'].includes(normalizePlan(ctx.plan));
}

export function canRunOutreach(ctx: UserContext): boolean {
  return isAdmin(ctx.role);
}

export function canViewAnalytics(ctx: UserContext): boolean {
  return isAdmin(ctx.role);
}

export function canViewMarketIndex(ctx: UserContext): boolean {
  return ['business', 'agency', 'enterprise'].includes(normalizePlan(ctx.plan)) || isAdmin(ctx.role);
}

// Internal/admin-only page keys — never accessible to customers.
const ADMIN_ONLY_PAGES = [
  'outreach', 'lead-intelligence', 'demo-prep', 'content-pipeline',
  'webhook-testing', 'health-checks', 'qa', 'cron-status', 'api-logs',
];

export function canAccessPage(ctx: UserContext, pageKey: string): boolean {
  // Admins can access everything.
  if (isAdmin(ctx.role)) return true;

  // Agency pages.
  if (pageKey.startsWith('agency')) {
    return canAccessAgency(ctx);
  }

  // Admin-only internal pages.
  if (ADMIN_ONLY_PAGES.some((p) => pageKey.includes(p))) {
    return isAdmin(ctx.role);
  }

  return true;
}
