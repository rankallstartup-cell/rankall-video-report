import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getFixesForScan } from '@/lib/fixes';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { isPaidPlan } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// GET ?scan_id= → { fixes } — the persisted fixes for one scan, deduped by
// fix_type. P0e: this is what the report page reads (single source of truth:
// generated_fixes), replacing the on-the-fly /api/generate-fixes counts.
//
// Ownership: scans with a user_id require the owner's session (403 otherwise);
// outreach scans (user_id NULL) are public by design (the /r/[id] funnel).
//
// b0fm: the response ALSO enforces the report page's paywall lock. The
// report UI hides locked fixes (impact-rank index > 0 for logged-out /
// free viewers), but the old route returned every fix's full
// generated_content + why_recommended, so a free viewer could read
// locked fix content from the network response. Locked fixes are now
// returned with generated_content + why_recommended stripped (title,
// type, impact, confidence, difficulty, time stay — the gate cards
// need the count + teaser metadata) and locked: true.
export async function GET(req: NextRequest) {
  try {
    const scanId = req.nextUrl.searchParams.get('scan_id');
    if (!scanId) return NextResponse.json({ fixes: [] });

    const admin = getSupabaseAdmin();
    const { data: scan } = await admin
      .from('rankall_scans')
      .select('user_id')
      .eq('id', scanId)
      .maybeSingle();
    if (!scan) return NextResponse.json({ fixes: [] });

    const ownerId = (scan as { user_id: string | null }).user_id;
    // The viewer for the lock: the owner for owned scans, or whoever
    // is signed in for outreach scans (a paid viewer unlocks all —
    // same rule the report page applies client-side).
    let viewerId: string | null = null;
    if (ownerId) {
      const authed = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
      );
      const { data: { user } } = await authed.auth.getUser();
      if (!user || user.id !== ownerId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      viewerId = user.id;
    } else {
      const authed = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
      );
      const { data: { user } } = await authed.auth.getUser();
      viewerId = user?.id ?? null;
    }

    // b0fm: mirror the report page's lock — fix #1 (highest impact)
    // is free for everyone; the rest need a paid plan or admin.
    // Fail closed: any plan-resolution error locks everything but #1.
    let unlockedAll = false;
    if (viewerId) {
      try {
        const { plan, isAdmin } = await resolvePlanServer(viewerId);
        unlockedAll = isAdmin || isPaidPlan(plan);
      } catch { /* fall through — first fix only */ }
    }

    // getFixesForScan returns impact-ranked fixes, so index 0 is the
    // same "fix #1" the report page leaves unlocked.
    const fixes = await getFixesForScan(scanId);
    const gated = fixes.map((fix, i) => {
      if (unlockedAll || i === 0) return { ...fix, locked: false };
      return { ...fix, generated_content: null, why_recommended: null, locked: true };
    });
    return NextResponse.json({ fixes: gated });
  } catch {
    return NextResponse.json({ fixes: [] });
  }
}
