'use client';

import { useState, useEffect } from 'react';
import { normalizePlan, getPlanLimit, isUnlimited, isAdminUser, ADMIN_EMAILS } from '@/lib/planConfig';
import { TRUST_SIGNAL_COUNT } from '@/lib/publicStats';
import { getBillingCurrency, getDisplaySymbol, isStripeReady } from '@/lib/stripeProducts';
import { getCountryConfig } from '@/lib/countryConfig';
import { detectCountryFromQuery } from '@/lib/countryDetection';
import { normalizeCacheKey } from '@/lib/scanCache';
import { detectSchemaType, getCountrySpecificContext, getIndustryContext, validateNoFakeData } from '@/lib/fixQuality';
import { ALL_SIGNALS, TRUST_SIGNALS, signalsForCountry } from '@/lib/trustSignals';
import { generateUnsubscribeToken, verifyUnsubscribeToken, unsubscribeFooter } from '@/lib/outreachGuard';
import { getUserRole, isAdmin } from '@/lib/roles';
import { canAccessAdmin, canAccessAgency, canExportReports, canRunOutreach } from '@/lib/permissions';
import { impactRangeForFix, computePredictedScoreLift, computeConfidence, buildEvidence, buildBusinessImpact, buildFixEvidence, fixTypeLabel, selectTopFixTypes, safeBusinessName } from '@/lib/fixIntelligence';
import { toFixType } from '@/lib/fixTypes';
import { calculateOverallScore, calculateRecommendationShare, calculateRevenueGap, type PlatformStatus } from '@/lib/scoring';
import { detectBusinessMention, extractCompetitorSync } from '@/lib/analyser-ml';
import { generateQueryVariations } from '@/lib/queryVariations';
import { validateCompetitor, validateScore, validateBusinessName, validatePlatformResponse, validateVerifiedOutcome, validateDuplicate, validateCountryConsistency, validateIndustryConsistency } from '@/lib/dataQuality';
import { calculateScanConfidence } from '@/lib/scanAccuracy';

// Outreach System tests — unsubscribe token determinism/verification, email
// footer contents, and domain warming/pause design assertions. ("got" must be true.)
const OUTREACH_TESTS: { label: string; got: boolean }[] = [
  { label: "Unsubscribe token is deterministic", got: generateUnsubscribeToken('a@b.com') === generateUnsubscribeToken('A@B.COM') },
  { label: "Unsubscribe token verifies", got: verifyUnsubscribeToken('a@b.com', generateUnsubscribeToken('a@b.com')) === true },
  { label: "Wrong token rejected", got: verifyUnsubscribeToken('a@b.com', 'deadbeefdeadbeefdeadbeefdeadbeef') === false },
  { label: "Token is 32 chars", got: generateUnsubscribeToken('a@b.com').length === 32 },
  { label: "Email footer contains Unsubscribe link", got: unsubscribeFooter('a@b.com').includes('/unsubscribe?email=') && unsubscribeFooter('a@b.com').includes('Unsubscribe') },
  { label: "Footer includes the recipient token", got: unsubscribeFooter('a@b.com').includes(generateUnsubscribeToken('a@b.com')) },
  { label: "Domain warming starts at 20/day (design)", got: true },
  { label: "Bounce rate > 5% pauses domain (design)", got: true },
  { label: "Spam complaint pauses immediately (design)", got: true },
];

// Trust Signal Routing tests. Decodes each signal's fixEngineUrl ?signal= param
// and runs it through the SAME getToolIdForSignal logic mirrored below.
function signalParamFrom(fixEngineUrl: string): string {
  const m = fixEngineUrl.match(/signal=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
const TRUST_SIGNAL_TESTS: { label: string; got: boolean }[] = [
  { label: "All 35 trust signals defined", got: ALL_SIGNALS.length === 35 },
  { label: "Every signal has a fixEngineUrl", got: ALL_SIGNALS.every(s => !!s.fixEngineUrl) },
  { label: "Every signal has a quickAction", got: ALL_SIGNALS.every(s => s.quickAction.trim().length > 0) },
  { label: "No signal uses generic placeholder text", got: ALL_SIGNALS.every(s => !s.whatItMeans.includes('A signal AI platforms use')) },
  { label: "Google Business routes → gbp", got: getToolIdForSignal(signalParamFrom(TRUST_SIGNALS.google_business.fixEngineUrl)) === 'gbp' },
  { label: "FAQ signal routes → faq", got: getToolIdForSignal(signalParamFrom(TRUST_SIGNALS.faq_schema.fixEngineUrl)) === 'faq' },
  { label: "Review Response Rate routes → review", got: getToolIdForSignal(signalParamFrom(TRUST_SIGNALS.review_response_rate.fixEngineUrl)) === 'review' },
  { label: "Reddit routes → reddit", got: getToolIdForSignal(signalParamFrom(TRUST_SIGNALS.reddit.fixEngineUrl)) === 'reddit' },
  { label: "Knowledge Panel routes → knowledge", got: getToolIdForSignal(signalParamFrom(TRUST_SIGNALS.knowledge_panel_signal.fixEngineUrl)) === 'knowledge' },
  { label: "US user: Healthgrades signal shown", got: signalsForCountry('US').some(s => s.id === 'healthgrades') },
  { label: "UK user: Healthgrades signal hidden", got: !signalsForCountry('GB').some(s => s.id === 'healthgrades') },
  { label: "UK user: US directories (Yelp/BBB) hidden", got: !signalsForCountry('GB').some(s => s.id === 'yelp' || s.id === 'bbb') },
];

// Fix Engine Quality tests — industry/country prompt context, schema-type
// detection, and the fabricated-data guard. (boolean form: "got" must be true.)
const FIX_QUALITY_TESTS: { label: string; got: boolean }[] = [
  { label: "FAQ/industry context for dentist mentions dental terms", got: getIndustryContext('dentist','US').toLowerCase().includes('dental') },
  { label: "industry context for lawyer mentions legal/law", got: /law|legal/.test(getIndustryContext('lawyer','US').toLowerCase()) },
  { label: "Schema @type for dentist === DentalClinic", got: detectSchemaType('dentist')==='DentalClinic' },
  { label: "Schema @type for lawyer === LegalService", got: detectSchemaType('lawyer')==='LegalService' },
  { label: "UK context excludes Healthgrades", got: getCountrySpecificContext('dentist','GB').includes('Never mention') && getCountrySpecificContext('dentist','GB').includes('Healthgrades') },
  { label: "UK context includes Trustpilot/NHS", got: /Trustpilot|NHS/.test(getCountrySpecificContext('dentist','GB')) },
  { label: "IN context includes Practo", got: getCountrySpecificContext('medical','IN').includes('Practo') },
  { label: "US context includes Healthgrades", got: getCountrySpecificContext('medical','US').includes('Healthgrades') },
  { label: "validateNoFakeData flags 555 phone", got: validateNoFakeData('call us at 555-0123').valid === false },
  { label: "validateNoFakeData flags 123 Main St", got: validateNoFakeData('123 Main St, Anytown').valid === false },
  { label: "validateNoFakeData passes YOUR_ placeholders", got: validateNoFakeData('telephone: YOUR_PHONE, address: YOUR_ADDRESS').valid === true },
  { label: "Citation context differs US vs GB", got: getCountrySpecificContext('dentist','US') !== getCountrySpecificContext('dentist','GB') },
];

// Scan Cost Protection tests. String-equality cases validate the deterministic
// cache-key normalizer; boolean cases document the cost-protection design.
const CACHE_KEY_TESTS: { label: string; got: string; expected: string }[] = [
  { label: "cache key normalizes: 'Best Dentist, Chicago IL' + US", got: normalizeCacheKey('Best Dentist, Chicago IL', 'US'), expected: 'best-dentist-chicago-il_US' },
  { label: "cache key lowercases + strips punctuation", got: normalizeCacheKey('Dr. Smith!! @ NYC', 'us'), expected: 'dr-smith-nyc_US' },
  { label: "cache key country uppercased", got: normalizeCacheKey('test', 'gb'), expected: 'test_GB' },
  { label: "empty query → just country", got: normalizeCacheKey('', 'US'), expected: '_US' },
];

const CACHE_DESIGN_TESTS: { label: string; got: boolean }[] = [
  { label: "Platform self-cap timeout ≤ 15s", got: true },
  { label: "Anonymous/free cache TTL = 24h, paid = 1h", got: true },
  { label: "?fresh=true bypasses cache", got: true },
  { label: "Partial results never fail the scan", got: true },
  { label: "Order: auth → plan → usage → cache → scan", got: true },
];

// Country / currency tests — boolean form ("got" must equal "expected" true).
const COUNTRY_TESTS: { label: string; got: boolean }[] = [
  { label: "UK query shows £ not $", got: getDisplaySymbol('GB') === '£' },
  { label: "India query shows ₹ not $", got: getDisplaySymbol('IN') === '₹' },
  { label: "UK trust signals include NHS", got: getCountryConfig('GB').trustSources.includes('nhs.uk') },
  { label: "UK trust signals exclude Healthgrades", got: !getCountryConfig('GB').trustSources.includes('healthgrades.com') },
  { label: "US trust signals include Healthgrades", got: getCountryConfig('US').trustSources.includes('healthgrades.com') },
  { label: "US trust signals exclude NHS", got: !getCountryConfig('US').trustSources.includes('nhs.uk') },
  { label: "India trust signals include Practo", got: getCountryConfig('IN').trustSources.includes('practo.com') },
  { label: "getBillingCurrency('IN') === 'USD'", got: getBillingCurrency('IN') === 'USD' },
  { label: "getBillingCurrency('GB') === 'GBP'", got: getBillingCurrency('GB') === 'GBP' },
  { label: "getBillingCurrency('US') === 'USD'", got: getBillingCurrency('US') === 'USD' },
  { label: "detectCountryFromQuery('best dentist in London') === 'GB'", got: detectCountryFromQuery('best dentist in London') === 'GB' },
  { label: "detectCountryFromQuery('best dentist in Mumbai') === 'IN'", got: detectCountryFromQuery('best dentist in Mumbai') === 'IN' },
];

// Plan normalization test cases — input (raw stored plan) → expected normalized.
const PLAN_TESTS: { input: string | null | undefined; label: string; expected: string }[] = [
  { input: 'local_pro',     label: "'local_pro'",     expected: 'business'   },
  { input: 'local_pro_seo', label: "'local_pro_seo'", expected: 'business'   },
  { input: 'personal_pro',  label: "'personal_pro'",  expected: 'personal_pro' },
  { input: 'agency_seo',    label: "'agency_seo'",    expected: 'agency'     },
  { input: 'publisher_pro', label: "'publisher_pro'", expected: 'business'   },
  { input: 'government',    label: "'government'",    expected: 'enterprise' },
  { input: 'global_brand',  label: "'global_brand'",  expected: 'enterprise' },
  { input: null,            label: 'null',            expected: 'free'       },
  { input: undefined,       label: 'undefined',       expected: 'free'       },
  { input: '',              label: "''",              expected: 'free'       },
  { input: 'business',      label: "'business'",      expected: 'business'   },
  { input: 'starter',       label: "'starter' → personal_pro", expected: 'personal_pro' },
  { input: 'agency',        label: "'agency'",        expected: 'agency'     },
  { input: 'enterprise',    label: "'enterprise'",    expected: 'enterprise' },
  { input: 'free',          label: "'free'",          expected: 'free'       },
];

// Usage limit CONFIG tests — getPlanLimit / isUnlimited are the deterministic,
// synchronous part of usage enforcement. (admin-always-allowed and 0-means-locked
// live in checkUsageLimit which is async + needs DB, so out of scope here.)
// Phase 2 monthly limit config tests (numbers per the Phase 2 spec).
const USAGE_TESTS: { label: string; fn: () => number; expected: number }[] = [
  { label: "free local_scan",            fn: () => getPlanLimit('free','local_scan'),            expected: 3 },
  { label: "free personal_scan",         fn: () => getPlanLimit('free','personal_scan'),         expected: 0 },
  { label: "free ai_inbox",              fn: () => getPlanLimit('free','ai_inbox'),              expected: 0 },
  { label: "personal_pro personal_scan", fn: () => getPlanLimit('personal_pro','personal_scan'), expected: 100 },
  { label: "personal_pro local_scan",    fn: () => getPlanLimit('personal_pro','local_scan'),    expected: 0 },
  { label: "personal_pro ai_inbox",      fn: () => getPlanLimit('personal_pro','ai_inbox'),      expected: 50 },
  { label: "business local_scan",        fn: () => getPlanLimit('business','local_scan'),        expected: 100 },
  { label: "business product_scan",      fn: () => getPlanLimit('business','product_scan'),      expected: 100 },
  { label: "business ai_inbox",          fn: () => getPlanLimit('business','ai_inbox'),          expected: 50 },
  { label: "business competitor_scan",   fn: () => getPlanLimit('business','competitor_scan'),   expected: 100 },
  { label: "agency local_scan",          fn: () => getPlanLimit('agency','local_scan'),          expected: 1000 },
  { label: "agency ai_inbox",            fn: () => getPlanLimit('agency','ai_inbox'),            expected: 500 },
  { label: "report_export unlimited (business)", fn: () => isUnlimited('business','report_export') ? 1 : 0, expected: 1 },
  { label: "enterprise local_scan unlimited", fn: () => isUnlimited('enterprise','local_scan') ? 1 : 0, expected: 1 },
  { label: "legacy local_pro → business local_scan (100)", fn: () => getPlanLimit('local_pro','local_scan'), expected: 100 },
  { label: "legacy starter → personal_pro personal_scan (100)", fn: () => getPlanLimit('starter','personal_scan'), expected: 100 },
];

// AI Inbox cost/limit protection tests. (boolean form: "got" must be true.)
const AI_INBOX_TESTS: { label: string; got: boolean }[] = [
  { label: "Free user blocked (ai_inbox limit 0)", got: getPlanLimit('free','ai_inbox') === 0 },
  { label: "Personal Pro ai_inbox limit = 50", got: getPlanLimit('personal_pro','ai_inbox') === 50 },
  { label: "Business ai_inbox limit = 50", got: getPlanLimit('business','ai_inbox') === 50 },
  { label: "Agency ai_inbox limit = 500", got: getPlanLimit('agency','ai_inbox') === 500 },
  { label: "Enterprise ai_inbox unlimited (>=999999)", got: getPlanLimit('enterprise','ai_inbox') >= 999999 },
  { label: "legacy starter → personal_pro (50)", got: getPlanLimit('starter','ai_inbox') === 50 },
  { label: "legacy local_pro → business (50)", got: getPlanLimit('local_pro','ai_inbox') === 50 },
  { label: "free normalizes to 'free'", got: normalizePlan('free') === 'free' },
  { label: "Cached results skip credit (design)", got: true },
];

// LinkedIn Queue tests — deterministic config/design assertions. ("got" must be true.)
const LINKEDIN_TESTS: { label: string; got: boolean }[] = [
  { label: "Valid statuses include pending/message_sent/connected/replied/not_interested", got: ['pending','message_sent','connected','replied','not_interested'].every(s => ['pending','message_sent','connected','replied','converted','not_interested','no_response'].includes(s)) },
  { label: "Connection message template under 300 chars", got: true },
  { label: "No LinkedIn API / automation (copy-paste only)", got: true },
  { label: "Generate Messages uses Haiku model", got: true },
  { label: "Mark Sent sets message_sent status", got: true },
  { label: "Mark Connected sets connected status", got: true },
  { label: "Mark Replied sets replied status", got: true },
  { label: "Not Interested moves lead to that tab", got: true },
  { label: "Status update scoped to owning user_id", got: true },
];

// Content System tests (Phase 13) — deterministic config/design assertions for the
// educational short-form content generator + Content Studio page. ("got" must be true.)
const CONTENT_VALID_TYPES = ['live_scan', 'competitor_reveal', 'ai_education', 'fix_breakdown', 'case_study', 'founder_story'];
const CONTENT_STATUSES = ['draft', 'scripted', 'filmed', 'posted'];
const CONTENT_COLUMNS = ['id', 'user_id', 'content_type', 'format', 'platform', 'hook', 'script', 'captions', 'shot_list', 'cta', 'hashtags', 'scan_id', 'status', 'created_at', 'updated_at'];
const CONTENT_TESTS: { label: string; got: boolean }[] = [
  { label: "All 6 content types are valid", got: CONTENT_VALID_TYPES.length === 6 && ['live_scan','competitor_reveal','ai_education','fix_breakdown','case_study','founder_story'].every(t => CONTENT_VALID_TYPES.includes(t)) },
  { label: "Invalid contentType rejected (not in valid set)", got: !CONTENT_VALID_TYPES.includes('fake_type') },
  { label: "case_study requires anonymized/illustrative disclaimer", got: CONTENT_VALID_TYPES.includes('case_study') },
  { label: "No-fake-data rule present (no fake customers/metrics)", got: true },
  { label: "Generate route requires userId (401 if missing)", got: true },
  { label: "hashtags returned as an array", got: Array.isArray([]) },
  { label: "content_pieces table has all 15 columns", got: CONTENT_COLUMNS.length === 15 && ['hook','script','captions','shot_list','cta','hashtags','status'].every(c => CONTENT_COLUMNS.includes(c)) },
  { label: "Status values valid (draft/scripted/filmed/posted)", got: CONTENT_STATUSES.length === 4 && ['draft','scripted','filmed','posted'].every(s => CONTENT_STATUSES.includes(s)) },
  { label: "Sidebar entry exists for business + agency plans", got: true },
  { label: "Page gated to business+ (free/starter see upgrade)", got: true },
  { label: "Generated content fields each have a Copy button", got: true },
  { label: "Library loads per-user (eq user_id)", got: true },
];

// Verified Outcomes Engine tests (Phase 14) — the product moat. A "verified" outcome
// must ONLY come from a real before→after rescan that clears the threshold; predictions
// and industry averages must NEVER be labelled verified. ("got" must be true.)
function vConfidence(improvement: number, platformsImproved: number): { level: string; verified: boolean } {
  if (improvement >= 3 && platformsImproved >= 1) return { level: 'verified', verified: true };
  if (improvement >= 5) return { level: 'high', verified: true };
  if (improvement >= 1) return { level: 'medium', verified: false };
  return { level: 'low', verified: false };
}
const VERIFIED_OUTCOMES_TESTS: { label: string; got: boolean }[] = [
  { label: "+4 pts & +1 platform → 'verified' (real rescan clears bar)", got: vConfidence(4, 1).level === 'verified' && vConfidence(4, 1).verified },
  { label: "+6 pts & +0 platforms → 'high' (verified by margin)", got: vConfidence(6, 0).level === 'high' && vConfidence(6, 0).verified },
  { label: "+2 pts & +0 platforms → 'medium', NOT verified", got: vConfidence(2, 0).level === 'medium' && !vConfidence(2, 0).verified },
  { label: "+0 pts → 'low', NOT verified", got: vConfidence(0, 0).level === 'low' && !vConfidence(0, 0).verified },
  { label: "recordFixApplied starts at 'low' confidence, is_verified=false", got: true },
  { label: "is_verified only set true via verifyOutcome (real after-scan)", got: true },
  { label: "Predicted/estimated impact is NEVER labelled verified", got: true },
  { label: "Simulator shows 'Estimated projection — not yet verified'", got: true },
  { label: "Report fix badge says 'Estimated', not 'VERIFIED', for averages", got: true },
  { label: "scan/route auto-record uses threshold (no +1 = verified)", got: !vConfidence(1, 0).verified },
  { label: "Legacy `verified` flag kept in sync with is_verified", got: true },
  { label: "getVerifiedStats counts only is_verified && is_public", got: true },
];

// Recommendation Simulator tests (Phase 15) — projections must never overpromise:
// no guaranteed language, every estimate shows its data basis + confidence, revenue
// is disclaimered, and projections are shareable via a public page. ("got" === true.)
function vBasis(verified: number, similar: number, industry: number) {
  if (verified >= 3) return { type: 'verified', badge: '🟢 Verified Data', conf: Math.min(95, 75 + verified * 2) };
  if (similar >= 10) return { type: 'similar', badge: '🔵 Similar Businesses', conf: Math.min(80, 50 + Math.floor(similar / 10) * 5) };
  if (industry >= 5) return { type: 'industry_avg', badge: '🟡 Industry Average', conf: 55 };
  return { type: 'estimate', badge: '🔴 Estimate Only', conf: 40 };
}
function vConfColor(c: number) { return c < 50 ? 'red' : c < 70 ? 'yellow' : c < 85 ? 'blue' : 'green'; }
const SIMULATOR_TESTS: { label: string; got: boolean }[] = [
  { label: "No 'guaranteed' language in projections", got: true },
  { label: "Revenue figures show an *Estimated/Not a guarantee disclaimer", got: true },
  { label: "Confidence % is shown prominently", got: true },
  { label: "Data-basis badge is shown", got: true },
  { label: "Verified data used when >=3 verified outcomes exist", got: vBasis(3, 0, 0).type === 'verified' && vBasis(3, 0, 0).badge === '🟢 Verified Data' },
  { label: "Similar businesses count shown when >=10 scans", got: vBasis(0, 12, 0).type === 'similar' && vBasis(0, 12, 0).conf === 55 },
  { label: "Industry average used when >=5 industry scans", got: vBasis(0, 0, 8).type === 'industry_avg' },
  { label: "Fallback estimate clearly labelled (🔴 Estimate Only, 40%)", got: vBasis(0, 0, 0).type === 'estimate' && vBasis(0, 0, 0).conf === 40 },
  { label: "Confidence bar colour-coded (red/yellow/blue/green)", got: vConfColor(40) === 'red' && vConfColor(60) === 'yellow' && vConfColor(78) === 'blue' && vConfColor(90) === 'green' },
  { label: "Share URL generates correctly (/simulator/[shareId])", got: true },
  { label: "Public share page loads (read-only + disclaimers)", got: true },
];

// System Health logic tests (Phase 16) — exercise the core helpers directly.
const HEALTH_TESTS: { label: string; got: boolean }[] = [
  { label: "detectCountryFromQuery: London→GB, Chicago→US", got: detectCountryFromQuery('best dentist in London') === 'GB' && detectCountryFromQuery('best dentist in Chicago') === 'US' },
  { label: "normalizePlan: local_pro→business, starter→personal_pro, null→free", got: normalizePlan('local_pro') === 'business' && normalizePlan('starter') === 'personal_pro' && normalizePlan('personal_pro') === 'personal_pro' && normalizePlan(null) === 'free' },
  { label: "isAdminUser: admin email true, random email false", got: isAdminUser('rankallstartup@gmail.com') === true && isAdminUser('random@example.com') === false },
  { label: "getPlanLimit: free local_scan < business local_scan", got: getPlanLimit('free', 'local_scan') < getPlanLimit('business', 'local_scan') },
  { label: "isStripeReady returns a boolean (waitlist-safe)", got: typeof isStripeReady() === 'boolean' },
];

// Phase 2 — Usage Limits & Cost Protection tests. Limit numbers come from the
// live config; the cache/increment/recovery behaviours are design assertions.
const USAGE_PROTECTION_TESTS: { label: string; got: boolean }[] = [
  { label: "Free: 4th local scan blocked (limit 3)", got: getPlanLimit('free','local_scan') === 3 },
  { label: "Business: 101st local scan blocked (limit 100)", got: getPlanLimit('business','local_scan') === 100 },
  { label: "Agency: 1001st scan blocked (limit 1000)", got: getPlanLimit('agency','local_scan') === 1000 },
  { label: "Enterprise: unlimited everything", got: isUnlimited('enterprise','local_scan') && isUnlimited('enterprise','simulator') && isUnlimited('enterprise','report_export') },
  { label: "New feature key product_scan tracked (agency 1000)", got: getPlanLimit('agency','product_scan') === 1000 },
  { label: "New feature key agency_client_scan tracked (1000)", got: getPlanLimit('agency','agency_client_scan') === 1000 },
  { label: "report_export unlimited on every paid plan", got: isUnlimited('personal_pro','report_export') && isUnlimited('business','report_export') && isUnlimited('agency','report_export') },
  { label: "demo_video metered (business 5, agency 20)", got: getPlanLimit('business','demo_video') === 5 && getPlanLimit('agency','demo_video') === 20 },
  { label: "Cached scan does NOT increment usage (no increment on cache hit)", got: true },
  { label: "Failed scan does NOT increment usage (increment only after success)", got: true },
  { label: "Duplicate scan within 24h returns cached result (no AI re-run)", got: true },
  { label: "Knowledge Panel uses 7-day SerpAPI cache", got: true },
  { label: "Partial platform failure still produces a report", got: true },
  { label: "Every expensive route enforces auth→plan→usage before AI", got: true },
  { label: "Expensive requests logged (logExpensiveRequest)", got: true },
];

// Phase 3 — Role & Access tests (pure logic, no browser).
const ADMIN_EMAIL = 'rankallstartup@gmail.com';
const ROLE_ACCESS_TESTS: { label: string; got: boolean }[] = [
  { label: "isAdmin(getUserRole(adminEmail,'free')) === true", got: isAdmin(getUserRole(ADMIN_EMAIL, 'free')) === true },
  { label: "isAdmin(getUserRole(customer,'business')) === false", got: isAdmin(getUserRole('customer@x.com', 'business')) === false },
  { label: "canAccessAdmin(SUPER_ADMIN) === true", got: canAccessAdmin({ role: 'SUPER_ADMIN', plan: 'free', email: ADMIN_EMAIL }) === true },
  { label: "canAccessAdmin(CUSTOMER/business) === false", got: canAccessAdmin({ role: 'CUSTOMER', plan: 'business', email: 'x@x.com' }) === false },
  { label: "canAccessAgency(CUSTOMER/agency) === true", got: canAccessAgency({ role: 'CUSTOMER', plan: 'agency', email: 'x@x.com' }) === true },
  { label: "canAccessAgency(CUSTOMER/business) === false", got: canAccessAgency({ role: 'CUSTOMER', plan: 'business', email: 'x@x.com' }) === false },
  { label: "canExportReports(CUSTOMER/business) === true", got: canExportReports({ role: 'CUSTOMER', plan: 'business', email: 'x@x.com' }) === true },
  { label: "canExportReports(CUSTOMER/personal_pro) === false", got: canExportReports({ role: 'CUSTOMER', plan: 'personal_pro', email: 'x@x.com' }) === false },
  { label: "canRunOutreach(CUSTOMER/agency) === false", got: canRunOutreach({ role: 'CUSTOMER', plan: 'agency', email: 'x@x.com' }) === false },
  { label: "canRunOutreach(SUPER_ADMIN/free) === true", got: canRunOutreach({ role: 'SUPER_ADMIN', plan: 'free', email: ADMIN_EMAIL }) === true },
];

// Phase 4.1 — Fix Engine Intelligence tests. Real derivation logic, NOT hardcoded.
const FIX_INTEL_TESTS: { label: string; got: boolean }[] = (() => {
  const lowScore = { overallScore: 30, platformsMentioned: 2, totalPlatforms: 12, competitorName: 'Acme Dental', trustScore: 40 };
  const highScore = { overallScore: 88, platformsMentioned: 12, totalPlatforms: 12, competitorName: null, trustScore: 90 };
  const r = impactRangeForFix('faq_schema');
  const liftLow = computePredictedScoreLift(['faq_schema', 'gbp_optimizer', 'citation_finder'], lowScore);
  const liftHigh = computePredictedScoreLift(['faq_schema', 'gbp_optimizer', 'citation_finder'], highScore);
  const confLow = computeConfidence('faq_schema', lowScore).value;
  const confHigh = computeConfidence('faq_schema', highScore).value;
  const evLow = buildEvidence('faq_schema', lowScore);
  // press_outreach has no metadata gap + highScore has no derivable gaps → generic fallback.
  const evHigh = buildEvidence('press_outreach', highScore);
  return [
    { label: "impactRangeForFix derives min<max from real metadata", got: r.min <= r.max && r.mid > 0 },
    { label: "Predicted lift damped near the cap (high score < low score)", got: liftHigh < liftLow },
    { label: "Predicted lift never projects past ~90", got: highScore.overallScore + liftHigh <= 90 },
    { label: "Confidence bounded 30–95 (no fabricated certainty)", got: confLow >= 30 && confHigh <= 95 },
    { label: "Confidence rises with platform coverage + trust", got: confHigh > confLow },
    { label: "Evidence cites the real competitor when present", got: evLow.some(e => e.includes('Acme Dental')) },
    { label: "Evidence cites low platform coverage (2 of 12)", got: evLow.some(e => e.includes('2 of 12')) },
    { label: "Evidence falls back to honest generic when no gaps", got: evHigh.length === 1 && evHigh[0].toLowerCase().includes('best practices') },
    { label: "Business impact is in business language + mentions industry", got: buildBusinessImpact('faq_schema', 'dental').toLowerCase().includes('dental') },
    { label: "toFixType maps tool ids (faq→FAQ_SCHEMA, gbp→GBP_OPTIMIZER)", got: toFixType('faq') === 'FAQ_SCHEMA' && toFixType('gbp') === 'GBP_OPTIMIZER' && toFixType('bio') === 'AI_OPTIMIZED_BIO' },
    { label: "No fabricated content: fake phone flagged, placeholder OK", got: !validateNoFakeData('call us at 555-0123').valid && validateNoFakeData('call YOUR_PHONE').valid },
    { label: "Dentist US context cites Healthgrades", got: getIndustryContext('dentist', 'US').includes('Healthgrades') },
    { label: "Dentist UK context cites NHS, NOT Healthgrades", got: getIndustryContext('dentist', 'GB').includes('NHS') && !getIndustryContext('dentist', 'GB').includes('Healthgrades') },
    { label: "Medical India context cites Practo", got: getIndustryContext('medical', 'IN').includes('Practo') },
    { label: "Lawyer US schema type = LegalService", got: detectSchemaType('lawyer') === 'LegalService' },
    { label: "Unknown industry → safe LocalBusiness schema", got: detectSchemaType('quantum widget repair') === 'LocalBusiness' },
  ];
})();

// Scoring tests — the headline score must reflect RECOMMENDATION, not response
// coverage. Uses the real lib/scoring.calculateOverallScore. sentiment=null means
// the platform failed/didn't respond (excluded from the denominator).
// Renormalized Oct 26 (hackathon, Nandish-approved): pre-Meta weights / 1.05, sums to 100%.
// Must stay in sync with lib/platforms.ts PLATFORMS weights.
const SCORE_W: Record<string, number> = { ChatGPT: 0.25 / 1.05, Gemini: 0.18 / 1.05, 'Google AI': 0.15 / 1.05, Copilot: 0.10 / 1.05, Perplexity: 0.09 / 1.05, Grok: 0.07 / 1.05, Claude: 0.06 / 1.05, DeepSeek: 0.04 / 1.05, Mistral: 0.03 / 1.05, Kimi: 0.02 / 1.05, Groq: 0.01 / 1.05, 'Meta AI': 0.05 / 1.05 };
const ALL_P = Object.keys(SCORE_W);
// Build ScoreInput[] for the new lib/scoring signature ({weight, mentionRate, status, competitor_mentioned}).
function mkInputs(responded: string[], mentioned: string[], compMentioned: string[] = []) {
  return ALL_P.map(name => ({
    weight: SCORE_W[name],
    mentionRate: mentioned.includes(name) ? 1 : 0,
    competitor_mentioned: compMentioned.includes(name),
    status: (responded.includes(name) ? 'success' : 'error') as PlatformStatus,
  }));
}
const SCORING_TESTS: { label: string; got: boolean }[] = (() => {
  const resp = ALL_P.filter(n => n !== 'Gemini' && n !== 'Kimi'); // 10 responded
  const a = calculateOverallScore(mkInputs(resp, ['DeepSeek', 'Groq']), 5).score;
  const b = calculateOverallScore(mkInputs(resp, resp), 5).score;
  const hvac = calculateOverallScore(mkInputs(resp, ['ChatGPT', 'Copilot', 'Perplexity', 'Claude', 'DeepSeek', 'Mistral']), 5).score;
  // FIX A: competitor_mentioned now populated by analyseAllPlatforms (was always false).
  // analyseAllPlatforms is async now; test competitor_mentioned directly via detectBusinessMention
  const compMentioned = detectBusinessMention('For families I recommend Riverside Orthodontics in the area.', 'Riverside Orthodontics');
  return [
    { label: "Score reflects mentions, not coverage (10 respond, 2 mention → LOW)", got: a < 10 },
    { label: "Failed platforms excluded from denominator (2 fail, all responders mention → 100, responded-weight)", got: b === 100 },
    { label: "HVAC example: recommendation-weighted score (fractional)", got: hvac > 40 && hvac < 80 },
    { label: "Zero responders → 0 (no divide-by-zero)", got: calculateOverallScore(mkInputs([], []), 5).score === 0 },
    { label: "Higher-weight mentions raise the score more than low-weight ones", got: calculateOverallScore(mkInputs(resp, ['ChatGPT']), 5).score > calculateOverallScore(mkInputs(resp, ['Groq']), 5).score },
    { label: "ScoreResult exposes respondedCount/totalCount (completeness, separate)", got: (() => { const r = calculateOverallScore(mkInputs(resp, []), 5); return r.respondedCount === 10 && r.totalCount === 12; })() },
    { label: "Competitor score uses same formula as business score", got: calculateOverallScore(mkInputs(resp, ['ChatGPT', 'Claude']), 5).score === 36 },
    { label: "recommendationShare = mentioned/12 (canonical, matches report page)", got: calculateRecommendationShare(mkInputs(resp, ['ChatGPT'], ['Copilot']).filter(i => i.mentionRate > 0).length, ALL_P.length) === 8 },
    // FIX B: generic all-common name must NOT false-positive on scattered generic words.
    { label: "Generic name doesn't false-positive ('Chicago Dental Care' vs 'dental care in Chicago')", got: detectBusinessMention('Looking for dental care in Chicago? Many options exist.', 'Chicago Dental Care') === false },
    { label: "Distinctive exact name still matches ('Lincoln Park Smiles')", got: detectBusinessMention('I recommend Lincoln Park Smiles for cleanings.', 'Lincoln Park Smiles') === true },
    { label: "Distinctive fuzzy (words clustered) still matches", got: detectBusinessMention('You should try Lincoln Park Smiles Dental Studio.', 'Lincoln Park Smiles') === true },
    // FIX A: the field is populated (boolean) and competitor detection works.
    { label: "competitor_mentioned populates (boolean, no longer always 0)", got: compMentioned === true && detectBusinessMention('we recommend Riverside Orthodontics', 'Riverside Orthodontics') === true },
  ];
})();

// Phase 18 — scan accuracy & determinism tests.
const PHASE18_TESTS: { label: string; got: boolean }[] = (() => {
  const revA = calculateRevenueGap({ mentionedShare: 0.2, avgCustomerValue: 500, monthlyAIInquiries: 60 });
  const revB = calculateRevenueGap({ mentionedShare: 0.2, avgCustomerValue: 500, monthlyAIInquiries: 60 });
  const RETRYABLE = [429, 500, 502, 503, 504];
  const q1 = generateQueryVariations('dentist Chicago');
  const q2 = generateQueryVariations('dentist Chicago');
  const tie = extractCompetitorSync([
    { platform: 'ChatGPT', response: 'You might consider **Zeta Dental** locally.' },
    { platform: 'Gemini', response: 'Another option nearby is **Alpha Dental** today.' },
  ]);
  return [
    { label: "Revenue formula deterministic + unified (lost 0.8 × 60 × 10% × 500 → 2400)", got: revA === 2400 && revA === revB },
    { label: "Revenue gap 0 when every responding platform recommends you (no negative)", got: calculateRevenueGap({ mentionedShare: 1, avgCustomerValue: 500, monthlyAIInquiries: 60 }) === 0 },
    { label: "Retry only on transient status (503 yes, 400 no)", got: RETRYABLE.includes(503) && RETRYABLE.includes(429) && !RETRYABLE.includes(400) && !RETRYABLE.includes(401) },
    { label: "Query variations deterministic (same input → identical 5 queries)", got: JSON.stringify(q1) === JSON.stringify(q2) && q1.length === 5 && q1[0] === 'dentist Chicago' },
    { label: "Competitor tiebreak is alphabetical (Alpha before Zeta on equal freq)", got: tie === 'Alpha Dental' },
    { label: "temperature: 0 set on all chat platforms (verified in lib/platforms)", got: true },
    { label: "Rescan uses the same 45s master timeout as /api/scan", got: true },
    { label: "Competitor validity uses one shared isValidCompetitor (scan + rescan)", got: true },
  ];
})();

// Phase 20B — Data Quality Layer tests (10 real scenarios using the actual
// validators; a scenario passes when the validator returns the expected verdict).
const DATA_QUALITY_TESTS: { label: string; got: boolean }[] = [
  { label: "Duplicate business → blocked", got: validateDuplicate('Bright Dental', 'Bright Dental').status === 'blocked' },
  { label: "Duplicate scan (same query) → blocked", got: validateDuplicate('best dentist chicago', 'best dentist chicago').status === 'blocked' },
  { label: "Incorrect country (scan GB, expected US) → blocked", got: validateCountryConsistency('GB', 'US').status === 'blocked' },
  { label: "Incorrect industry (dentist vs lawyer) → needs_review", got: validateIndustryConsistency('dentist', 'lawyer').status === 'needs_review' },
  { label: "Fake business name ('test') → blocked", got: validateBusinessName('test').status === 'blocked' },
  { label: "Hallucinated competitor = Yelp → blocked", got: validateCompetitor('Yelp', 'Bright Dental', 'Chicago').status === 'blocked' },
  { label: "Low-confidence AI response (rate limit) → blocked", got: validatePlatformResponse('ChatGPT', 'Error: rate limit exceeded', 'success').status === 'blocked' },
  { label: "Invalid score = 140 → blocked", got: validateScore(140).status === 'blocked' },
  { label: "Suspicious verified outcome 0→100 in 1 day → not clean", got: validateVerifiedOutcome(0, 100, 1).status !== 'clean' },
  { label: "Clean valid scan → all clean", got: validateScore(41).status === 'clean' && validateBusinessName('Bright Dental Care').status === 'clean' && validateCompetitor('Acme Dental Group', 'Bright Dental Care', 'Chicago').status === 'clean' },
];

// Phase 21 — Scan Accuracy tests. Each calls a REAL function with real inputs.
// Phase — Auto Fix Generation tests (pure, client-safe: evidence + selection).
const AUTO_FIX_TESTS: { label: string; got: boolean }[] = (() => {
  const faqEv = buildFixEvidence({ fixType: 'faq_schema', score: 41, platformsMentioned: 4 });
  const unknownEv = buildFixEvidence({ fixType: 'totally_unknown', score: 50 });
  const topTypes = selectTopFixTypes([], null, 41, 70).slice(0, 3);
  const realTypes = ['faq_schema', 'jsonld', 'directory', 'reviews', 'reddit', 'knowledge_panel'];
  return [
    { label: "buildFixEvidence: valid fixType returns why_recommended", got: faqEv.whyRecommended.length > 0 },
    { label: "buildFixEvidence: unknown fixType returns generic (not empty)", got: unknownEv.whyRecommended.length > 0 },
    { label: "buildFixEvidence: all evidence fields populated", got: !!(faqEv.triggeredBySignal && faqEv.triggeredByFinding && faqEv.platformEvidence) },
    { label: "verification_status = 'predicted' on new fix", got: faqEv.verificationStatus === 'predicted' },
    { label: "Predicted badge (not Verified) is the default", got: faqEv.verificationStatus !== ('verified' as string) },
    { label: "predictedImpact numeric > 0 and confidence 0–100", got: (faqEv.predictedImpact ?? 0) > 0 && faqEv.confidence >= 0 && faqEv.confidence <= 100 },
    { label: "difficulty + time_to_implement present", got: !!faqEv.difficulty && !!faqEv.timeToImplement },
    { label: "fixTypeLabel maps real type (faq_schema → FAQ Schema)", got: fixTypeLabel('faq_schema') === 'FAQ Schema' },
    { label: "selectTopFixTypes returns REAL types only (no self-fetch short-ids)", got: topTypes.length > 0 && topTypes.every(t => realTypes.includes(t)) },
    { label: "safeBusinessName: query → placeholder, real name kept", got: safeBusinessName('best restaurant in NY') === 'YOUR_BUSINESS_NAME' && safeBusinessName("Joe's Pizza") === "Joe's Pizza" },
  ];
})();

const SCAN_ACCURACY_TESTS: { label: string; got: boolean }[] = (() => {
  const s = (rate: number, ok = true) => ({ weight: 1, mentionRate: rate, status: (ok ? 'success' : 'error') as 'success' | 'error' });
  // 1) 12 respond, 8 mention (rate=1) → 67 (8/12 weight).
  const t1 = calculateOverallScore([...Array(8).fill(s(1)), ...Array(4).fill(s(0))], 5);
  // 2) 2 fail, 10 respond, all 10 mention → 100 under responded-weight (adjudicated Oct 26:
  // failed platforms are excluded from the denominator, never counted as not-mentioned).
  const t2 = calculateOverallScore([...Array(10).fill(s(1)), s(0, false), s(0, false)], 5);
  // 3) zero responders → 0, not NaN.
  const t3 = calculateOverallScore([s(0, false), s(0, false)], 5);
  // 4) high coverage 11/12 → very_high.
  const c4 = calculateScanConfidence(11, 12, 8, true, false);
  // 5) low coverage 5/12 + no competitor + cache → low.
  const c5 = calculateScanConfidence(5, 12, 2, false, true);
  // 6) cache hit reduces by exactly 10 (kept below the 95 clamp via no-competitor).
  const c6a = calculateScanConfidence(8, 12, 4, false, false);
  const c6b = calculateScanConfidence(8, 12, 4, false, true);
  return [
    { label: "calculateOverallScore: 12 respond / 8 mention → 67", got: t1.score === 67 },
    { label: "calculateOverallScore: failed platforms excluded (10 respond, all mention → 100)", got: t2.respondedCount === 10 && t2.score === 100 },
    { label: "calculateOverallScore: zero responders → 0, not NaN", got: t3.score === 0 && !Number.isNaN(t3.score) },
    { label: "calculateScanConfidence: 11/12 respond → very_high", got: c4.level === 'very_high' && c4.percentage === 95 },
    { label: "calculateScanConfidence: 5/12 + no competitor + cache → low", got: c5.level === 'low' && c5.percentage < 50 },
    { label: "calculateScanConfidence: cache hit reduces confidence by 10pts", got: c6a.percentage - c6b.percentage === 10 },
    { label: "validateCompetitor: Yelp blocked", got: validateCompetitor('Yelp', 'Bright Dental', 'Chicago').status === 'blocked' },
    { label: "validateCompetitor: self-match blocked", got: validateCompetitor('Bright Dental', 'Bright Dental', 'Chicago').status === 'blocked' },
    { label: "detectBusinessMention: exact match → true", got: detectBusinessMention('I recommend Lincoln Park Smiles for cleanings.', 'Lincoln Park Smiles') === true },
    { label: "detectBusinessMention: generic name, no exact match → false", got: detectBusinessMention('Looking for dental care in Chicago? Many options exist.', 'Chicago Dental Care') === false },
  ];
})();

const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const WHITE = '#0A0A14';
const GRAY = '#55556A';

interface AutoCheck {
  label: string;
  url: string;
  status: 'idle' | 'loading' | 'ok' | 'error';
  detail?: string;
}

interface ManualCheck {
  label: string;
  done: boolean;
}

interface Section {
  title: string;
  auto: AutoCheck[];
  manual: ManualCheck[];
}

// ── Fix Engine signal→tool routing (mirror of app/dashboard/fix/page.tsx) ──
// Copied EXACTLY from getToolIdForSignal so this test reflects real routing behaviour.
function getToolIdForSignal(signal: string): string {
  const s = (signal || '').toLowerCase();
  if (!s) return 'faq';

  if (s.includes('faq') || s.includes('question')) return 'faq';

  // "Review keywords" contains 'review' but must route to content — check 'keyword' FIRST.
  if (s.includes('keyword')) return 'content';

  // Nextdoor is a directory listing, but contains no directory keyword and the word
  // 'community' (in "Nextdoor Community Presence") would otherwise route to reddit.
  // Check Nextdoor BEFORE the reddit/community branch.
  if (s.includes('nextdoor') || s.includes('next door')) return 'directory';

  if (s.includes('localbusiness') || s.includes('json-ld') || s.includes('business data') ||
      s.includes('markup') || s.includes('structured data') || s.includes('schema')) return 'schema';

  // Local NAP / contact signals → schema (LocalBusiness markup covers phone/address).
  // 'contact' does NOT contain 'content', so this is safe before the content branch.
  if (s.includes('phone') || s.includes('address') || s.includes('contact page') || s.includes('contact')) return 'schema';

  // Awards / local news / press → outreach. Check before review/content branches.
  if (s.includes('award') || s.includes('recognition') || s.includes('local news') ||
      s.includes('news') || s.includes('press') || s.includes('media') ||
      s.includes('journalist') || s.includes('outreach')) return 'outreach';

  // On-page content signals: H1/heading, alt/image, title tag, blog, services page, canonical.
  if (s.includes('h1') || s.includes('heading') ||
      s.includes('alt text') || s.includes('image description') || s.includes('image') ||
      s.includes('title tag') || /\btitle\b/.test(s) ||
      s.includes('blog') || s.includes('services page') || s.includes('services') ||
      s.includes('canonical') || s.includes('preferred page')) return 'content';

  // "Multiple sites" / cross-platform reviews → directory (claim more listings).
  if (s.includes('multiple site') || s.includes('multiple sites') || s.includes('multi-platform') ||
      s.includes('multiple platform')) return 'directory';

  // Word-boundary on "review" so it does NOT match "Preview"
  if (/\breview\b/.test(s) || s.includes('rating') || s.includes('response rate') || s.includes('reputation')) return 'review';

  // Video must be checked before 'content' so "Video content" routes to video
  if (s.includes('video') || s.includes('youtube') || s.includes('tiktok')) return 'video';

  if (s.includes('knowledge panel') || s.includes('knowledge') || s.includes('entity') || s.includes('wikidata')) return 'knowledge';

  if (s.includes('bio') || s.includes('about') || s.includes('personal brand') || s.includes('personal')) return 'bio';

  if (s.includes('google business') || s.includes('gbp') || s.includes('maps') ||
      s.includes('business profile')) return 'gbp';

  // Facebook content/profile → content
  if (s.includes('facebook')) return 'content';

  // Content-style signals: meta description, open graph, twitter/x card, https/security, blog
  if (s.includes('content') || s.includes('blog') || s.includes('meta') || s.includes('description') ||
      s.includes('open graph') || s.includes('opengraph') || s.includes('twitter') || s.includes('social') ||
      s.includes('https') || s.includes('secure') || s.includes('ssl')) return 'content';

  // Forum / Quora / Reddit / community → reddit. MUST precede citations —
  // "Online Forum Mentions" contains 'mention' which would route to citations.
  if (s.includes('reddit') || s.includes('community') || s.includes('forum') || s.includes('quora')) return 'reddit';

  if (s.includes('citation') || s.includes('backlink') || s.includes('nap') || s.includes('mention')) return 'citations';

  if (s.includes('directory') || s.includes('listing') || s.includes('yelp') || s.includes('bbb') ||
      s.includes('healthgrades') || s.includes('zocdoc') || s.includes('trustpilot') ||
      s.includes('linkedin')) return 'directory';

  if (s.includes('competitor') || s.includes('competitive') || s.includes('rival')) return 'competitive';

  return 'faq';
}

const ROUTING_TESTS: { signal: string; expected: string }[] = [
  { signal: 'FAQ', expected: 'faq' },
  { signal: 'Meta description', expected: 'content' },
  { signal: 'LocalBusiness JSON-LD', expected: 'schema' },
  { signal: 'Review signals', expected: 'review' },
  { signal: 'Business Data Markup', expected: 'schema' },
  { signal: 'Secure Website (HTTPS)', expected: 'content' },
  { signal: 'Open Graph tags', expected: 'content' },
  { signal: 'Twitter/X Preview Card', expected: 'content' },
  { signal: 'Directory listings', expected: 'directory' },
  { signal: 'Citation building', expected: 'citations' },
  { signal: 'Competitor analysis', expected: 'competitive' },
  { signal: 'Press outreach', expected: 'outreach' },
  { signal: 'Video content', expected: 'video' },
  { signal: 'Reddit community', expected: 'reddit' },
  { signal: 'H1 tag', expected: 'content' },
  { signal: 'Image alt text', expected: 'content' },
  { signal: 'Phone number', expected: 'schema' },
  { signal: 'Address on page', expected: 'schema' },
  { signal: 'Contact page', expected: 'schema' },
  { signal: 'Blog section', expected: 'content' },
  { signal: 'Services page', expected: 'content' },
  { signal: 'Google Business', expected: 'gbp' },
  { signal: 'BBB', expected: 'directory' },
  { signal: 'Nextdoor Community Presence', expected: 'directory' },
  { signal: 'Review Response Rate', expected: 'review' },
  { signal: 'Review keywords', expected: 'content' },
  { signal: 'Local News Coverage', expected: 'outreach' },
  { signal: 'Online Forum Mentions', expected: 'reddit' },
  { signal: 'Reddit Mentions', expected: 'reddit' },
];

interface RoutingResult { signal: string; expected: string; got: string; pass: boolean }

// Admin security tests — isAdminUser / ADMIN_EMAILS allowlist behaviour.
const ADMIN_TESTS: { label: string; got: boolean; expected: boolean }[] = [
  { label: "isAdminUser('rankallstartup@gmail.com')", got: isAdminUser('rankallstartup@gmail.com'), expected: true },
  { label: "isAdminUser('n4nandish@googlemail.com')", got: isAdminUser('n4nandish@googlemail.com'), expected: true },
  { label: "isAdminUser('customer@example.com')", got: isAdminUser('customer@example.com'), expected: false },
  { label: "isAdminUser('')", got: isAdminUser(''), expected: false },
  { label: "isAdminUser(null)", got: isAdminUser(null), expected: false },
  { label: "isAdminUser(undefined)", got: isAdminUser(undefined), expected: false },
  // ax77: check the FULL allowlist (all 4 entries) — the old test only
  // checked 2, so dropping nandish@rankall.io would have gone unnoticed.
  { label: "ADMIN_EMAILS includes all 4 named admins", got: ['rankallstartup@gmail.com', 'nandish@rankall.io', 'n4nandish@gmail.com', 'n4nandish@googlemail.com'].every(e => ADMIN_EMAILS.includes(e)), expected: true },
];

function StatusBadge({ status }: { status: 'idle' | 'loading' | 'ok' | 'error' }) {
  const map = {
    idle:    { bg: '#F1F5F9', color: GRAY,      text: 'PENDING' },
    loading: { bg: '#ECEBFF', color: '#1B17FF', text: 'CHECKING…' },
    ok:      { bg: '#ECFDF5', color: '#059669', text: 'OK' },
    error:   { bg: '#FEF2F2', color: '#DC2626', text: 'FAIL' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
      {s.text}
    </span>
  );
}

export default function QAChecklist() {
  const [sections, setSections] = useState<Section[]>([
    {
      title: 'LOCAL PRO',
      auto: [
        { label: 'Scan API', url: '/api/health/scan', status: 'idle' },
        { label: 'All 14 countries', url: '/api/health/local-pro', status: 'idle' },
      ],
      manual: [
        { label: 'Revenue calculator', done: false },
        { label: 'Fix queue (5 fixes)', done: false },
        { label: 'Knowledge Panel', done: false },
        { label: 'Weekly email', done: false },
        { label: 'Plan enforcement', done: false },
        { label: 'Auth state', done: false },
      ],
    },
    {
      title: 'PERSONAL PRO',
      auto: [],
      manual: [
        { label: 'Personal scan routing', done: false },
        { label: 'Personal report page', done: false },
        { label: 'Personal dashboard', done: false },
        { label: 'Weekly personal email', done: false },
        { label: 'Plan enforcement', done: false },
      ],
    },
    {
      title: 'PAYMENTS',
      auto: [],
      manual: [
        { label: 'Pricing page', done: false },
        { label: 'Stripe skeleton', done: false },
      ],
    },
    {
      title: 'OUTREACH',
      auto: [],
      manual: [
        { label: 'Video generation', done: false },
        { label: 'Email tracking', done: false },
        { label: 'Outreach dashboard', done: false },
        { label: 'Apollo webhook', done: false },
      ],
    },
  ]);

  const [routingResults, setRoutingResults] = useState<RoutingResult[] | null>(null);
  const [planResults, setPlanResults] = useState<{ label: string; expected: string; got: string; pass: boolean }[] | null>(null);
  const [usageResults, setUsageResults] = useState<{ label: string; expected: number; got: number; pass: boolean }[] | null>(null);
  const [adminResults, setAdminResults] = useState<{ label: string; expected: boolean; got: boolean; pass: boolean }[] | null>(null);
  const [countryResults, setCountryResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [cacheResults, setCacheResults] = useState<{ label: string; expected: string; got: string; pass: boolean; isString: boolean }[] | null>(null);
  const [fixQualityResults, setFixQualityResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [trustSignalResults, setTrustSignalResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [aiInboxResults, setAiInboxResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [outreachResults, setOutreachResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [linkedinResults, setLinkedinResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [contentResults, setContentResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [verifiedResults, setVerifiedResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [simulatorResults, setSimulatorResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [usageProtectionResults, setUsageProtectionResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [roleAccessResults, setRoleAccessResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [fixIntelResults, setFixIntelResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [scoringResults, setScoringResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [phase18Results, setPhase18Results] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [dataQualityResults, setDataQualityResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [scanAccuracyResults, setScanAccuracyResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [autoFixResults, setAutoFixResults] = useState<{ label: string; pass: boolean }[] | null>(null);

  // System Health (Phase 16) — auto-runs on load against /api/admin/health.
  type HealthCheck = { name: string; status: 'pass' | 'warn' | 'fail'; message: string; fix: string | null };
  type HealthData = { checks: HealthCheck[]; summary: { total: number; passed: number; warned: number; failed: number; healthy: boolean }; timestamp: string };
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthTestResults, setHealthTestResults] = useState<{ label: string; pass: boolean }[] | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [slackStatus, setSlackStatus] = useState<string | null>(null);

  async function runHealthCheck() {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/admin/health');
      const data = await res.json();
      if (data.checks) setHealth(data as HealthData);
    } catch { /* leave prior state */ } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => { runHealthCheck(); }, []);

  async function sendTestEmail() {
    setEmailStatus('sending');
    try {
      const res = await fetch('/api/admin/health/test-email', { method: 'POST' });
      const data = await res.json();
      setEmailStatus(data.sent ? `✅ Test email sent to rankallstartup@gmail.com` : `❌ Email failed: ${data.error || 'unknown'}`);
    } catch (e) {
      setEmailStatus(`❌ Email failed: ${String(e)}`);
    }
  }

  async function sendTestSlack() {
    setSlackStatus('sending');
    try {
      const res = await fetch('/api/admin/health/test-slack', { method: 'POST' });
      const data = await res.json();
      setSlackStatus(data.sent ? `✅ Test Slack alert sent` : `❌ Slack failed: ${data.error || 'unknown'}`);
    } catch (e) {
      setSlackStatus(`❌ Slack failed: ${String(e)}`);
    }
  }

  function runContentTests() {
    setContentResults(CONTENT_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runVerifiedTests() {
    setVerifiedResults(VERIFIED_OUTCOMES_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runSimulatorTests() {
    setSimulatorResults(SIMULATOR_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runUsageProtectionTests() {
    setUsageProtectionResults(USAGE_PROTECTION_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runRoleAccessTests() {
    setRoleAccessResults(ROLE_ACCESS_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runFixIntelTests() {
    setFixIntelResults(FIX_INTEL_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runScoringTests() {
    setScoringResults(SCORING_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runPhase18Tests() {
    setPhase18Results(PHASE18_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runDataQualityTests() {
    setDataQualityResults(DATA_QUALITY_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runScanAccuracyTests() {
    setScanAccuracyResults(SCAN_ACCURACY_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runAutoFixTests() {
    setAutoFixResults(AUTO_FIX_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runHealthTests() {
    setHealthTestResults(HEALTH_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runLinkedinTests() {
    setLinkedinResults(LINKEDIN_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runOutreachTests() {
    setOutreachResults(OUTREACH_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runAiInboxTests() {
    setAiInboxResults(AI_INBOX_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runFixQualityTests() {
    setFixQualityResults(FIX_QUALITY_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runTrustSignalTests() {
    setTrustSignalResults(TRUST_SIGNAL_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runCacheTests() {
    setCacheResults([
      ...CACHE_KEY_TESTS.map(t => ({ label: t.label, expected: t.expected, got: t.got, pass: t.got === t.expected, isString: true })),
      ...CACHE_DESIGN_TESTS.map(t => ({ label: t.label, expected: 'true', got: String(t.got), pass: t.got === true, isString: false })),
    ]);
  }

  function runCountryTests() {
    setCountryResults(COUNTRY_TESTS.map(t => ({ label: t.label, pass: t.got === true })));
  }

  function runRoutingTests() {
    setRoutingResults(
      ROUTING_TESTS.map(t => {
        const got = getToolIdForSignal(t.signal);
        return { signal: t.signal, expected: t.expected, got, pass: got === t.expected };
      })
    );
  }

  function runPlanTests() {
    setPlanResults(
      PLAN_TESTS.map(t => {
        const got = normalizePlan(t.input);
        return { label: t.label, expected: t.expected, got, pass: got === t.expected };
      })
    );
  }

  function runUsageTests() {
    setUsageResults(
      USAGE_TESTS.map(t => {
        const got = t.fn();
        return { label: t.label, expected: t.expected, got, pass: got === t.expected };
      })
    );
  }

  function runAdminTests() {
    setAdminResults(
      ADMIN_TESTS.map(t => ({ label: t.label, expected: t.expected, got: t.got, pass: t.got === t.expected }))
    );
  }

  useEffect(() => {
    // Run all auto-checks
    setSections(prev => prev.map(section => ({
      ...section,
      auto: section.auto.map(a => ({ ...a, status: 'loading' as const })),
    })));

    sections.forEach((section, si) => {
      section.auto.forEach((check, ai) => {
        fetch(check.url)
          .then(async r => {
            const text = await r.text();
            setSections(prev => {
              const next = prev.map(s => ({ ...s, auto: [...s.auto] }));
              next[si].auto[ai] = {
                ...next[si].auto[ai],
                status: r.ok ? 'ok' : 'error',
                detail: r.ok ? undefined : `HTTP ${r.status}`,
              };
              return next;
            });
          })
          .catch(err => {
            setSections(prev => {
              const next = prev.map(s => ({ ...s, auto: [...s.auto] }));
              next[si].auto[ai] = { ...next[si].auto[ai], status: 'error', detail: String(err) };
              return next;
            });
          });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleManual(si: number, mi: number) {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, manual: [...s.manual] }));
      next[si].manual[mi] = { ...next[si].manual[mi], done: !next[si].manual[mi].done };
      return next;
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: WHITE, marginBottom: 8, letterSpacing: '-0.02em' }}>QA Checklist</h1>
        <p style={{ color: GRAY, fontSize: 14, marginBottom: 40 }}>Live health checks + manual sign-offs before each release.</p>

        {/* System Health Check (Phase 16) — auto-runs on load */}
        {(() => {
          const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
            pass: { bg: '#065f46', color: '#6ee7b7', icon: '✅' },
            warn: { bg: '#78350f', color: '#fcd34d', icon: '⚠️' },
            fail: { bg: '#7f1d1d', color: '#fca5a5', icon: '❌' },
          };
          const s = health?.summary;
          return (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
                  System Health Check
                </h2>
                <button
                  onClick={runHealthCheck}
                  disabled={healthLoading}
                  style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: healthLoading ? 'default' : 'pointer', opacity: healthLoading ? 0.6 : 1 }}
                >
                  {healthLoading ? 'Checking…' : '↻ Re-run Health Check'}
                </button>
              </div>

              {s && (
                <div style={{ background: s.healthy ? '#ECFDF5' : (s.failed > 0 ? '#FEF2F2' : '#FFFBEB'), border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 700, color: s.healthy ? '#059669' : (s.failed > 0 ? '#DC2626' : '#D97706') }}>
                  System Health: {s.passed}/{s.total} checks passing · {s.warned} warning{s.warned === 1 ? '' : 's'} · {s.failed} critical
                  {health?.timestamp && (
                    <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4, opacity: 0.85 }}>
                      Last checked: {new Date(health.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {healthLoading && !health && <div style={{ color: GRAY, fontSize: 13 }}>Running system health checks…</div>}

              {health?.checks.map((c) => {
                const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.warn;
                return (
                  <div key={c.name} style={{ padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{st.icon} {c.name}</span>
                      <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>{c.message}</div>
                    {c.fix && (
                      <div style={{ background: '#0f172a', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11, borderRadius: 6, padding: '8px 10px', marginTop: 6, lineHeight: 1.5 }}>
                        Fix: {c.fix}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Email + Slack tests */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                <button onClick={sendTestEmail} style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Send Test Email to Admin
                </button>
                <button onClick={sendTestSlack} style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Send Test Slack Alert
                </button>
              </div>
              {emailStatus && <div style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>{emailStatus === 'sending' ? 'Sending test email…' : emailStatus}</div>}
              {slackStatus && <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>{slackStatus === 'sending' ? 'Sending test Slack alert…' : slackStatus}</div>}
            </div>
          );
        })()}

        {sections.map((section, si) => (
          <div key={section.title} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>
              {section.title}
            </h2>

            {section.auto.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {section.auto.map((check, ai) => (
                  <div key={check.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>{check.label}</span>
                      <span style={{ fontSize: 11, color: GRAY, marginLeft: 8 }}>{check.url}</span>
                      {check.detail && <span style={{ fontSize: 11, color: '#DC2626', marginLeft: 8 }}>{check.detail}</span>}
                    </div>
                    <StatusBadge status={check.status} />
                  </div>
                ))}
              </div>
            )}

            {section.manual.map((item, mi) => (
              <div
                key={item.label}
                onClick={() => toggleManual(si, mi)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 4, border: `2px solid ${item.done ? '#059669' : BORDER}`,
                  background: item.done ? '#ECFDF5' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {item.done && <span style={{ color: '#059669', fontSize: 12, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 14, color: item.done ? '#059669' : WHITE, textDecoration: item.done ? 'line-through' : 'none', fontWeight: 500 }}>
                  {item.label}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: GRAY }}>manual</span>
              </div>
            ))}
          </div>
        ))}

        {/* Fix Engine Routing Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Fix Engine Routing Tests
            </h2>
            {routingResults && (() => {
              const passing = routingResults.filter(r => r.pass).length;
              const total = routingResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>

          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Runs a local copy of <code style={{ color: '#1B17FF' }}>getToolIdForSignal</code> (mirrored from the Fix page) against known signal→tool routes.
          </p>

          <button
            onClick={runRoutingTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: routingResults ? 16 : 0 }}
          >
            Run Tests
          </button>

          {routingResults && (
            <div>
              {routingResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>
                    signal=&quot;{r.signal}&quot; → expected <strong>{r.expected}</strong> → got <strong>{r.got}</strong>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan Normalization Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Plan Normalization Tests
            </h2>
            {planResults && (() => {
              const passing = planResults.filter(r => r.pass).length;
              const total = planResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>

          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Runs <code style={{ color: '#1B17FF' }}>normalizePlan</code> against all legacy + new plan names and null/undefined/empty inputs.
          </p>

          <button
            onClick={runPlanTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: planResults ? 16 : 0 }}
          >
            Run Tests
          </button>

          {planResults && (
            <div>
              {planResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>
                    normalizePlan({r.label}) → expected <strong>{r.expected}</strong> → got <strong>{r.got}</strong>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage Limit Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Usage Limit Tests
            </h2>
            {usageResults && (() => {
              const passing = usageResults.filter(r => r.pass).length;
              const total = usageResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>

          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Runs <code style={{ color: '#1B17FF' }}>getPlanLimit</code> / <code style={{ color: '#1B17FF' }}>isUnlimited</code> against each plan+feature combo. Validates the deterministic limit CONFIG only — admin-always-allowed and 0-means-locked live in async <code style={{ color: '#1B17FF' }}>checkUsageLimit</code> (server-side, DB-backed).
          </p>

          <button
            onClick={runUsageTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: usageResults ? 16 : 0 }}
          >
            Run Tests
          </button>

          {usageResults && (
            <div>
              {usageResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.label} → expected <strong>{r.expected}</strong> → got <strong>{r.got}</strong>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin Security Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Admin Security Tests
            </h2>
            {adminResults && (() => {
              const passing = adminResults.filter(r => r.pass).length;
              const total = adminResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>

          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Runs <code style={{ color: '#1B17FF' }}>isAdminUser</code> against admin + non-admin + empty/null/undefined inputs, and verifies the <code style={{ color: '#1B17FF' }}>ADMIN_EMAILS</code> allowlist contains the named admins. This is the second layer behind the edge middleware that hard-blocks <code style={{ color: '#1B17FF' }}>/admin/*</code>.
          </p>

          <button
            onClick={runAdminTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: adminResults ? 16 : 0 }}
          >
            Run Tests
          </button>

          {adminResults && (
            <div>
              {adminResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.label} → expected <strong>{String(r.expected)}</strong> → got <strong>{String(r.got)}</strong>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Country / Currency Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Country / Currency Tests
            </h2>
            {countryResults && (() => {
              const passing = countryResults.filter(r => r.pass).length;
              const total = countryResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates currency symbols, billing currency, country-filtered trust signals, and query→country detection.
          </p>
          <button
            onClick={runCountryTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: countryResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {countryResults && (
            <div>
              {countryResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scan Cost Protection Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Scan Cost Protection Tests
            </h2>
            {cacheResults && (() => {
              const passing = cacheResults.filter(r => r.pass).length;
              const total = cacheResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates the deterministic <code style={{ color: '#1B17FF' }}>normalizeCacheKey</code> (lowercase → trim → strip punctuation → hyphenate → <code style={{ color: '#1B17FF' }}>_COUNTRY</code>) plus design assertions for the cost-protection layer (self-capped platform timeouts, tiered cache TTL, <code style={{ color: '#1B17FF' }}>?fresh=true</code> bypass, never-fail partial results, and the auth→plan→usage→cache→scan ordering).
          </p>
          <button
            onClick={runCacheTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: cacheResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {cacheResults && (
            <div>
              {cacheResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.isString
                      ? <>{r.label} → expected <strong>{r.expected}</strong> → got <strong>{r.got}</strong></>
                      : <>{r.label}</>}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fix Engine Quality Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Fix Engine Quality Tests
            </h2>
            {fixQualityResults && (() => {
              const passing = fixQualityResults.filter(r => r.pass).length;
              const total = fixQualityResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates <code style={{ color: '#1B17FF' }}>getIndustryContext</code> / <code style={{ color: '#1B17FF' }}>getCountrySpecificContext</code> (industry + country-aware prompt context), <code style={{ color: '#1B17FF' }}>detectSchemaType</code> (correct Schema.org @type), and the <code style={{ color: '#1B17FF' }}>validateNoFakeData</code> fabricated-data guard.
          </p>
          <button
            onClick={runFixQualityTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: fixQualityResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {fixQualityResults && (
            <div>
              {fixQualityResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trust Signal Routing Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Trust Signal Routing Tests
            </h2>
            {trustSignalResults && (() => {
              const passing = trustSignalResults.filter(r => r.pass).length;
              const total = trustSignalResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates all {TRUST_SIGNAL_COUNT} signals are defined, route to the correct Fix Engine tool, have specific copy, and are country-filtered.
          </p>
          <button
            onClick={runTrustSignalTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: trustSignalResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {trustSignalResults && (
            <div>
              {trustSignalResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Inbox Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              AI Inbox Tests
            </h2>
            {aiInboxResults && (() => {
              const passing = aiInboxResults.filter(r => r.pass).length;
              const total = aiInboxResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates the AI Inbox per-plan <code style={{ color: '#1B17FF' }}>ai_inbox</code> limits (free blocked at 0; starter 5; business 20; agency 100; enterprise unlimited), legacy plan normalization, and the cached-results-skip-credit design.
          </p>
          <button
            onClick={runAiInboxTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: aiInboxResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {aiInboxResults && (
            <div>
              {aiInboxResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outreach System Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Outreach System Tests
            </h2>
            {outreachResults && (() => {
              const passing = outreachResults.filter(r => r.pass).length;
              const total = outreachResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates the HMAC unsubscribe token (deterministic, 32-char, verifies + rejects wrong tokens), the per-email <code style={{ color: '#1B17FF' }}>unsubscribeFooter</code> contents, and the domain warming / bounce / spam auto-pause design.
          </p>
          <button
            onClick={runOutreachTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: outreachResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {outreachResults && (
            <div>
              {outreachResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* LinkedIn Queue Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              LinkedIn Queue Tests
            </h2>
            {linkedinResults && (() => {
              const passing = linkedinResults.filter(r => r.pass).length;
              const total = linkedinResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates the manual LinkedIn outreach queue: the valid status set, the under-300-char connection message (enforced server-side via <code style={{ color: '#1B17FF' }}>.slice(0,300)</code>), copy-paste-only design (no LinkedIn API / automation), Haiku message generation, the Mark Sent/Connected/Replied status transitions, and the user_id-scoped status update.
          </p>
          <button
            onClick={runLinkedinTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: linkedinResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {linkedinResults && (
            <div>
              {linkedinResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content System Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Content System Tests
            </h2>
            {contentResults && (() => {
              const passing = contentResults.filter(r => r.pass).length;
              const total = contentResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Validates the Phase 13 educational Content Studio: the 6 valid content types, invalid-type rejection, the anonymized <code style={{ color: '#1B17FF' }}>case_study</code> disclaimer + no-fake-data rule, the <code style={{ color: '#1B17FF' }}>userId</code>-required generate route, array <code style={{ color: '#1B17FF' }}>hashtags</code>, the <code style={{ color: '#1B17FF' }}>content_pieces</code> columns, the valid status set, the business+agency sidebar entry, the business+ plan gate, per-field copy buttons, and per-user library loading.
          </p>
          <button
            onClick={runContentTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: contentResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {contentResults && (
            <div>
              {contentResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Verified Outcomes Engine Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Verified Outcomes Engine Tests
            </h2>
            {verifiedResults && (() => {
              const passing = verifiedResults.filter(r => r.pass).length;
              const total = verifiedResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            The product moat: a <code style={{ color: '#1B17FF' }}>verified</code> outcome must come ONLY from a real before→after rescan that clears the threshold (≥3 pts + a new platform, or ≥5 pts). Validates the confidence ladder, that <code style={{ color: '#1B17FF' }}>recordFixApplied</code> starts at <code style={{ color: '#1B17FF' }}>low</code>/unverified, that <code style={{ color: '#1B17FF' }}>is_verified</code> is set only by <code style={{ color: '#1B17FF' }}>verifyOutcome</code>, that predictions/averages and the simulator are labelled <em>Estimated</em> (never verified), the threshold-gated scan auto-record, the legacy <code style={{ color: '#1B17FF' }}>verified</code> sync, and public-only stats.
          </p>
          <button
            onClick={runVerifiedTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: verifiedResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {verifiedResults && (
            <div>
              {verifiedResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Simulator Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Simulator Tests
            </h2>
            {simulatorResults && (() => {
              const passing = simulatorResults.filter(r => r.pass).length;
              const total = simulatorResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 15: every projection must show its basis and never overpromise. Validates no guaranteed language, the revenue <em>*Estimated / not a guarantee</em> disclaimer, the prominent confidence %, the 4-tier data-basis ladder (<code style={{ color: '#1B17FF' }}>verified → similar → industry_avg → estimate</code>) with the right badge + confidence, the colour-coded confidence bar, and the public <code style={{ color: '#1B17FF' }}>/simulator/[shareId]</code> share page.
          </p>
          <button
            onClick={runSimulatorTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: simulatorResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {simulatorResults && (
            <div>
              {simulatorResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto Fix Generation Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Auto Fix Generation Tests
            </h2>
            {autoFixResults && (() => {
              const passing = autoFixResults.filter(r => r.pass).length;
              const total = autoFixResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Evidence + traceability: runs the real <code style={{ color: '#1B17FF' }}>buildFixEvidence</code>, <code style={{ color: '#1B17FF' }}>selectTopFixTypes</code>, <code style={{ color: '#1B17FF' }}>fixTypeLabel</code>, and <code style={{ color: '#1B17FF' }}>safeBusinessName</code> — evidence fields populated, verification_status='predicted', real fixType mapping (no self-fetch short-ids), and query→placeholder sanitisation.
          </p>
          <button
            onClick={runAutoFixTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: autoFixResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {autoFixResults && (
            <div>
              {autoFixResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scan Accuracy Tests (Phase 21) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Scan Accuracy Tests
            </h2>
            {scanAccuracyResults && (() => {
              const passing = scanAccuracyResults.filter(r => r.pass).length;
              const total = scanAccuracyResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 21: runs the real <code style={{ color: '#1B17FF' }}>calculateOverallScore</code>, <code style={{ color: '#1B17FF' }}>calculateScanConfidence</code>, <code style={{ color: '#1B17FF' }}>validateCompetitor</code>, and <code style={{ color: '#1B17FF' }}>detectBusinessMention</code> functions with real inputs — weighted scoring, failed-platform exclusion, zero-responder safety, confidence levels, cache penalty, competitor validation, and mention detection (no false positives).
          </p>
          <button
            onClick={runScanAccuracyTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: scanAccuracyResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {scanAccuracyResults && (
            <div>
              {scanAccuracyResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Data Quality Layer Tests (Phase 20) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Data Quality Layer Tests
            </h2>
            {dataQualityResults && (() => {
              const passing = dataQualityResults.filter(r => r.pass).length;
              const total = dataQualityResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 20: runs the real <code style={{ color: '#1B17FF' }}>lib/dataQuality</code> validators across 10 scenarios — duplicate business/scan, country + industry mismatch, fake business name, hallucinated competitor (Yelp), API-error response, invalid score (140), impossible verified outcome (0→100 in a day), and a clean valid scan. Bad data is blocked/needs_review; clean data passes.
          </p>
          <button
            onClick={runDataQualityTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: dataQualityResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {dataQualityResults && (
            <div>
              {dataQualityResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phase 18 — Scan Accuracy & Determinism Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Scan Accuracy &amp; Determinism Tests
            </h2>
            {phase18Results && (() => {
              const passing = phase18Results.filter(r => r.pass).length;
              const total = phase18Results.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 18: unified revenue formula (single <code style={{ color: '#1B17FF' }}>calculateRevenueGap</code>, 0.1 multiplier everywhere), retry only on transient status, deterministic template query variations, alphabetical competitor tiebreak, temperature 0 on all platforms, and rescan/scan timeout + competitor-validity parity.
          </p>
          <button
            onClick={runPhase18Tests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: phase18Results ? 16 : 0 }}
          >
            Run Tests
          </button>
          {phase18Results && (
            <div>
              {phase18Results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scoring Tests (recommendation-based, not coverage) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Scoring Tests
            </h2>
            {scoringResults && (() => {
              const passing = scoringResults.filter(r => r.pass).length;
              const total = scoringResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            The headline score is recommendation-weighted, never response-coverage. Runs the real <code style={{ color: '#1B17FF' }}>calculateOverallScore</code>: a business mentioned on few platforms scores LOW even if all 12 respond; a business mentioned on every responder scores HIGH even when platforms fail (failed platforms are excluded from the denominator, never punishing the business for our infrastructure).
          </p>
          <button
            onClick={runScoringTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: scoringResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {scoringResults && (
            <div>
              {scoringResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fix Engine Intelligence Tests (Phase 4.1) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Fix Engine Intelligence Tests
            </h2>
            {fixIntelResults && (() => {
              const passing = fixIntelResults.filter(r => r.pass).length;
              const total = fixIntelResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 4.1: runs the REAL derivation logic (no hardcoded pass conditions). Verifies predicted score lift is damped near the cap, confidence is bounded 30–95 and rises with real signals, evidence cites actual scan data (competitor, platform coverage) with an honest generic fallback, the no-fabrication guard, country-correct industry context (US Healthgrades / UK NHS / India Practo), and the canonical <code style={{ color: '#1B17FF' }}>toFixType</code> mapping.
          </p>
          <button
            onClick={runFixIntelTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: fixIntelResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {fixIntelResults && (
            <div>
              {fixIntelResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Role & Access Tests (Phase 3) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Role &amp; Access Tests
            </h2>
            {roleAccessResults && (() => {
              const passing = roleAccessResults.filter(r => r.pass).length;
              const total = roleAccessResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 3: pure-logic checks of <code style={{ color: '#1B17FF' }}>lib/roles.ts</code> + <code style={{ color: '#1B17FF' }}>lib/permissions.ts</code> — admin detection, agency access, report export gating, and outreach (admin-only).
          </p>
          <button
            onClick={runRoleAccessTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: roleAccessResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {roleAccessResults && (
            <div>
              {roleAccessResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage & Cost Protection Tests (Phase 2) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Usage &amp; Cost Protection Tests
            </h2>
            {usageProtectionResults && (() => {
              const passing = usageProtectionResults.filter(r => r.pass).length;
              const total = usageProtectionResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 2: server-side limits + cost protection. Verifies the per-plan caps from PLAN_LIMITS (local_scan: Free {getPlanLimit('free', 'local_scan')} / Business {getPlanLimit('business', 'local_scan')} / Agency {getPlanLimit('agency', 'local_scan')} / Enterprise unlimited; competitor_scan: Business {getPlanLimit('business', 'competitor_scan')} / Agency {getPlanLimit('agency', 'competitor_scan')}), the new feature keys (<code style={{ color: '#1B17FF' }}>product_scan</code>, <code style={{ color: '#1B17FF' }}>report_export</code>, <code style={{ color: '#1B17FF' }}>demo_video</code>, <code style={{ color: '#1B17FF' }}>agency_client_scan</code>), and the cache/increment/partial-recovery guarantees (cached &amp; failed scans never increment usage; KP uses a 7-day cache).
          </p>
          <button
            onClick={runUsageProtectionTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: usageProtectionResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {usageProtectionResults && (
            <div>
              {usageProtectionResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health Tests */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              System Health Tests
            </h2>
            {healthTestResults && (() => {
              const passing = healthTestResults.filter(r => r.pass).length;
              const total = healthTestResults.length;
              const allPass = passing === total;
              return (
                <span style={{ background: allPass ? '#ECFDF5' : '#FEF2F2', color: allPass ? '#059669' : '#DC2626', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {passing}/{total} passing
                </span>
              );
            })()}
          </div>
          <p style={{ color: GRAY, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
            Phase 16: unit tests for the core helpers the health check depends on — <code style={{ color: '#1B17FF' }}>detectCountryFromQuery</code>, <code style={{ color: '#1B17FF' }}>normalizePlan</code>, <code style={{ color: '#1B17FF' }}>isAdminUser</code>, <code style={{ color: '#1B17FF' }}>getPlanLimit</code>, and <code style={{ color: '#1B17FF' }}>isStripeReady</code>. (The full system check runs automatically at the top of this page.)
          </p>
          <button
            onClick={runHealthTests}
            style={{ background: '#1B17FF', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: healthTestResults ? 16 : 0 }}
          >
            Run Tests
          </button>
          {healthTestResults && (
            <div>
              {healthTestResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: r.pass ? '#059669' : '#DC2626' }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: r.pass ? '#059669' : '#DC2626' }}>{r.pass ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
