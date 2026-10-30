export type PlanType =
  | 'free'
  | 'starter'
  | 'business'
  | 'local_pro'
  | 'personal_pro'
  | 'local_pro_seo'
  | 'agency'
  | 'agency_seo'
  | 'enterprise'
  | 'government'

export interface PlanConfig {
  displayName: string
  badgeColor: string
  badgeBg: string
  canScan: boolean
  scansPerDay: number
  showFixQueue: boolean
  showFirstFixOnly: boolean
  showCompetitor: boolean
  showHistory: boolean
  showSEOHealth: boolean
  showAgency: boolean
  showPersonalPro: boolean
  scanType: 'local' | 'personal' | 'agency'
  dashboardPages: string[]
  upgradeTarget: string | null
  scansPerMonth?: number
  canSeeFixes?: boolean
  canSeeCompetitors?: boolean
  canSeeRevenueLeak?: boolean
  canSeePersonalBrand?: boolean
  canSeeAgency?: boolean
  canSeeSEOHealth?: boolean
  canSeeSpendIntel?: boolean
  canSeePlaybooks?: boolean
  canSeeIntelGraph?: boolean
  canSeeEverything?: boolean
  maxFixes?: number
  maxClients?: number
  upgradePromptTarget?: string | null
}

export const PLAN_CONFIG: Record<PlanType, PlanConfig> = {
  free: {
    displayName: 'Free',
    badgeColor: '#64748B',
    badgeBg: '#F1F5F9',
    canScan: true,
    scansPerDay: 3,
    showFixQueue: false,
    showFirstFixOnly: true,
    showCompetitor: false,
    showHistory: false,
    showSEOHealth: false,
    showAgency: false,
    showPersonalPro: false,
    scanType: 'local',
    dashboardPages: ['overview', 'simulator'],
    upgradeTarget: 'local_pro',
    scansPerMonth: 3,
    canSeeFixes: false,
    canSeeCompetitors: false,
    canSeeRevenueLeak: false,
    canSeePersonalBrand: false,
    canSeeAgency: false,
    canSeeSEOHealth: false,
    canSeeSpendIntel: false,
    canSeePlaybooks: false,
    canSeeIntelGraph: false,
    maxFixes: 0,
    maxClients: 0,
  },
  starter: {
    displayName: 'Starter',
    badgeColor: '#7C3AED',
    badgeBg: '#F5F3FF',
    canScan: true,
    scansPerDay: 50,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: false,
    showHistory: true,
    showSEOHealth: false,
    showAgency: false,
    showPersonalPro: true,
    scanType: 'personal',
    dashboardPages: [
      'overview', 'ai-platforms', 'score-history', 'personal-brand',
      'fix-engine', 'trust', 'simulator', 'ai-inbox', 'score-badge', 'proof-card',
    ],
    upgradeTarget: 'business',
    scansPerMonth: 50,
    canSeeFixes: true,
    canSeeCompetitors: false,
    canSeeRevenueLeak: false,
    canSeePersonalBrand: true,
    canSeeAgency: false,
    canSeeSEOHealth: false,
    canSeeSpendIntel: false,
    canSeePlaybooks: false,
    canSeeIntelGraph: false,
    maxFixes: 5,
    maxClients: 0,
  },
  business: {
    displayName: 'Local Business',
    badgeColor: '#7C3AED',
    badgeBg: '#F5F3FF',
    canScan: true,
    scansPerDay: 100,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: true,
    showAgency: false,
    showPersonalPro: true,
    scanType: 'local',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'ai-platforms', 'trust', 'fix-engine',
      'simulator', 'competitor-intel', 'intelligence', 'seo-health',
      'url-intelligence', 'ai-report', 'roi', 'score-badge', 'proof-card',
      'personal-brand',
      'spend-intelligence', 'leaderboard', 'market-index', 'score-history',
      'playbooks', 'outreach', 'demo-prep',
    ],
    upgradeTarget: 'agency',
    scansPerMonth: 200,
    canSeeFixes: true,
    canSeeCompetitors: true,
    canSeeRevenueLeak: true,
    canSeePersonalBrand: true,
    canSeeAgency: false,
    canSeeSEOHealth: true,
    canSeeSpendIntel: true,
    canSeePlaybooks: true,
    canSeeIntelGraph: true,
    maxFixes: 20,
    maxClients: 0,
  },
  local_pro: {
    displayName: 'Local Pro',
    badgeColor: '#2563EB',
    badgeBg: '#EFF6FF',
    canScan: true,
    scansPerDay: 50,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: false,
    showAgency: false,
    showPersonalPro: false,
    scanType: 'local',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'ai-platforms', 'ai-report',
      'trust', 'fix-engine',
      'competitor-intel',
      'roi', 'score-badge',
      'proof-card', 'url-intelligence',
      'intelligence', 'outreach', 'demo-prep',
    ],
    upgradeTarget: 'local_pro_seo',
    scansPerMonth: 50,
    canSeeFixes: true,
    canSeeCompetitors: true,
    canSeeRevenueLeak: true,
    canSeePersonalBrand: false,
    canSeeAgency: false,
    canSeeSEOHealth: true,
    canSeeSpendIntel: true,
    canSeePlaybooks: true,
    canSeeIntelGraph: false,
    maxFixes: 5,
    maxClients: 0,
  },
  // Canonical personal track (formerly 'starter'). Feature set matches the old
  // starter plan so existing personal-track users keep identical access.
  personal_pro: {
    displayName: 'Personal Brand',
    badgeColor: '#7C3AED',
    badgeBg: '#F5F3FF',
    canScan: true,
    scansPerDay: 50,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: false,
    showHistory: true,
    showSEOHealth: false,
    showAgency: false,
    showPersonalPro: true,
    scanType: 'personal',
    dashboardPages: [
      'overview', 'ai-platforms', 'score-history', 'personal-brand',
      'fix-engine', 'trust', 'simulator', 'ai-inbox', 'score-badge', 'proof-card',
    ],
    upgradeTarget: 'business',
    scansPerMonth: 50,
    canSeeFixes: true,
    canSeePersonalBrand: true,
    canSeeCompetitors: false,
    canSeeRevenueLeak: false,
    canSeeAgency: false,
    canSeeSEOHealth: false,
    canSeeSpendIntel: false,
    canSeePlaybooks: false,
    canSeeIntelGraph: false,
    maxFixes: 5,
    maxClients: 0,
  },
  local_pro_seo: {
    displayName: 'Local Pro + SEO',
    badgeColor: '#059669',
    badgeBg: '#ECFDF5',
    canScan: true,
    scansPerDay: 50,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: true,
    showAgency: false,
    showPersonalPro: false,
    scanType: 'local',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'ai-platforms', 'ai-report',
      'trust', 'fix-engine',
      'competitor-intel', 'roi',
      'score-badge', 'proof-card',
      'url-intelligence', 'intelligence',
      'seo-health', 'outreach', 'demo-prep',
    ],
    upgradeTarget: null,
    scansPerMonth: 100,
    canSeeFixes: true,
    canSeeCompetitors: true,
    canSeeRevenueLeak: true,
    canSeePersonalBrand: false,
    canSeeAgency: false,
    canSeeSEOHealth: true,
    canSeeSpendIntel: true,
    canSeePlaybooks: true,
    canSeeIntelGraph: false,
    maxFixes: 10,
    maxClients: 0,
  },
  agency: {
    displayName: 'Agency',
    badgeColor: '#D97706',
    badgeBg: '#FFFBEB',
    canScan: true,
    scansPerDay: 200,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: false,
    showAgency: true,
    showPersonalPro: false,
    scanType: 'agency',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'agency',
      'ai-platforms', 'ai-report', 'trust',
      'fix-engine', 'competitor-intel',
      'roi', 'score-badge', 'proof-card',
      'url-intelligence', 'intelligence',
      'outreach', 'demo-prep',
      'spend-intelligence', 'leaderboard', 'market-index', 'score-history',
      'playbooks',
    ],
    upgradeTarget: 'agency_seo',
    scansPerMonth: 500,
    canSeeFixes: true,
    canSeeCompetitors: true,
    canSeeRevenueLeak: true,
    canSeePersonalBrand: true,
    canSeeAgency: true,
    canSeeSEOHealth: true,
    canSeeSpendIntel: true,
    canSeePlaybooks: true,
    canSeeIntelGraph: true,
    maxFixes: 999,
    maxClients: 25,
  },
  agency_seo: {
    displayName: 'Agency + SEO',
    badgeColor: '#DC2626',
    badgeBg: '#FEF2F2',
    canScan: true,
    scansPerDay: 200,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: true,
    showAgency: true,
    showPersonalPro: false,
    scanType: 'agency',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'agency',
      'ai-platforms', 'ai-report', 'trust',
      'fix-engine', 'competitor-intel',
      'roi', 'score-badge', 'proof-card',
      'url-intelligence', 'intelligence',
      'seo-health', 'outreach', 'demo-prep',
      'spend-intelligence', 'leaderboard', 'market-index', 'score-history',
      'playbooks',
    ],
    upgradeTarget: null,
    scansPerMonth: 1000,
    canSeeFixes: true,
    canSeeCompetitors: true,
    canSeeRevenueLeak: true,
    canSeePersonalBrand: true,
    canSeeAgency: true,
    canSeeSEOHealth: true,
    canSeeSpendIntel: true,
    canSeePlaybooks: true,
    canSeeIntelGraph: true,
    maxFixes: 999,
    maxClients: 50,
  },
  enterprise: {
    displayName: 'Enterprise',
    badgeColor: '#0F172A',
    badgeBg: '#F1F5F9',
    canScan: true,
    scansPerDay: 999,
    showFixQueue: true,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: true,
    showAgency: true,
    showPersonalPro: false,
    scanType: 'agency',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'enterprise', 'agency',
      'ai-platforms', 'ai-report', 'trust',
      'fix-engine', 'competitor-intel',
      'roi', 'score-badge', 'proof-card',
      'url-intelligence', 'intelligence',
      'seo-health', 'outreach', 'demo-prep',
      'spend-intelligence', 'leaderboard', 'market-index', 'score-history',
      'playbooks',
    ],
    upgradeTarget: null,
    canSeeEverything: true,
    scansPerMonth: 99999,
    maxFixes: 999,
    maxClients: 999,
  },
  government: {
    displayName: 'Government',
    badgeColor: '#1D4ED8',
    badgeBg: '#EFF6FF',
    canScan: true,
    scansPerDay: 999,
    showFixQueue: false,
    showFirstFixOnly: false,
    showCompetitor: true,
    showHistory: true,
    showSEOHealth: false,
    showAgency: false,
    showPersonalPro: false,
    scanType: 'local',
    dashboardPages: [
      // Item 13: Content Studio + LinkedIn Queue are Business-plan tools
      // (their pages gate on isBusinessPlan); listed so nav + proxy agree.
      'content-studio', 'linkedin-queue',
      'overview', 'ai-inbox', 'simulator', 'city-intelligence',
      'ai-platforms', 'intelligence',
      'spend-intelligence', 'leaderboard', 'market-index', 'score-history',
      'playbooks', 'outreach', 'demo-prep',
    ],
    upgradeTarget: null,
    canSeeEverything: true,
    scansPerMonth: 99999,
    maxFixes: 999,
    maxClients: 0,
  },
}

// Canonical active plans. Everything resolves to exactly one of these.
// Note: the personal track's canonical id is 'personal_pro' (the legacy/early
// 'starter' name maps onto it so existing DB rows keep working).
const CANONICAL_PLANS = ['free', 'personal_pro', 'business', 'agency', 'enterprise'] as const

export function normalizePlan(plan: string | null | undefined): string {
  if (!plan) return 'free'
  const map: Record<string, string> = {
    // Legacy local/agency/enterprise names
    local_pro: 'business',
    local_pro_seo: 'business',
    agency_seo: 'agency',
    publisher_pro: 'business',
    government: 'enterprise',
    global_brand: 'enterprise',
    // Personal track: 'starter' was the earlier name for 'personal_pro'
    starter: 'personal_pro',
    personal_pro: 'personal_pro',
    // Current canonical names (pass through)
    business: 'business',
    agency: 'agency',
    enterprise: 'enterprise',
    free: 'free',
  }
  if (map[plan]) return map[plan]
  // Anything unknown resolves to 'free'.
  return (CANONICAL_PLANS as readonly string[]).includes(plan) ? plan : 'free'
}

// ── Admin access ───────────────────────────────────────────────────────────
// Canonical admin allowlist. Kept at 4 to match the guards already used in the
// scan/usage/proxy routes — dropping one would lock a real admin out.
// ax77 verified: nandish@rankall.io is in the list, and every admin-gated
// page/route checks this list via isAdminUser() (no parallel allowlists).
//
// Deliberately HARDCODED, not an env var (QA round 2, item 17): the list is
// not secret, and an env-driven list can be widened by anyone who can edit
// project env vars or silently emptied/mis-set per environment. Rules:
//   - every admin check goes through isAdminUser() (server: getAdminUser in
//     lib/apiAuth, proxy.ts; client gating is cosmetic only) — a test
//     (lib/__tests__/admin-allowlist.test.ts) fails on a second allowlist;
//   - the email passed in must come from the server-verified session
//     (auth.getUser()), never from a body/query/user_metadata field;
//   - changing the list is a code change + review, by design.
export const ADMIN_EMAILS = [
  'rankallstartup@gmail.com',
  'nandish@rankall.io',
  'n4nandish@gmail.com',
  'n4nandish@googlemail.com',
]

// ── Staging admin parity (ticket 14ypkw1b33n) ───────────────────────────
// The staging login account used for verification needs the same admin
// capabilities as the prod admin. Its address is NOT hardcoded (the ticket
// forbids putting credentials/accounts in code or chat): it comes from the
// staging-only env var NEXT_PUBLIC_STAGING_ADMIN_EMAILS (comma-separated),
// set ONLY in the rankall-staging Vercel project. NEXT_PUBLIC_ so the client
// admin checks (useAdminGuard, PlanGuard bypass, admin nav) and the server
// checks (proxy /admin gate, admin API routes, resolvePlanServer) all agree —
// every admin check in the app goes through isAdminUser below.
//
// Hard guard: the list is ignored on any build whose production domain or
// app URL is rankall.io, so a mis-set variable on the prod project can never
// grant admin in production. (Both Vercel projects deploy as "production",
// so VERCEL_ENV cannot tell them apart; the production domain can.)
// Read as literal process.env.NEXT_PUBLIC_* expressions so Next inlines them.
export function isProdRankallDeployment(
  productionUrl: string | undefined = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL,
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): boolean {
  const isRankallHost = (raw: string | undefined): boolean => {
    if (!raw) return false
    const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/:?#]/)[0]
    return host === 'rankall.io' || host.endsWith('.rankall.io')
  }
  return isRankallHost(productionUrl) || isRankallHost(appUrl)
}

export function parseAdminEmailList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

export function stagingAdminEmails(
  raw: string | undefined = process.env.NEXT_PUBLIC_STAGING_ADMIN_EMAILS,
  isProd: boolean = isProdRankallDeployment(),
): string[] {
  return isProd ? [] : parseAdminEmailList(raw)
}

export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase().trim()
  return ADMIN_EMAILS.includes(e) || stagingAdminEmails().includes(e)
}

// ── Usage limits (monthly, per normalized plan) ───────────────────────────
// Phase 2 monthly usage caps. 999999 = unlimited. Keyed by NORMALIZED plan:
//   business  ← Local Pro + Product Pro (local/product track)
//   personal_pro ← Personal Pro
//   enterprise ← Enterprise / Government / Global Brand Intelligence (all unlimited)
// Numbers follow the Phase 2 spec. NOTE: these intentionally differ from the
// pricing page copy (e.g. Business shows "200 scans") — flagged for reconciliation.
const UNLIMITED = 999999
export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    local_scan: 3, personal_scan: 0, product_scan: 0, competitor_scan: 0,
    ai_inbox: 0, simulator: 0, report_export: 0, demo_video: 0,
    demo_generation: 0, agency_client_scan: 0,
  },
  personal_pro: {
    local_scan: 0, personal_scan: 100, product_scan: 0, competitor_scan: 0,
    ai_inbox: 50, simulator: 100, report_export: UNLIMITED, demo_video: 5,
    demo_generation: 5, agency_client_scan: 0,
  },
  business: {
    local_scan: 200, personal_scan: 10, product_scan: 100, competitor_scan: 100,
    ai_inbox: 50, simulator: 100, report_export: UNLIMITED, demo_video: 5,
    demo_generation: 5, agency_client_scan: 0,
  },
  agency: {
    local_scan: 1000, personal_scan: 1000, product_scan: 1000, competitor_scan: 1000,
    ai_inbox: 500, simulator: 1000, report_export: UNLIMITED, demo_video: 20,
    demo_generation: 20, agency_client_scan: 1000,
  },
  enterprise: {
    local_scan: UNLIMITED, personal_scan: UNLIMITED, product_scan: UNLIMITED,
    competitor_scan: UNLIMITED, ai_inbox: UNLIMITED, simulator: UNLIMITED,
    report_export: UNLIMITED, demo_video: UNLIMITED,
    demo_generation: UNLIMITED, agency_client_scan: UNLIMITED,
  },
}

export function getPlanLimit(plan: string | null | undefined, featureKey: string): number {
  const normalized = normalizePlan(plan)
  return PLAN_LIMITS[normalized]?.[featureKey] ?? 0
}

export function isUnlimited(plan: string | null | undefined, featureKey: string): boolean {
  return getPlanLimit(plan, featureKey) >= 999999
}

// Plan-tier helpers — ALWAYS normalize first so legacy + new names both work.
// Each is inclusive upward: a business user passes isStarterPlan (has at least
// starter access), an agency user passes isBusinessPlan, etc.
export function isPaidPlan(plan: string | null | undefined): boolean {
  return normalizePlan(plan) !== 'free'
}
export function isPersonalProPlan(plan: string | null | undefined): boolean {
  return ['personal_pro', 'business', 'agency', 'enterprise'].includes(normalizePlan(plan))
}
// Back-compat alias — older callers import isStarterPlan.
export const isStarterPlan = isPersonalProPlan
export function isBusinessPlan(plan: string | null | undefined): boolean {
  return ['business', 'agency', 'enterprise'].includes(normalizePlan(plan))
}
export function isAgencyPlan(plan: string | null | undefined): boolean {
  return ['agency', 'enterprise'].includes(normalizePlan(plan))
}
// True only for the personal-brand tier (personal_pro), exclusive of business/agency.
export function isPersonalTier(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === 'personal_pro'
}

export function getPlanConfig(accountType: string | null | undefined): PlanConfig {
  const normalized = normalizePlan(accountType)
  return (
    PLAN_CONFIG[normalized as PlanType] ??
    PLAN_CONFIG[accountType as PlanType] ??
    PLAN_CONFIG.free
  )
}

// ── Plan resolution (b062) ───────────────────────────────────────────────
// SINGLE plan cascade used by every security-relevant resolver
// (proxy.ts, usePlan, resolvePlanServer, inbox/search). NEVER trust
// user_metadata for the plan — any signed-in user can set their own
// user_metadata via supabase.auth.updateUser() and self-grant a paid
// plan. The only trusted sources are:
//   1. subscriptions row (Stripe — authoritative)
//   2. app_metadata (set via the admin API with the service-role key;
//      users cannot write it — admin grants and the billing-webhook
//      sync land here)
// An expired trial grants NOTHING (no fallback to app_metadata),
// matching the ax6m rule. profiles is NOT a plan source
// (webhook-synced cache with no user-proof guarantee).
//
// A PAUSED account (app_metadata.account_paused with a future pause_until,
// written only by lib/billingAuth.pauseOwnSubscription via the admin API)
// resolves to FREE: billing is paused, so paid features are too. The old
// rule only blocked scans, so a paused account kept every other paid
// feature while paying nothing.
export function isAccountPaused(appMetadata: unknown, nowMs: number = Date.now()): boolean {
  const am = appMetadata as Record<string, unknown> | undefined;
  if (am?.account_paused !== true) return false;
  const until = typeof am.pause_until === 'string' ? new Date(am.pause_until).getTime() : NaN;
  return Number.isFinite(until) && until > nowMs;
}

export function resolvePlanFromSources(
  sub: { plan?: string | null; status?: string | null; trial_end?: string | null } | null | undefined,
  appMetadata: unknown,
): PlanType {
  if (isAccountPaused(appMetadata)) return 'free';
  if (sub) {
    // Expired trial → free, no fallback (mirrors trialIsExpired;
    // inlined to avoid a planConfig ↔ trial import cycle).
    if (sub.status === 'trialing' && sub.trial_end && new Date(sub.trial_end).getTime() <= Date.now()) {
      return 'free';
    }
    if (sub.plan) {
      return normalizePlan(sub.plan) as PlanType;
    }
    // Row exists but carries no plan → fall through to app_metadata.
  }
  const am = appMetadata as Record<string, unknown> | undefined;
  const metaType = am?.account_type as string | undefined;
  if (metaType) {
    return normalizePlan(metaType) as PlanType;
  }
  return 'free';
}

// Plan display names for upgrade prompts
export const PLAN_DISPLAY: Record<string, string> = {
  free:          'Free',
  local_pro:     'Local Pro',
  personal_pro:  'Personal Brand',
  local_pro_seo: 'Local Pro + SEO Autopilot',
  agency:        'Agency',
  agency_seo:    'Agency + SEO Autopilot',
  enterprise:    'Enterprise',
  government:    'Government',
}

// Display metadata for the sidebar/topbar plan badge. Keyed by NORMALIZED plan.
export interface PlanMeta { label: string; price: string; icon: React.ReactNode; isFree: boolean }
export function getPlanMeta(plan: string): PlanMeta {
  const n = normalizePlan(plan)
  const map: Record<string, PlanMeta> = {
    free:         { label: 'Free Plan',         price: '$0 — 3 scans/month', icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M190.5 68.8L225.3 128l-1.3 0-72 0c-22.1 0-40-17.9-40-40s17.9-40 40-40l2.2 0c14.9 0 28.8 7.9 36.3 20.8zM64 88c0 14.4 3.5 28 9.6 40L32 128c-17.7 0-32 14.3-32 32l0 64c0 17.7 14.3 32 32 32l448 0c17.7 0 32-14.3 32-32l0-64c0-17.7-14.3-32-32-32l-41.6 0c6.1-12 9.6-25.6 9.6-40c0-48.6-39.4-88-88-88l-2.2 0c-31.9 0-61.5 16.9-77.7 44.4L256 85.5l-24.1-41C215.7 16.9 186.1 0 154.2 0L152 0C103.4 0 64 39.4 64 88zm336 0c0 22.1-17.9 40-40 40l-72 0-1.3 0 34.8-59.2C329.1 55.9 342.9 48 357.8 48l2.2 0c22.1 0 40 17.9 40 40zM32 288l0 176c0 26.5 21.5 48 48 48l144 0 0-224L32 288zM288 512l144 0c26.5 0 48-21.5 48-48l0-176-192 0 0 224z"/></svg>, isFree: true  },
    personal_pro: { label: 'Personal Brand Plan', price: '$15/month',  icon: <svg viewBox="0 0 576 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>, isFree: false },
    business:     { label: 'Local Business Plan',  price: '$39/month', icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, isFree: false },
    agency:     { label: 'Agency Plan',     price: '$259/month', icon: <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z"/></svg>, isFree: false },
    enterprise: { label: 'Enterprise Plan', price: '$499/month',     icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z"/></svg>, isFree: false },
  }
  return map[n] ?? map.free
}

// Which plan unlocks a given page key
export const PAGE_REQUIRES: Record<string, { plan: PlanType; label: string; upgradeParam: string }> = {
  'seo-health':      { plan: 'local_pro_seo', label: 'Local Pro + SEO Autopilot', upgradeParam: 'seo_autopilot' },
  'agency':          { plan: 'agency',        label: 'Agency',                    upgradeParam: 'agency'        },
  'enterprise':      { plan: 'enterprise',    label: 'Enterprise',                upgradeParam: 'enterprise'    },
  'city-intelligence': { plan: 'government',  label: 'Government',                upgradeParam: 'government'    },
  'personal-brand':  { plan: 'personal_pro',  label: 'Personal Brand',              upgradeParam: 'personal_pro'  },
  'fix-engine':      { plan: 'local_pro',     label: 'Local Pro',                 upgradeParam: 'local_pro'     },
  'spend-intel':     { plan: 'local_pro',     label: 'Local Pro',                 upgradeParam: 'local_pro'     },
  'intelligence':    { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
  'spend-intelligence': { plan: 'business',   label: 'Business',                  upgradeParam: 'business'      },
  'leaderboard':     { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
  'market-index':    { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
  'score-history':   { plan: 'personal_pro',  label: 'Personal Brand',              upgradeParam: 'personal_pro'  },
  'playbooks':       { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
  'outreach':        { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
  'demo-prep':       { plan: 'business',      label: 'Business',                  upgradeParam: 'business'      },
}

export function canAccess(plan: string, feature: keyof PlanConfig): boolean {
  const config = getPlanConfig(plan)
  if (config.canSeeEverything) return true
  return !!(config as any)[feature]
}

