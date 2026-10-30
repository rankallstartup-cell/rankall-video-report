import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkUsageLimit, incrementUsage } from '@/lib/usageLimits';
import { enforceTrialCap } from '@/lib/trialCaps';
import { normalizePlan, isAdminUser, resolvePlanFromSources, type PlanType } from '@/lib/planConfig';
import { getSessionUser } from '@/lib/apiAuth';
import { internalBaseUrl } from '@/lib/internalBaseUrl';
import { isValidQueryText, MAX_QUERY_LENGTH } from '@/lib/queryVariations';

export const dynamic = 'force-dynamic';

// Unified, cost-protected AI Inbox search:
//   auth → free-block → 24h per-user cache → usage check → run scan →
//   save to cache → increment ai_inbox usage.
// A cache hit returns instantly and does NOT consume a credit.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const trialCap = await enforceTrialCap(req, 'ai_inbox');
  if (trialCap) return trialCap;
  try {
    // IDOR fix: the user comes from the session cookie; body.userId is
    // ignored (it let anyone spend/read another user's AI Inbox credits).
    const { query, fresh = false } = await req.json();
    const sessionUser = await getSessionUser(req);
    const userId = sessionUser?.id ?? null;
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) return NextResponse.json({ error: 'Query required' }, { status: 400 });
    if (!isValidQueryText(trimmed)) {
      return NextResponse.json({ error: 'invalid_input', message: `Query must be at most ${MAX_QUERY_LENGTH} characters with no control characters.` }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'plan_required', message: 'Sign in to use AI Inbox.', upgradeUrl: '/signup' }, { status: 401 });
    }

    // b062: plan from the authoritative cascade (subscriptions →
    // app_metadata → free) via resolvePlanFromSources. NEVER
    // user_metadata — the user can set it themselves and self-grant
    // (this gate blocks free users from AI Inbox). profiles is not
    // a plan source either.
    let plan: PlanType = 'free';
    let email = '';
    try {
      const sb = admin();
      const { data: u } = await (sb.auth as unknown as { admin: { getUserById: (id: string) => Promise<{ data: { user?: { app_metadata?: Record<string, unknown>; email?: string } } }> } }).admin.getUserById(userId);
      email = u?.user?.email || '';
      const { data: sub } = await sb.from('subscriptions').select('plan, status, trial_end').eq('user_id', userId).in('status', ['active', 'trialing', 'past_due']).limit(1).maybeSingle();
      plan = resolvePlanFromSources(
        sub as { plan?: string | null; status?: string | null; trial_end?: string | null } | null,
        u?.user?.app_metadata,
      );
    } catch { /* treat as free */ }

    // Admins are never gated.
    const isAdmin = !!email && isAdminUser(email);

    // Free users are blocked from AI Inbox (admins bypass).
    if (!isAdmin && normalizePlan(plan) === 'free') {
      return NextResponse.json(
        { error: 'plan_required', message: 'AI Inbox requires the Starter plan or above.', upgradeUrl: '/pricing' },
        { status: 403 },
      );
    }

    const normalizedQuery = trimmed.toLowerCase();

    // 24h cache — a hit returns immediately and never consumes a credit.
    if (!fresh) {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin()
          .from('ai_inbox_searches')
          .select('id, results, created_at')
          .eq('user_id', userId)
          .eq('query', normalizedQuery)
          .gt('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cached && (cached as Record<string, unknown>).results) {
          return NextResponse.json({
            results: (cached as Record<string, unknown>).results,
            cached: true,
            cachedAt: (cached as Record<string, unknown>).created_at,
            searchId: (cached as Record<string, unknown>).id,
            query: normalizedQuery,
          });
        }
      } catch { /* cache miss on error */ }
    }

    // Usage limit check (before the expensive 12-platform scan).
    const limit = await checkUsageLimit(userId, email, 'ai_inbox', plan);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'inbox_limit_reached', message: limit.message, current: limit.current, limit: limit.limit, remaining: limit.remaining, resetDate: limit.resetDate, upgradeUrl: '/pricing' },
        { status: 429 },
      );
    }

    // Run the scan server-to-server AS this user (internal bearer + userId,
    // like agency-rescan): it counts against the user's own daily scan limit,
    // pause state and trial caps instead of one shared anonymous IP bucket.
    // meter:'ai_inbox' tells /api/scan this search is metered here (ai_inbox),
    // so it does not also charge local_scan. Fails closed without the secret.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[inbox/search] CRON_SECRET unset — cannot call /api/scan as the user');
      return NextResponse.json({ error: 'Search unavailable', message: 'Search is temporarily unavailable.' }, { status: 503 });
    }
    // Fixed trusted origin — never the request Host (it would receive the
    // CRON_SECRET bearer).
    const scanRes = await fetch(`${internalBaseUrl()}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({ input: trimmed, userId, meter: 'ai_inbox' }),
    });
    const results = await scanRes.json();
    if (!scanRes.ok || results.error) {
      return NextResponse.json({ error: 'Search failed', message: results.error || 'Scan failed' }, { status: 502 });
    }

    // Save to cache + increment usage (both best-effort; never block the result).
    let searchId: string | null = null;
    try {
      const { data: inserted } = await admin()
        .from('ai_inbox_searches')
        .insert({ user_id: userId, query: normalizedQuery, results, created_at: new Date().toISOString() })
        .select('id')
        .single();
      searchId = (inserted as { id: string } | null)?.id ?? null;
    } catch { /* table may be new */ }
    await incrementUsage(userId, 'ai_inbox', email);

    return NextResponse.json({
      results,
      cached: false,
      searchId,
      query: normalizedQuery,
      usage: { current: (limit.current ?? 0) + 1, limit: limit.limit, remaining: Math.max(0, (limit.remaining ?? 0) - 1), resetDate: limit.resetDate },
    });
  } catch (err) {
    console.error('inbox search error:', err);
    return NextResponse.json({ error: 'Search failed', message: String(err) }, { status: 500 });
  }
}
