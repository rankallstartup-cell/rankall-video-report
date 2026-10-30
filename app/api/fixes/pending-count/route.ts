import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getFixCounts } from '@/lib/fixes';

export const dynamic = 'force-dynamic';

// GET → { count, appliedCount } of the caller's fixes. Drives the sidebar badge
// + dashboard card. Auth via cookie session; counts come from lib/fixes.ts (the
// P0e single source of truth), deduped the same way as the lists so the badge
// always matches what the fix page shows. Never throws — returns 0s.
export async function GET(req: NextRequest) {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ count: 0, appliedCount: 0 });

    const { pending, applied } = await getFixCounts(user.id);

    return NextResponse.json({ count: pending, appliedCount: applied });
  } catch {
    return NextResponse.json({ count: 0, appliedCount: 0 });
  }
}
