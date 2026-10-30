import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/planConfig';
import { runWeeklyReports } from '@/lib/weeklyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Admin-only manual trigger for the weekly report (for testing). Auth is via the
// admin's cookie session — CRON_SECRET is never exposed to the browser. Accepts an
// optional { limit } to cap how many are sent during a test.
export async function POST(req: NextRequest) {
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authed.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = typeof body.limit === 'number' ? body.limit : undefined;
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true';

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const result = await runWeeklyReports(supabaseAdmin, { limit, dryRun });

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_send: result.sent,
      would_skip: result.skipped,
      preview: result.preview ?? [],
    });
  }
  return NextResponse.json({ ok: true, ...result });
}
