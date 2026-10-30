import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkUsageLimit, incrementUsage } from '@/lib/usageLimits';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getSessionUser } from '@/lib/apiAuth';
import { enforceTrialCap } from '@/lib/trialCaps';

export const dynamic = 'force-dynamic';

// Thin server-side guard for the AI Inbox feature. The inbox search itself runs
// via /api/scan, so to avoid double-counting we track AI Inbox usage separately
// here. The ai-inbox page calls this:
//   POST {}                      → returns the checkUsageLimit result (gate)
//   POST { increment }           → increments ai_inbox usage after a success
//
// The user comes from the SESSION; body.userId is ignored (it let anyone
// read or inflate another user's usage). No session → anonymous gate
// response (the search route itself requires a session).
export async function POST(req: NextRequest) {
  const trialCap = await enforceTrialCap(req, 'ai_inbox');
  if (trialCap) return trialCap;
  try {
    const { increment } = await req.json().catch(() => ({}));
    const userId = (await getSessionUser(req))?.id ?? null;

    // No session → anonymous; nothing to enforce or increment.
    if (!userId) {
      return NextResponse.json({ allowed: true, current: 0, limit: 0, remaining: 0, resetDate: '' });
    }

    if (increment) {
      // Resolve email so admins are never counted.
      let incEmail = '';
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );
        const { data: userData } = await (adminClient.auth as any).admin.getUserById(userId);
        incEmail = userData?.user?.email || '';
      } catch { /* non-fatal */ }
      await incrementUsage(userId, 'ai_inbox', incEmail);
      return NextResponse.json({ ok: true });
    }

    // Resolve plan + email via the service-role admin client.
    let userPlan = 'free';
    let userEmail = '';
    try {
      const resolved = await resolvePlanServer(userId);
      userPlan = resolved.plan;
      userEmail = resolved.email;
    } catch { /* fall through — treat as free */ }

    const limitCheck = await checkUsageLimit(userId, userEmail, 'ai_inbox', userPlan);
    return NextResponse.json({
      allowed: limitCheck.allowed,
      message: limitCheck.message,
      current: limitCheck.current,
      limit: limitCheck.limit,
      remaining: limitCheck.remaining,
      resetDate: limitCheck.resetDate,
      upgradeUrl: '/pricing',
    });
  } catch (err) {
    console.error('inbox check error:', err);
    // Fail open — never block the inbox on an unexpected error.
    return NextResponse.json({ allowed: true, current: 0, limit: 0, remaining: 0, resetDate: '' });
  }
}
