import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';

// Admin-only manual blog trigger. Cookie-authed (never exposes CRON_SECRET to
// the browser) — it invokes the cron route server-side with the secret.
export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${APP_URL}/api/cron/blog-generate`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, ...data });
}
