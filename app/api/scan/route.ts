import { NextRequest, NextResponse, after } from "next/server";
import { detectIntent } from "@/lib/queries";
import { selectTopFixTypes, fixTypeLabel, safeBusinessName, canonicalFixImpact } from "@/lib/fixIntelligence";
import { generateFixForScan } from "@/lib/generateFix";
import { saveScan, supabase, getSupabaseAdmin } from "@/lib/supabase";
import { analyseAllPlatforms, isValidCompetitor } from "@/lib/analyser-ml";
import { generateQueryVariations, computeBasketHash, isValidQueryText, sanitizeQueryBasket, MAX_QUERY_LENGTH } from "@/lib/queryVariations";
import { validateCompetitor } from "@/lib/dataQuality";
import { detectTrustSignals } from "@/lib/trustServer";
import { enrichBusinessData } from "@/lib/enrichment";
import { findOrCreateBusiness, updateBusinessScore } from "@/lib/businessEntity";
import { detectIndustry } from "@/lib/industry-config";
import { trackFunnelEvent, readSourceCookie } from "@/lib/funnel";
import { checkRateLimitDb, clientIpFromHeaders } from "@/lib/rateLimit";
import { isCronRequest } from "@/lib/apiAuth";
import { resolveCountryFromRequest, getCountryConfig, inferCountryFromText } from "@/lib/countryConfig";
import { ACTIVE_PLATFORMS as PLATFORMS, callPlatform, resetStaggerCounters } from "@/lib/platforms";
import { getPlanConfig, isAdminUser, resolvePlanFromSources } from "@/lib/planConfig";
import { checkUsageLimit, incrementUsage } from "@/lib/usageLimits";
import { isTrialingStatus, isTrialLocationBlocked, normalizeScanInput, TRIAL_LOCATION_BLOCKED_MESSAGE } from "@/lib/trialCaps";
import { trialScanCountsAsLocation } from "@/lib/categoryQueryClassifier";
import { checkTrialBusinessUsed, recordTrialBusinessUsage, TRIAL_BUSINESS_USED_MESSAGE } from "@/lib/trialAntiAbuse";
import { getCachedScan, cacheScan, invalidateScanCache } from "@/lib/scanCache";
import { logExpensiveRequest } from "@/lib/usageLog";
import { calculateOverallScore, calculateRecommendationShare, type PlatformStatus } from "@/lib/scoring";
import { isPaidPlan } from "@/lib/planConfig";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@supabase/ssr";
import { detectKnowledgePanel } from "@/lib/knowledgePanel";
import { autoLabelScan } from "@/lib/autoLabel";
import { CATEGORIES } from "@/lib/categories";
import { extractAndStoreCompetitors } from "@/lib/extractCompetitors";
import { shouldSkipEmail } from "@/lib/emailSuppression";

// Vercel function config — 60s is the max on the hobby plan. The platform
// fan-out is additionally capped by a 45s master timeout below so we always
// return partial results well within this limit.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// If the platform fan-out hasn't finished in 45s, proceed with whatever
// responses we have. Each individual platform call self-caps at 8s (see
// lib/platforms.ts), so this is a safety net, not the normal path.
const MASTER_TIMEOUT_MS = 45000;

function extractLocationFromInput(input: string): string {
  const match = input.match(/\bin\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i);
  return match ? match[1].trim() : input;
}

// A single "word" that looks like keyboard-mash / a fake name rather than a real
// English-ish token: 6+ consecutive consonants, 5+ chars with no vowel at all, or
// a short repeated pattern ("adadasd", "dfadfdf"). Shared by the server-side
// business-name detection and the Google-match verification below.
function isGibberishToken(w: string): boolean {
  return (
    /[^aeiou]{6,}/.test(w) ||
    (w.length >= 5 && !/[aeiou]/.test(w)) ||
    (w.length >= 6 && /(.{2,4})\1/.test(w))
  );
}

// A specific-business query (not a category search) that Google Places could not
// match AND that zero AI platforms mentioned — the only combination that means
// "unknown / misspelled business". Applied to BOTH fresh scans and cache hits so
// a stale cached result can't bypass it.
function isBusinessNotFound(input: string, mentionedCount: number, googleName: string | null | undefined, isBusinessName: boolean, placesAvailable: boolean): boolean {
  // detect-query's isBusinessName is the authoritative signal; fall back to a
  // prefix regex only when it's absent (e.g. the ?q= auto-scan path).
  const isCategoryQuery = isBusinessName
    ? false
    : /^(best|top|find|near|search|recommended|highest|cheapest|affordable|looking|good|leading|great)\b/i.test(input.trim()) ||
      /\bnear\s+me\b/i.test(input);
  // azz4 FAIL-OPEN: when Places enrichment is unavailable (no
  // GOOGLE_PLACES_API_KEY), a missing Google name is UNKNOWN, not absent —
  // fetchGooglePlaces returns undefined without ever calling Places, so
  // the old `!googleName` leg rejected every business-name scan for a
  // never-mentioned (invisible) business — exactly what the product is
  // for. With Places down, the gate does not reject on the Google leg.
  // (Key present but API erroring still reads as available — distinguishing
  // that needs a tri-state enrichment result; see the call sites.)
  return !isCategoryQuery && !googleName && mentionedCount === 0 && placesAvailable;
}

function businessNotFoundResponse(input: string) {
  return NextResponse.json({
    success: false,
    error: 'business_not_found',
    message: `We couldn't verify "${input}" as a real business. Please check the name and try again, or search by category like "best dentist in Chicago".`,
  }, { status: 404 });
}

// Daily scan caps (shared DB limiter). Same numbers as the old in-memory
// limiter: anonymous 3/day per trusted IP, signed-in 50/day per user.
const SCAN_DAILY_LIMIT = {
  anon: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
  user: { limit: 50, windowMs: 24 * 60 * 60 * 1000 },
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  // Hoisted so the catch block can log the failure with context.
  let loggedUserId: string | null = null;
  let loggedPlan = 'free';

  try {
    // M1: Accept explicit country_code from request body (e.g. sent by N8N automation)
    const body = await req.json();
    // P0a: all DB reads/writes in this route run as service_role (bypasses
    // RLS). Tenant safety comes from the session-verified userId above.
    const supabaseAdmin = getSupabaseAdmin();

    // Health check probe — return 200 instantly without burning any Anthropic calls.
    if (body.healthCheck === true) {
      return NextResponse.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
    }

    const { input, userId: bodyUserId, websiteUrl, country_code: explicitCountry, detectedCategory, detectedCity, forceRescan, resolved_category, category_confidence, detectedIntent, queries_used: lockedQueriesParam } = body;
    // Validate BEFORE any string method runs on it: a non-string input used
    // to throw in the lower-casing below (500) instead of a clean 400.
    // The input is sent to the AI platforms verbatim, so it follows the same
    // rule as any query (≤ MAX_QUERY_LENGTH chars, no control characters).
    if (typeof input !== 'string' || !input.trim()) {
      return NextResponse.json({ error: "Input required" }, { status: 400 });
    }
    if (!isValidQueryText(input)) {
      return NextResponse.json({ error: "invalid_input", message: `Input must be at most ${MAX_QUERY_LENGTH} characters with no control characters.` }, { status: 400 });
    }
    // detectedCategory / detectedCity are spliced into the platform queries
    // ("best <category> in <city>"), so they get the same bounds.
    for (const hint of [detectedCategory, detectedCity]) {
      if (hint != null && hint !== '' && !isValidQueryText(hint, 100)) {
        return NextResponse.json({ error: "invalid_input", message: "detectedCategory / detectedCity must be short plain-text strings." }, { status: 400 });
      }
    }
    // CONV-00: funnel instrumentation (fire-and-forget, never throws).
    trackFunnelEvent({
      event: 'scan_started',
      userId: bodyUserId ?? null,
      ...readSourceCookie(req),
      metadata: { input: typeof input === 'string' ? input.slice(0, 120) : null },
    });
    // Server-side business-name detection so the not-found gate works on EVERY
    // scan path (including the ?q= auto-scan, which doesn't send the flag) and
    // can't be bypassed by a stale client. NARROW by design: only a gibberish /
    // unknown token (e.g. "ZDHSF") forces business-name mode. We deliberately do
    // NOT treat "any non-category-prefixed multi-word query" as a business name —
    // that would push legit category searches ("emergency plumber", "dentist
    // chicago") through Google verification and falsely reject the generic ones.
    const inputTokens = input.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hasGibberishToken = inputTokens.some(isGibberishToken);
    // Client hint only — scan MODE for non-trial users. Trial caps never read
    // it (see trialLocationScan below); for a trialing user it is overridden.
    let isBusinessName: boolean = (body.isBusinessName ?? false) || hasGibberishToken;

    // ── P0a: caller identity — the body userId is NEVER trusted on its own ──
    // Precedence:
    //   1. CRON_SECRET bearer → trusted server-to-server (n8n / crons): the body
    //      userId is accepted as-is (it may be null for anonymous scans).
    //   2. Authorization: Bearer <user JWT> → validated via auth.getUser(token).
    //      Used by server-to-server calls acting for a user (agency routes).
    //   3. Cookie session → the browser's Supabase session.
    // A signed-in caller whose body userId disagrees with the session gets a
    // 403; an anonymous caller must not send a userId at all.
    let userId: string | null = null;
    const internalCall = isCronRequest(req);
    {
      const authHeader = req.headers.get('authorization') || '';
      if (internalCall) {
        userId = bodyUserId ?? null;
      } else {
        let sessionUserId: string | null = null;
        try {
          const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
          if (bearerToken) {
            const { data: { user: tokenUser } } = await supabase.auth.getUser(bearerToken);
            sessionUserId = tokenUser?.id ?? null;
          } else {
            const sessionClient = createServerClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
            );
            const { data: { user: cookieUser } } = await sessionClient.auth.getUser();
            sessionUserId = cookieUser?.id ?? null;
          }
        } catch {
          sessionUserId = null;
        }
        if (sessionUserId) {
          if (bodyUserId && bodyUserId !== sessionUserId) {
            return NextResponse.json(
              { error: 'user_mismatch', message: 'The userId in the request does not match the signed-in user.' },
              { status: 403 },
            );
          }
          userId = sessionUserId;
        } else if (bodyUserId) {
          return NextResponse.json(
            { error: 'authentication_required', message: 'Sign in to run a scan as a user, or omit userId for an anonymous scan.' },
            { status: 403 },
          );
        }
      }
    }
    loggedUserId = userId;
    // AI Inbox searches call this route server-to-server AS the user
    // (CRON_SECRET bearer + userId) so they hit that user's daily limiter,
    // pause state and trial caps. They are metered as ai_inbox by the inbox
    // route, so the local_scan quota and the auto-fix loop are skipped.
    // Honoured ONLY on an internal call — a browser cannot opt out of the
    // local_scan meter with this field.
    const inboxMetered = internalCall && !!userId && body.meter === 'ai_inbox';

    if (!input) {
      return NextResponse.json({ error: "Input required" }, { status: 400 });
    }

    let countryCode: string = resolveCountryFromRequest(req.headers);

    // M1: If an explicit country_code was provided in the body, use it immediately
    if (explicitCountry) countryCode = explicitCountry;

    // Trusted client IP (never the client-supplied first XFF hop).
    const ip = clientIpFromHeaders(req.headers);
    // Daily rate-limit runs BELOW (after userEmail is resolved) so it can be
    // skipped for admins — userEmail requires a getUserById call.

    // D: Monthly scan limit enforcement — only for paid plans, never for free/anonymous/admin.
    // Lifted to outer scope so the new usageLimits check below can reuse them.
    let userPlan = 'free';
    let userEmail = '';
    // Trial state — lifted so the 1-location check (before the cache) can use it.
    let userIsTrialing = false;
    let trialStartedAt: string | null = null;
    if (userId) {
      try {
        // b062 follow-up: resolve the plan via the shared cascade —
        // subscriptions → app_metadata → free. NEVER user_metadata:
        // any user could set user_metadata.account_type = 'business'
        // via supabase.auth.updateUser and self-grant a paid plan in
        // this route (the old code read user_metadata FIRST and only
        // consulted subscriptions when metadata said 'free'). Profiles
        // is not a plan source either (b062). The service-role client
        // bypasses RLS, so the subscriptions read always succeeds.
        try {
          const { data: userData } = await (supabaseAdmin.auth as any).admin.getUserById(userId);
          const um = userData?.user?.user_metadata as Record<string, unknown> | undefined;
          const am = userData?.user?.app_metadata as Record<string, unknown> | undefined;
          userEmail = userData?.user?.email || '';

          // Account pause enforcement — a paused user can't run scans until
          // pause_until. If the window has elapsed, auto-unpause and continue.
          // Pause state is read from app_metadata (service-role only). The
          // old code read user_metadata, which the user can rewrite via
          // supabase.auth.updateUser({ data: { account_paused: false } }) to
          // scan while billing is paused. Legacy user_metadata is honoured
          // ONLY in the restrictive direction (it can pause, never unpause)
          // until the pause route writes app_metadata.
          const amPaused = am?.account_paused === true;
          const umPaused = um?.account_paused === true;
          const pausedFlag = amPaused || (am?.account_paused === undefined && umPaused);
          const pauseUntil = (amPaused ? am?.pause_until : um?.pause_until) as string | undefined;
          if (pausedFlag && pauseUntil) {
            if (new Date(pauseUntil) > new Date()) {
              return NextResponse.json({
                error: 'account_paused',
                message: `Your account is paused until ${new Date(pauseUntil).toLocaleDateString()}`,
                pause_until: pauseUntil,
              }, { status: 403 });
            } else {
              try {
                const cleared = { account_paused: false, paused_at: null, pause_until: null };
                await (supabaseAdmin.auth as any).admin.updateUserById(userId, {
                  app_metadata: { ...am, ...cleared },
                  user_metadata: { ...um, ...cleared },
                });
              } catch { /* non-fatal — allow the scan */ }
            }
          }

          // Shared cascade: the subscriptions row is authoritative
          // (expired trialing rows grant nothing — resolvePlanFromSources
          // enforces trial_end); app_metadata is the trusted fallback.
          const { data: sub } = await supabaseAdmin.from('subscriptions')
            .select('plan, status, trial_end').eq('user_id', userId)
            .in('status', ['active', 'trialing', 'past_due']).limit(1).maybeSingle();
          userPlan = resolvePlanFromSources(
            sub as { plan?: string | null; status?: string | null; trial_end?: string | null } | null,
            am,
          );
          loggedPlan = userPlan;
        } catch { /* fall through — use free */ }

        // Trial state is orthogonal to plan resolution: a trialing user's
        // plan may come from metadata, so the status lookup must NOT depend
        // on the plan cascade above. Fail open — a lookup failure simply
        // means trial caps don't apply to this request.
        try {
          const { data: sub } = await supabaseAdmin.from('subscriptions')
            .select('status, created_at').eq('user_id', userId)
            .in('status', ['active', 'trialing', 'past_due']).limit(1).maybeSingle();
          if ((sub as any)?.status) userIsTrialing = isTrialingStatus((sub as any).status as string);
          if ((sub as any)?.created_at) trialStartedAt = (sub as any).created_at as string;
        } catch { /* fail open */ }

        // Admins always allowed — single source of truth: isAdminUser.
        const isAdmin = isAdminUser(userEmail);
        const isPaidPlan = userPlan !== 'free';

        if (!isAdmin && isPaidPlan && !inboxMetered) {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
          const { count: scansThisMonth } = await supabaseAdmin
            .from('rankall_scans')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStart);

          const planCfg = getPlanConfig(userPlan);
          const monthlyLimit = planCfg.scansPerMonth ?? planCfg.scansPerDay ?? 50;

          if ((scansThisMonth ?? 0) >= monthlyLimit) {
            return NextResponse.json({
              error: 'scan_limit_reached',
              message: `You have used all ${monthlyLimit} scans for this month. Upgrade for more scans or wait until the 1st of next month.`,
              upgradeUrl: '/pricing',
              resetDate: 'the 1st of next month',
              monthlyLimit,
              scansUsed: scansThisMonth ?? 0,
            }, { status: 429 });
          }
        }
      } catch { /* non-fatal — if limit check fails, allow scan */ }
    }

    // Daily rate limit (Layer 1) — now runs after userEmail is resolved so it is
    // skipped entirely for admins. Anonymous users have userEmail '' → still
    // rate-limited by IP; authed non-admins → rate-limited by user id.
    // Shared DB-backed limiter: the old in-memory bucket was per serverless
    // instance and keyed on the spoofable first X-Forwarded-For entry.
    // Internal calls acting for a user count against that user; internal
    // calls with no user (n8n prospect scans) are trusted automation.
    if (!isAdminUser(userEmail) && (userId || !internalCall)) {
      const rl = userId
        ? await checkRateLimitDb('scan:user', userId, SCAN_DAILY_LIMIT.user)
        : await checkRateLimitDb('scan:ip', ip, SCAN_DAILY_LIMIT.anon);
      if (!rl.allowed) {
        return NextResponse.json({
          error: userId
            ? `Daily scan limit reached (${rl.limit}/day). Resets at midnight.`
            : `Free scan limit reached (${rl.limit}/day). Sign in for 50 scans/day.`,
          remaining: 0,
          limit: rl.limit,
        }, { status: 429 });
      }
    }

    // New usageLimits enforcement (source of truth going forward). Only for
    // authenticated users — anonymous scans keep the existing free behavior.
    // Trialing accounts get trial caps (see lib/trialCaps).
    if (userId && !inboxMetered) {
      const limitCheck = await checkUsageLimit(userId, userEmail, 'local_scan', userPlan, userIsTrialing);
      if (!limitCheck.allowed) {
        return NextResponse.json({
          error: 'scan_limit_reached',
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          resetDate: limitCheck.resetDate,
          upgradeUrl: '/pricing',
        }, { status: 429 });
      }
    }

    const categoryLookup = resolved_category ? CATEGORIES[resolved_category] : null;
    const detectedIndustry = categoryLookup
      ? categoryLookup.queryTerm
      : detectIndustry(input);
    const intent = detectedIntent || detectIntent(input);
    const intentLoc = typeof intent === 'string' ? '' : (intent as any).loc || '';
    const rawLocation = intentLoc || extractLocationFromInput(input);
    const cleanCity = detectedCity || (rawLocation !== input ? rawLocation : null);
    const location = cleanCity || rawLocation;

    // Query-based country override: an explicit location in the query (e.g. a US
    // state abbreviation like "IL" in "best dentist in Elgin IL") is the most
    // reliable signal and must override a stale geo/override cookie. This is what
    // gets persisted as country_code so the report renders the right currency.
    // Only infer from text if no explicit country was provided in the request body.
    if (!explicitCountry) {
      const inferredCountry = inferCountryFromText(location, input);
      if (inferredCountry) countryCode = inferredCountry;
    }
    const countryConfig = getCountryConfig(countryCode);

    const categoryNoun = detectedCategory
      || (detectedIndustry !== 'general' ? detectedIndustry : null);

    // ── Trial 1-location cap (before the cache) ─────────────────────────
    // A trialing account may scan 1 distinct business during the trial.
    // This MUST run before the cache check: a cache hit for a second
    // business would otherwise serve that business's data for free.
    // Comparison is on normalized scan input (see lib/trialCaps). Fail open
    // on DB errors — a lookup failure must not block a paying user.
    // Server-side decision (never the body flag): does this trial scan
    // count as a location? A category-classified query also runs in
    // category mode for a trialing user, so it cannot return
    // business-specific results without consuming the location.
    const trialLocationScan = userIsTrialing && trialScanCountsAsLocation(input, { resolvesToBusiness: body.isBusinessName === true || hasGibberishToken });
    if (userIsTrialing && !trialLocationScan) isBusinessName = hasGibberishToken;
    if (userId && userIsTrialing) {
      // Only business scans count (a category scan is not a location).
      if (await isTrialLocationBlocked(supabaseAdmin, userId, input, trialLocationScan, trialStartedAt)) {
        return NextResponse.json({
          error: 'trial_location_limit_reached',
          message: TRIAL_LOCATION_BLOCKED_MESSAGE,
          upgradeUrl: '/pricing',
        }, { status: 403 });
      }
    }
    // azz4: Places availability is read once per request. The not-found
    // gate fails open when the key is missing (see isBusinessNotFound).
    const placesAvailable = Boolean(process.env.GOOGLE_PLACES_API_KEY);

    // ── Trial: one trial per business (before the cache) ─────────────────
    // A business (normalized scan input) that already used a trial under a
    // DIFFERENT account cannot be trialed again — this is what stops
    // multi-account cycling for the same business. Runs before the cache
    // for the same reason as the 1-location check. Only business-name
    // scans consume a business's trial (a category query is not a business).
    // Fail open on DB errors (the usage table does not exist until the
    // b28j migration is run).
    if (userId && trialLocationScan) {
      try {
        const businessKey = normalizeScanInput(input);
        if (businessKey && (await checkTrialBusinessUsed(supabaseAdmin, businessKey, userId))) {
          return NextResponse.json({
            error: 'trial_business_already_used',
            message: TRIAL_BUSINESS_USED_MESSAGE,
            upgradeUrl: '/pricing',
          }, { status: 403 });
        }
      } catch { /* fail open */ }
    }

    // ── Cache check (order: auth → plan → usage → CACHE → scan) ──────────────
    // Prevents re-hitting every AI platform for a query we scanned recently.
    const paidUser = isPaidPlan(userPlan);
    const skipCache = req.nextUrl.searchParams.get('fresh') === 'true' || forceRescan === true;
    // P0a: the cache key is tenant-scoped (see lib/scanCache.ts) so one
    // account's cached payload is never served to another account.
    const tenantId = userId || 'anon';
    if (!skipCache) {
      const cached = await getCachedScan(input, countryCode, tenantId);
      if (cached.hit && cached.results) {
        // A cache row can outlive its scan row (cleanup, test-data deletion).
        // Never serve a /report/<id> link that 404s: if the cached scanId no
        // longer resolves to a real report row, drop the entry and fall
        // through to a fresh scan. An unverifiable row (lookup error) is
        // treated the same — a fresh scan is always safe, a dead link isn't.
        const cachedScanId = (cached.results as Record<string, unknown>).scanId as string | undefined;
        let cachedScanRowExists = false;
        if (cachedScanId) {
          const { data: scanRow, error: scanRowError } = await supabaseAdmin
            .from('rankall_scans')
            .select('id')
            .eq('id', cachedScanId)
            .maybeSingle();
          cachedScanRowExists = !scanRowError && !!scanRow;
        }
        if (!cachedScanRowExists) {
          console.warn('SCAN CACHE STALE-SCANID — invalidating, falling through to fresh scan', { input, cachedScanId: cachedScanId ?? null });
          await invalidateScanCache(input, countryCode, tenantId);
        } else {
        // Re-apply the business-not-found gate to cached data so a stale entry
        // (e.g. cached before this check existed) can't bypass it.
        const c = cached.results as Record<string, any>;
        const googleNameCached = (c.enrichment?.google?.name || '').toLowerCase();
        const gibberishUnmatchedCached = hasGibberishToken &&
          !inputTokens.some((t: string) => isGibberishToken(t) && googleNameCached.includes(t));
        if (isBusinessName && ((!c.enrichment?.google?.name && placesAvailable) || gibberishUnmatchedCached)) {
          return businessNotFoundResponse(input);
        }
        if (isBusinessNotFound(input, c.mentionedCount ?? 0, c.enrichment?.google?.name, isBusinessName, placesAvailable)) {
          return businessNotFoundResponse(input);
        }
        console.log('SCAN CACHE HIT:', input, countryCode);
        // Phase 2: a cache hit runs NO AI and does NOT consume a usage credit
        // (acceptance: "Cached scan does NOT increase usage").
        logExpensiveRequest({ userId, plan: userPlan, feature: 'local_scan', success: true, cacheHit: true, platformCount: 0 });
        return NextResponse.json({
          ...(cached.results as Record<string, unknown>),
          cached: true,
          cachedAt: cached.cachedAt,
          country_code: countryCode,
        });
        }
      }
    }

    // Step 1 — Deterministic query variations (fixed templates, reproducible).
    // Business-name scans: query the CATEGORY ("best {industry} in {city}"), then
    // detect if the specific business appears in responses. Never query the business
    // name directly — platforms echo it back, inflating scores.
    // Use category queries when we have both a category and a city — even if
    // Haiku didn't flag isBusinessName. But leave genuine category searches
    // alone: if the input already contains the detected category, the user
    // typed a category search and we should query it verbatim.
    const inputAlreadyHasCategory = detectedCategory
      && input.toLowerCase().includes(detectedCategory.toLowerCase());
    const useCategoryQuery = isBusinessName
      || (detectedCategory && detectedCity && !inputAlreadyHasCategory);
    let categoryQuery: string;
    if (useCategoryQuery) {
      if (!categoryNoun || !cleanCity) {
        console.warn('category-query-fallback-blocked', {
          input,
          detectedCategory: detectedCategory ?? null,
          detectedCity: detectedCity ?? null,
          detectedIndustry,
          location,
          categoryNoun: categoryNoun ?? null,
          cleanCity: cleanCity ?? null,
        });
        const hint = cleanCity
          ? `Could not determine your business category. Try searching as "best [type] in ${cleanCity}" instead.`
          : `Could not determine your business category or city. Try adding your city, e.g. "${input} Chicago".`;
        return NextResponse.json(
          { error: hint },
          { status: 400 },
        );
      }
      categoryQuery = `best ${categoryNoun} in ${cleanCity}`;
    } else {
      categoryQuery = input;
    }
    // P0c: locked query basket. Precedence:
    //   1. Explicit locked basket from a TRUSTED INTERNAL caller only
    //      (CRON_SECRET bearer — e.g. rescans that must re-run the original
    //      queries). A browser-supplied queries_used is IGNORED: it was
    //      unbounded and unchecked, so one counted scan could fire 12×N paid
    //      LLM calls with attacker-chosen queries that inflate the stored
    //      score. Even internal baskets are validated and capped at the
    //      normal per-scan count (sanitizeQueryBasket).
    //   2. Canonical basket from this user's most recent scan of the same
    //      input (this is how a dashboard rescan keeps its original basket).
    //   3. Fresh generation (first scan for this business).
    // Rescans must never regenerate — a new basket makes the score
    // incomparable with the business's own history.
    let queries: string[];
    const lockedBasket = internalCall ? sanitizeQueryBasket(lockedQueriesParam) : null;
    if (lockedBasket) {
      queries = lockedBasket;
    } else {
      let canonical: string[] | null = null;
      if (userId) {
        const { data: prior } = await supabaseAdmin
          .from('rankall_scans')
          .select('queries_used')
          .eq('user_id', userId)
          .eq('input', input)
          .not('queries_used', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        // Stored baskets are re-validated + capped too (rows written before
        // this check may hold an oversized client-supplied basket).
        canonical = sanitizeQueryBasket((prior as any)?.queries_used);
      }
      queries = canonical ?? generateQueryVariations(categoryQuery);
    }
    const basketHash = computeBasketHash(queries);

    // Step 2/3 — Fire all queries across all 12 active platforms, accumulating
    // results LIVE into platformMap as each call settles. This lets the master
    // timeout return partial results instead of failing the whole scan if a few
    // platforms are slow today.
    const platformMap = new Map<string, {
      platform: string;
      weight: number;
      responses: string[];
      error: string | null;
    }>();

    PLATFORMS.forEach(p => {
      platformMap.set(p.name, {
        platform: p.name,
        weight: p.weight,
        responses: [],
        error: null,
      });
    });

    resetStaggerCounters();
    const jobs = PLATFORMS.flatMap(platform => {
      const pQueries = platform.maxQueries ? queries.slice(0, platform.maxQueries) : queries;
      return pQueries.map(query =>
        callPlatform(platform, query, { deadlineMs: startTime + MASTER_TIMEOUT_MS })
          .then(response => {
            const entry = platformMap.get(platform.name);
            if (!entry) return;
            if (response) {
              entry.responses.push(response);
            } else {
              // An empty-string return must be a recorded error, never a
              // silent drop — otherwise the row ends up error=null +
              // response=null with no diagnosis (the Kimi swallow).
              if (!entry.error) entry.error = `${platform.name} returned empty response`;
            }
          })
          .catch(err => {
            const entry = platformMap.get(platform.name);
            if (entry && !entry.error) entry.error = err?.message || 'Failed';
          })
      );
    });

    // Whichever finishes first: all jobs settling, or the 45s master timeout.
    // Either way platformMap holds whatever completed — we never throw here.
    await Promise.race([
      Promise.allSettled(jobs),
      new Promise<void>(resolve => setTimeout(resolve, MASTER_TIMEOUT_MS)),
    ]);

    // Step 4 — Build final results — best response per platform
    const platformResults = Array.from(platformMap.values()).map(entry => ({
      platform: entry.platform,
      weight: entry.weight,
      status: entry.responses.length > 0 ? 'success' : 'error',
      response: entry.responses.length > 0
        ? entry.responses.join('\n\n---\n\n')
        : null,
      // FIX 3: a platform that produced at least one response is a clean success —
      // don't attach a contradictory timeout/error from a single failed sub-query.
      error: entry.responses.length > 0 ? null : entry.error,
    }));

    const scanDuration = Date.now() - startTime;

    // Scan completeness — informational only (how many platforms responded).
    // This is NOT the score; it never penalises the business for our infra issues.
    const successfulResults = platformResults.filter(r => r.status === 'success' && r.response);
    const failedPlatforms = platformResults
      .filter(r => r.status !== 'success' || !r.response)
      .map(r => r.platform);
    const scanReliable = failedPlatforms.length <= 2;

    // b0fe: NO platform responded — the scan measured nothing. Returning a
    // 0/100 report here would be a fabrication (see b0ff: '0.0 pts ÷ 0.00
    // responding weight' presented as a score, '11 recommending
    // competitors' with no measured competitor). Fail loudly instead: the
    // user retries rather than trusting an empty report. No usage is
    // consumed — incrementUsage runs only on the success path below — and
    // nothing is saved or cached, so no fake 0/100 scan ever persists.
    // Partial results (≥1 platform responded) still produce a report.
    if (successfulResults.length === 0) {
      const platformErrors = platformResults
        .filter(r => r.error)
        .map(r => `${r.platform}: ${r.error}`);
      console.error('[scan] all platforms failed — returning platforms_unavailable:', platformErrors);
      return NextResponse.json({
        success: false,
        error: 'platforms_unavailable',
        message: 'We couldn\u2019t reach any AI platforms to run your scan. Please try again in a few minutes.',
        failedPlatforms,
      }, { status: 502 });
    }

    // Build per-query response arrays for fractional mention scoring.
    // platformMap still holds the individual responses before they were joined.
    const perQueryMap = new Map<string, string[]>();
    for (const [name, entry] of platformMap) {
      perQueryMap.set(name, [...entry.responses]);
    }

    // Run ML analysis
    const analysis = await analyseAllPlatforms({
      businessName: input,
      city: cleanCity || undefined,
      results: platformResults.map(r => ({
        platform: r.platform,
        weight: r.weight,
        response: r.response,
        perQueryResponses: perQueryMap.get(r.platform) || [],
      })),
      extraBlacklist: countryConfig.competitorBlacklist,
      queries,
      category: categoryNoun || undefined,
    });

    // HEADLINE SCORE — recommendation-weighted among platforms that responded.
    // Single source of truth: lib/scoring. Built from analysis (mentioned/
    // competitor_mentioned) + the platform's real success/error status.
    const scoreInputs = analysis.map((a, i) => ({
      weight: a.weight,
      mentionRate: a.mentionRate,
      competitor_mentioned: a.competitor_mentioned,
      status: (platformResults[i]?.status === 'success' ? 'success' : 'error') as PlatformStatus,
    }));
    const queryCount = queries.length;
    const scoreResult = calculateOverallScore(scoreInputs, queryCount);
    const overallScore = scoreResult.score;

    // Competitor validity uses the SHARED validator (lib/analyser-ml.isValidCompetitor),
    // so /api/scan and /api/rescan-weekly reject the same city/state/generic terms.
    const allCompetitors = analysis.map(a => a.competitor).filter(Boolean);
    let competitor = allCompetitors.find(c => isValidCompetitor(c)) || null;
    // Phase 20: belt-and-suspenders data-quality gate — never save a directory
    // (Yelp/Google/Healthgrades…), the business itself, or a generic term as the
    // competitor. Fails OPEN: any crash keeps the existing competitor value.
    if (competitor) {
      try {
        const cv = validateCompetitor(competitor, input || '', location || '');
        if (cv.status === 'blocked') {
          console.log('COMPETITOR BLOCKED:', cv.issues[0]?.message);
          competitor = null;
        }
      } catch { /* fail open — keep the competitor */ }
    }
    const mentionedCount = analysis.filter(a => a.mentionRate > 0).length;
    // ax87: citations only from responses that mention the business — a
    // citation in a competitor-listing response belongs to a competitor.
    const citationSources = [...new Set(analysis.filter(a => a.mentionRate > 0).flatMap(a => a.citationSources))];

    // b02f: Share of Recommendation — canonical mentioned/12 (lib/scoring),
    // matching the report page (ax7x). One writer for both stored
    // columns: this value goes to rankall_scans (via saveScan below)
    // AND to score_history (same value, no second formula).
    const recommendationShare = calculateRecommendationShare(mentionedCount, PLATFORMS.length);

    // Run enrichment — all external APIs in parallel
    // azzz: pass the scan's country so SERP presence flags come from the
    // business's market (gl), not hardcoded US.
    const enrichment = await enrichBusinessData({
      businessInput: input,
      location: cleanCity || '',
      websiteUrl: websiteUrl || undefined,
      countryCode,
    });

    // Business-not-found guard. Simple + deliberate: a specific business-name
    // search must be verifiable on Google Places. Google match = real business;
    // no match = reject. (Tradeoff: a real business with no Google listing is
    // rejected — accepted for simplicity/reliability over the old echo heuristics.)
    // azz4: when Places is unavailable (no key), the Google leg is skipped —
    // the scan proceeds and reports 0 mentions / invisible instead of
    // erroring. The gibberish leg still rejects keyboard-mash inputs.
    // Also reject when Google returned SOME place but its name doesn't actually
    // contain the gibberish token — findplacefromtext fuzzy-matches the real
    // category word ("clinic") and hands back a random real clinic for
    // "dfadfdf clinic". A genuine business's distinctive token would appear in
    // Google's returned name; a fake one ("dfadfdf") never will.
    const googleNameFresh = (enrichment.google?.name || '').toLowerCase();
    const gibberishUnmatchedFresh = hasGibberishToken &&
      !inputTokens.some((t: string) => isGibberishToken(t) && googleNameFresh.includes(t));
    // b872: the not-found gate must not make a TRACKED business
    // un-rescannable. A business whose Places match is a near-name
    // in another city (rejected by the confident match since b87d)
    // and which no AI platform currently names can never pass the
    // gate again — yet the user already has scans for it, and the
    // verification loop depends on rescanning it. A forceRescan by
    // the owner of a prior scan with the same input is a KNOWN
    // business: the scan proceeds (enrichment stays an honest
    // no-match). New inputs and anonymous scans keep the gate.
    let knownBusiness = false;
    if (forceRescan === true && userId) {
      try {
        const { data: prior } = await supabaseAdmin
          .from('rankall_scans')
          .select('id')
          .eq('user_id', userId)
          .eq('input', input)
          .limit(1);
        knownBusiness = !!prior?.length;
      } catch { /* lookup failure keeps the gate — fail closed for new scans */ }
    }
    if (!knownBusiness && isBusinessName && ((!enrichment.google?.name && placesAvailable) || gibberishUnmatchedFresh)) {
      return businessNotFoundResponse(input);
    }
    // Fallback for the non-business-name path (e.g. ?q= auto-scan without the
    // isBusinessName flag): a non-category query, no Google match, zero mentions.
    if (!knownBusiness && isBusinessNotFound(input, mentionedCount, enrichment.google?.name, isBusinessName, placesAvailable)) {
      return businessNotFoundResponse(input);
    }

    // Run trust signal detection. Fall back to the website Google Places found
    // (enrichment) when the request body has none.
    const resolvedWebsiteUrl = websiteUrl || (enrichment as import('@/lib/enrichment').EnrichmentData | undefined)?.google?.website || undefined;
    const trustSignals = await detectTrustSignals({
      businessInput: input,
      // Fall back to the website Google Places found (enrichment) when the
      // request body has none — otherwise homepage/business scans always
      // report "Website not analyzed" despite the site being discovered.
      websiteUrl: resolvedWebsiteUrl,
      scanResults: platformResults.map((r, i) => ({
        platform: r.platform,
        response: r.response,
        // ax87: attribution — trust signals only count responses that
        // mention the business (analyser mentionRate > 0).
        mentioned: (analysis[i]?.mentionRate ?? 0) > 0,
      })),
      citationSources,
      industry: detectedIndustry,
      // ax89: pass the VERIFIED enrichment into trust — Google Places
      // match + SERP presence — so directory signals match on verified
      // data instead of AI-response word-match.
      enrichment: enrichment ? {
        reddit: (enrichment as any).reddit ?? null,
        google: (enrichment as any).google ?? null,
        serpData: (enrichment as any).serpData ?? null,
      } : null,
      // Quote a website's <title> only when the user supplied the site
      // (a Places-discovered site may belong to another business — #40).
      websiteVerified: Boolean(websiteUrl),
      // Longer competitor names that contain this business's name are
      // attributed to the competitor, never to the business (ax87).
      competitorNames: [...new Set(allCompetitors.filter((c): c is string => typeof c === 'string' && c.length > 0))],
    }, countryCode);

    // A2: Knowledge Panel detection — runs before saveScan so data is saved atomically
    let kpResult: Awaited<ReturnType<typeof detectKnowledgePanel>> | null = null;
    try {
      console.log('KP: starting detection for', input);
      kpResult = await detectKnowledgePanel(
        input,
        detectedIndustry ?? '',
        cleanCity ?? '',
        countryCode ?? 'US',
        'business',
        userId || undefined
      );
      console.log('KP: exists=', kpResult?.exists, 'error=', kpResult?.error);
    } catch (kpErr) {
      console.error('KP detection failed:', kpErr);
      kpResult = null;
    }

    // Resolve the canonical business entity from the enriched Google data.
    // Best-effort: a null businessId never blocks the scan from saving. The
    // Google name (canonical) is preferred over the raw query; place_id + geo
    // come from enrichment.google when Google Places matched.
    const g = (enrichment as import('@/lib/enrichment').EnrichmentData | undefined)?.google;
    const businessName = g?.name || kpResult?.title || input;
    const businessId = await findOrCreateBusiness({
      canonicalName: businessName,
      placeId: g?.placeId || undefined,
      industry: detectedIndustry,
      category: g?.category || undefined,
      city: cleanCity || undefined,
      countryCode,
      website: g?.website || undefined,
      phone: g?.phone || undefined,
      address: g?.address || undefined,
      latitude: g?.latitude ?? undefined,
      longitude: g?.longitude ?? undefined,
      entityType: 'business',
    });

    // Save to Supabase
    let scanId: string | null = null;
    try {
      const intentType = typeof intent === 'string' ? intent : (intent as any).type || 'general';

      // CONV-00: funnel instrumentation.
      const __src = readSourceCookie(req);
      scanId = await saveScan({
        input,
        intentType,
        industry: detectedIndustry,
        location: cleanCity || location,
        overallScore,
        // ax9c: attach the queries each platform actually ran (Mistral/Kimi
        // run only the first basket query; the rest run the full basket) so
        // saveScan can record query_used on the platform row.
        results: platformResults.map((r, i) => ({
          ...r,
          mentionRate: analysis[i]?.mentionRate ?? 0,
          // STD-08 Phase 1: thread the analyser's sentiment through so saveScan
          // writes it — mentioned rows were staying NULL because it was dropped here.
          sentiment: analysis[i]?.sentiment ?? null,
          queriesUsed: (() => {
            const mq = PLATFORMS.find(pl => pl.name === r.platform)?.maxQueries;
            return mq ? queries.slice(0, mq) : queries;
          })(),
        })),
        userId: userId || undefined,
        trustSignals,
        competitorName: competitor,
        mentionedCount,
        citationSources,
        enrichment,
        countryCode,
        kpExists: kpResult?.exists ?? false,
        kpClaimed: kpResult?.claimed ?? false,
        kpCompleteness: kpResult?.completeness ?? 0,
        kpData: kpResult ?? null,
        businessId,
        businessName,
        city: cleanCity || location,
        scoringVersion: 2,
        queriesUsed: queries,
        basketHash,
        resolvedCategory: resolved_category || null,
        categoryConfidence: category_confidence || null,
        recommendationShare,
        failedPlatforms: failedPlatforms.length ? failedPlatforms : null,
        scanReliable,
      });

      // CONV-00: funnel instrumentation.
      if (scanId) {
        trackFunnelEvent({
          event: 'scan_completed',
          userId: userId ?? (typeof bodyUserId === 'string' ? bodyUserId : null),
          scanId,
          ...__src,
          metadata: { score: overallScore ?? null },
        });
      }

      // Roll this scan's headline metrics up onto the business row.
      if (businessId && scanId) {
        try {
          await updateBusinessScore(businessId, overallScore, scanId, mentionedCount);
        } catch (bErr) {
          console.error('updateBusinessScore failed (non-fatal):', bErr);
        }
      }

      if (scanId) {
        try {
          // ax9c: score_history's REAL columns are score / recommendation_share /
          // platforms_count / competitor_score / basket_hash / recorded_at (defaults
          // to now()). The old insert used overall_score, trust_score, business_input,
          // competitor_name, mentioned_count, scan_type — none of which exist — so
          // PostgREST rejected every insert and the table stayed empty forever.
          await supabaseAdmin.from('score_history').insert({
            user_id: userId || null,
            scan_id: scanId,
            score: overallScore,
            recommendation_share: recommendationShare,
            platforms_count: mentionedCount,
            competitor_score: null,
            basket_hash: basketHash,
          });
        } catch (histErr) {
          console.error("Failed to save score history:", histErr);
        }

        // b28j: this trialing scan consumed the business's one free trial.
        // Only business-name scans record usage (a category query is not a
        // business). Non-fatal — a record failure must not block the response.
        if (userId && trialLocationScan) {
          await recordTrialBusinessUsage(supabaseAdmin, normalizeScanInput(input), userId);
        }

        // E2: Save competitor snapshot
        if (competitor) {
          try {
            await supabaseAdmin.from('competitor_snapshots').insert({
              user_id: userId || null,
              scan_id: scanId,
              competitor_name: competitor,
              competitor_score: null,
              your_score: overallScore,
            });
          } catch { /* non-fatal */ }
        }

        // Phase 1 labeling (ticket b7x5): auto-label every completed scan.
        // Runs via after() so it never slows the scan response; failures are
        // logged, never thrown — a labeling failure must not fail the scan.
        // lib/autoLabel is idempotent: it never overwrites an existing
        // data_labels row or an existing sentiment.
        // Capture scanId in a const: the after() closure would otherwise
        // lose the if (scanId) narrowing (scanId is a let).
        const labelScanId = scanId;
        after(async () => {
          try {
            await autoLabelScan({
              scanId: labelScanId,
              platformSentiments: analysis.map((a) => ({ platform: a.platform, sentiment: a.sentiment })),
              trustSignals,
            });
          } catch (labelErr) {
            console.error('[scan] auto-label failed (non-fatal):', labelErr);
          }
        });

        // A2: Auto-detect score improvements and record as verified outcomes
        if (userId && overallScore !== undefined) {
          try {
            const { data: prevScan } = await supabaseAdmin
              .from('rankall_scans')
              .select('id, score, appeared_on_platforms')
              .eq('user_id', userId)
              .neq('id', scanId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (prevScan && overallScore > (prevScan.score ?? 0)) {
              // Phase 14: a real before→after delta only counts as VERIFIED when it
              // clears the threshold (>=3 pts + a new platform, or >=5 pts). Smaller
              // improvements are recorded honestly at 'medium' confidence, NOT verified.
              const improvement = overallScore - (prevScan.score ?? 0);
              const platformsImproved = (mentionedCount ?? 0) - (prevScan.appeared_on_platforms ?? 0);
              let confidenceLevel = 'medium';
              let isVerified = false;
              if (improvement >= 3 && platformsImproved >= 1) { confidenceLevel = 'verified'; isVerified = true; }
              else if (improvement >= 5) { confidenceLevel = 'high'; isVerified = true; }

              await supabaseAdmin.from('verified_outcomes').insert({
                user_id: userId,
                scan_id_before: prevScan.id,
                scan_id_after: scanId,
                score_before: prevScan.score ?? 0,
                score_after: overallScore,
                platforms_before: prevScan.appeared_on_platforms ?? 0,
                platforms_after: mentionedCount,
                before_platforms_found: prevScan.appeared_on_platforms ?? 0,
                after_platforms_found: mentionedCount,
                industry: detectedIndustry ?? null,
                business_industry: detectedIndustry ?? null,
                city: cleanCity ?? null,
                country_code: countryCode ?? null,
                confidence_level: confidenceLevel,
                is_verified: isVerified,
                verified: isVerified,
                verified_at: isVerified ? new Date().toISOString() : null,
                actual_impact: `+${improvement} points, ${platformsImproved >= 0 ? '+' : ''}${platformsImproved} platforms`,
                rescanned_at: new Date().toISOString(),
              });
            }
          } catch { /* non-fatal — don't block the scan response */ }
        }
      }
    } catch (saveErr) {
      console.error("Failed to save scan:", saveErr);
    }

    // Calculate citation authority score
    function calcCitationScore(results: Array<{ response: string | null; status: string }>): { score: number; count: number } {
      let citedCount = 0;
      const total = results.filter(r => r.status !== 'error').length;
      for (const r of results) {
        if (!r.response) continue;
        const resp = r.response.toLowerCase();
        // Check for URL citation patterns
        if (resp.includes('according to') || resp.includes('.com') || resp.includes('their website') || resp.includes('source:') || resp.includes('visit ') || resp.includes('check out')) {
          citedCount++;
        }
      }
      return { score: total > 0 ? Math.round((citedCount / total) * 100) : 0, count: citedCount };
    }

    const citationData = calcCitationScore(platformResults);
    const citationScore = citationData.score;
    const citationCount = citationData.count;

    const scanType = (typeof intent === 'string' ? intent : (intent as any).type || 'general') === 'personal_pro'
      ? 'personal_pro'
      : 'local';

    // Count the scan against the user's monthly local_scan quota (only after
    // the scan actually succeeded). Anonymous users are not tracked.
    if (userId && !inboxMetered) await incrementUsage(userId, 'local_scan', userEmail);

    const platformsCompleted = successfulResults.length;

    logExpensiveRequest({ userId, plan: userPlan, feature: 'local_scan', success: true, cacheHit: false, durationMs: Date.now() - startTime, platformCount: platformsCompleted });
    const partial = platformsCompleted > 0 && platformsCompleted < PLATFORMS.length;

    const responsePayload = {
      success: true,
      scanId,
      scan_type: scanType,
      intent,
      query: input,
      queries,
      industry: detectedIndustry,
      overallScore,
      recommendationShare,
      scanDurationMs: scanDuration,
      results: platformResults,
      analysis,
      competitor,
      mentionedCount,
      mentionedOpportunities: scoreResult.mentionedOpportunities,
      totalOpportunities: scoreResult.totalOpportunities,
      citationSources,
      trustSignals,
      enrichment,
      citation_score: citationScore,
      citation_count: citationCount,
      country_code: countryCode,
      partial,
      platformsCompleted,
      platformsTotal: PLATFORMS.length,
      platformsFailed: failedPlatforms.length,
      failedPlatforms,
      scanReliable,
      cached: false,
      knowledgePanel: kpResult
        ? { exists: kpResult.exists, claimed: kpResult.claimed }
        : { exists: false, claimed: false },
    };

    // Cache the full payload. Anonymous/free → 24h, paid → 1h (fresher data).
    // Only cache reasonably-complete scans so a mostly-failed run isn't sticky.
    if (scanId && platformsCompleted >= Math.ceil(PLATFORMS.length / 2)) {
      await cacheScan(input, countryCode, scanId, responsePayload, overallScore, (!userId || !paidUser) ? 24 : 1, tenantId);
    }

    if (scanId) {
      const extractQuery = input;
      const extractResults = platformResults.map((r: any) => ({ platform: r.platform, weight: r.weight, response: r.response }));
      after(async () => {
        try {
          await extractAndStoreCompetitors(scanId, extractQuery, extractResults, {
            businessName: input,
            queries,
            city: cleanCity || undefined,
            category: categoryNoun || undefined,
          });
        } catch (err) {
          console.error('[scan] competitor extraction failed:', err);
        }
      });
    }

    // Phase 1 — auto-fix loop: after the response is sent, generate the top 3 fixes
    // for this scan and store them for review, then email paid users that they're
    // ready. Uses next/server `after()` so the work reliably runs post-response on
    // Vercel (a naked fire-and-forget would be dropped). Never affects the scan.
    if (userId && scanId && !inboxMetered) {
      const bizName = input;
      const fixUserId = userId;
      const fixScanId = scanId;
      after(async () => {
        try {
          // competitorScore isn't computed in the scan path, so pass 0 (the
          // competitor-gap rule simply doesn't fire here).
          const topFixTypes = selectTopFixTypes(platformResults, trustSignals, overallScore, 0).slice(0, 3);
          console.log('[autoFix] triggering for scan:', fixScanId, topFixTypes);
          const generated: { title: string; impact: number | null }[] = [];
          // Direct in-process generation — NO self-fetch (the previous self-fetch
          // failed silently on Vercel due to base-URL/redirect issues).
          for (const fixType of topFixTypes) {
            const result = await generateFixForScan({
              scanId: fixScanId, fixType, userId: fixUserId,
              // Placeholder when the "name" is really a search query, so the
              // generated schema/FAQ never shows "best restaurant in NY" as a name.
              businessName: safeBusinessName(bizName), industry: detectedIndustry ?? undefined,
              city: cleanCity ?? undefined, countryCode, score: overallScore,
              competitorName: competitor ?? undefined, source: 'auto_after_scan',
              // ax71: real mention count — buildFixEvidence used to default
              // to 0, so every auto fix claimed '0 of 11 platforms'.
              platformsMentioned: mentionedCount,
            });
            console.log('[autoFix] result:', fixType, result.success, result.error || result.skipReason || 'OK');
            if (result.success && !result.skipped) {
              // ax81: the canonical per-fix number (metadata midpoint) —
              // the same one the queue shows. Unknown → omitted, never +0.
              generated.push({ title: fixTypeLabel(fixType), impact: canonicalFixImpact(fixType) });
            }
          }

          // "Fixes ready" email — paid users only.
          // CAN-SPAM: skipped for unsubscribed / bounced addresses and for
          // users who turned "Fix recommendations" off in Settings.
          if (paidUser && userEmail && generated.length > 0 && process.env.RESEND_API_KEY && !(await shouldSkipEmail({ email: userEmail, userId: fixUserId }, 'fix_recommendations'))) {
            const ranked = [...generated].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
            const rows = ranked.map((g, i) => `<p style="margin:4px 0;font-size:14px;color:#0F172A"><strong>Fix #${i + 1}:</strong> ${g.title}${g.impact != null ? ` <span style="color:#059669">(est. +${g.impact} pts)</span>` : ''}</p>`).join('');
            const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
              <p style="font-size:15px;color:#1f2937;line-height:1.6">We analysed your scan results and generated ${generated.length} specific fixes for <strong>${bizName}</strong>.</p>
              ${rows}
              <p style="margin:20px 0"><a href="https://rankall.io/dashboard/fix" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none">Review and approve your fixes →</a></p>
              <p style="font-size:13px;color:#64748b">These fixes are specific to your business and ready to implement.</p>
            </div>`;
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'Rankall.io <fixes@rankall.io>', to: userEmail, subject: 'Your AI visibility fixes are ready to review', html }),
            });
          }
        } catch (err) {
          console.error('Auto-fix generation failed:', err);
        }
      });
    }

    return NextResponse.json(responsePayload);

  } catch (error) {
    Sentry.captureException(error, { tags: { route: '/api/scan' } });
    console.error("Scan error:", error);
    // Failed scan: log it, but DO NOT increment usage (acceptance criteria).
    logExpensiveRequest({ userId: loggedUserId, plan: loggedPlan, feature: 'local_scan', success: false, durationMs: Date.now() - startTime, error: String(error) });
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

// ── PLATFORMS imported from @/lib/platforms ─────────────────────────

// ── QUERY VARIATIONS ────────────────────────────────────────────────

// Deterministic query variations moved to lib/queryVariations (shared with rescan).

// ── PLATFORM CALLER imported from @/lib/platforms ───────────────────

// ── COUNTRY NARRATIVE CONTEXT ────────────────────────────────────────

function getCountryNarrativeContext(countryCode: string, industry: string): string {
  const contexts: Record<string, Record<string, string>> = {
    US: {
      dentist: 'Top US dental practices on AI have: Google Business with 200+ reviews, Healthgrades profile claimed, Zocdoc booking enabled, FAQ schema with insurance accepted, and consistent NAP across Yelp/Healthgrades/Google.',
      lawyer: 'Top US law firms on AI have: Avvo rating above 8.0, Martindale-Hubbell AV rating, state bar profile complete, Google Business with case study content.',
      default: 'Top US businesses on AI have: BBB accreditation, Google Business with 100+ reviews, Yelp claimed profile, and industry-specific directory listings.',
    },
    GB: {
      dentist: 'Top UK dental practices on AI have: NHS Find a Dentist profile complete, CQC registration visible, Trustpilot with 50+ reviews, checkatrade.com verified, GDC membership visible.',
      lawyer: 'Top UK law firms on AI have: Law Society profile complete, SRA registration visible, Trustpilot with 30+ reviews, chambers.com listing.',
      default: 'Top UK businesses on AI have: Trustpilot profile with 30+ reviews, Checkatrade verification (for tradespeople), Google Business with 100+ reviews.',
    },
    AU: {
      dentist: 'Top Australian dental practices on AI have: HealthEngine profile complete, AHPRA registration visible, Google Business with 80+ reviews, hipages listing for cosmetic work.',
      default: 'Top Australian businesses on AI have: Google Business with 80+ reviews, hipages listing (for trades), TrueLocal profile, ServiceSeeking verification.',
    },
    IN: {
      dentist: 'Top Indian clinics on AI have: Practo profile with qualifications and photos, JustDial listing with business hours, Sulekha profile complete, Google Maps with Hindi business name in alternate name field.',
      default: 'Top Indian businesses on AI have: Practo/JustDial/Sulekha profiles complete, Google Maps listing in both English and Hindi, local WhatsApp Business profile.',
    },
    AE: {
      default: 'Top UAE businesses on AI have: Google Maps in Arabic and English, Trade License number visible on website, Dubai Chamber of Commerce membership, Bayut/Dubizzle listing (for real estate), TrustedShops certification.',
    },
  };

  const countryCtx = contexts[countryCode] || contexts['US'];
  return countryCtx[industry.toLowerCase()] || countryCtx['default'] || contexts['US']['default'];
}
