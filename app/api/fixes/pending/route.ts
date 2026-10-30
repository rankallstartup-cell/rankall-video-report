import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getUserFixes, getFixCounts } from '@/lib/fixes';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTrustedDisplayName, type EnrichmentData } from '@/lib/enrichment';

export const dynamic = 'force-dynamic';

// GET → { fixes, count, appliedCount } — the caller's auto-generated fixes
// awaiting review plus deduped counts, in ONE response (Ticket 4: one fetch
// drives the dashboard banner, queue, and stats — no more two-fetch drift).
// Auth is via the user's cookie session; the read goes through lib/fixes.ts
// (the P0e single source of truth: generated_fixes, deduped by fix_type).
// Always scoped to user.id. Genuine failures return 500 (not 200-with-empties)
// so clients can tell "couldn't load" apart from "none".
export async function GET(req: NextRequest) {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ fixes: [] });

    // Allow filtering by status (?status=approved); default to pending_review.
    const requested = req.nextUrl.searchParams.get('status') || 'pending_review';
    const status = ['pending_review', 'approved', 'applied', 'rejected'].includes(requested) ? requested : 'pending_review';

    // b86n: the list WAS capped at 10 while the returned count is
    // the full deduped total — above 10 pending fixes the queue
    // badge (list length) and the dashboard banner (count)
    // diverged on the same data. Deduped fix types are bounded
    // by the fix-type catalog, so the queue can show them all.
    const fixes = await getUserFixes(user.id, status, 50);

    // b89u: attach each fix's source scan (trusted business name +
    // scan date). The queue spans every scan the account has run, and
    // the page presented those fixes as generated "specifically for
    // your business" (singular) while personalising their content
    // with the LATEST scan's business. The label makes the source
    // explicit per fix.
    const scanIds = [...new Set(fixes.map(f => f.scan_id).filter((x): x is string => !!x))];
    if (scanIds.length) {
      try {
        const { data: scans } = await getSupabaseAdmin()
          .from('rankall_scans')
          .select('id, input, user_business_name, location, enrichment, created_at')
          .in('id', scanIds);
        const byId = new Map((scans ?? []).map(s => [s.id as string, s]));
        for (const f of fixes) {
          const s = f.scan_id ? byId.get(f.scan_id) : undefined;
          if (s) {
            const rec = f as unknown as Record<string, unknown>;
            rec.scan_business = getTrustedDisplayName(
              s.input as string | null,
              s.location as string | null,
              s.user_business_name as string | null,
              (s.enrichment as EnrichmentData | null)?.google ?? null,
            );
            rec.scan_date = s.created_at as string;
          }
        }
      } catch { /* labels are additive — never fail the queue over them */ }
    }

    // Counts only for the default (pending_review) view — the filtered
    // ?status= calls from the fix page don't need them.
    let count = fixes.length;
    let appliedCount = 0;
    if (status === 'pending_review') {
      const counts = await getFixCounts(user.id);
      count = counts.pending;
      appliedCount = counts.applied;
    }

    return NextResponse.json({ fixes, count, appliedCount });
  } catch {
    return NextResponse.json({ fixes: [], error: 'failed to load fixes' }, { status: 500 });
  }
}
