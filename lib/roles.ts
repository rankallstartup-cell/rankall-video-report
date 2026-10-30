// lib/roles.ts
// Phase 3: role system. Roles are derived from the admin allowlist + normalized
// plan. This is the single source of truth for "who is this user".
import { normalizePlan, isAdminUser } from './planConfig';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SUPPORT'
  | 'CUSTOMER'
  | 'AGENCY_OWNER'
  | 'AGENCY_MEMBER'
  | 'ENTERPRISE_OWNER'
  | 'ENTERPRISE_MEMBER';

export function getUserRole(email: string | null | undefined, plan: string): UserRole {
  if (!email) return 'CUSTOMER';

  // ax86: canonical check (normalizes) — no local allowlist copy.
  if (isAdminUser(email)) {
    return 'SUPER_ADMIN';
  }

  const normalized = normalizePlan(plan);
  if (normalized === 'agency') return 'AGENCY_OWNER';
  if (normalized === 'enterprise') return 'ENTERPRISE_OWNER';

  return 'CUSTOMER';
}

export function isAdmin(role: UserRole): boolean {
  return ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(role);
}

export function isAgencyRole(role: UserRole): boolean {
  return ['AGENCY_OWNER', 'AGENCY_MEMBER'].includes(role);
}

export function isEnterpriseRole(role: UserRole): boolean {
  return ['ENTERPRISE_OWNER', 'ENTERPRISE_MEMBER'].includes(role);
}
