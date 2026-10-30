import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { internalBaseUrl } from '@/lib/internalBaseUrl';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// Admin-only server-side proxy for the dashboard email test panel. It holds the
// CRON_SECRET server-side and attaches it to the forwarded request, so the secret
// never ships in the client bundle. Admin is verified via the session cookie.
//
// Body: { testType: 'milestone' | 'sequence' | 'cron', payload?, endpoint? }
//  - milestone → POST /api/milestone-email  (needs Bearer CRON_SECRET)
//  - sequence  → POST /api/email-sequence
//  - cron      → GET  <endpoint>?test_email=<admin>  (needs Bearer CRON_SECRET)
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { testType, payload, endpoint } = await req.json().catch(() => ({}));
  // Fixed trusted origin — never the request Host (it receives CRON_SECRET).
  const origin = internalBaseUrl();
  const cronAuth = { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' };

  let target: string;
  let init: RequestInit;

  if (testType === 'milestone') {
    target = `${origin}/api/milestone-email`;
    init = { method: 'POST', headers: cronAuth, body: JSON.stringify(payload ?? {}) };
  } else if (testType === 'sequence') {
    target = `${origin}/api/email-sequence`;
    init = { method: 'POST', headers: cronAuth, body: JSON.stringify(payload ?? {}) };
  } else if (testType === 'cron') {
    if (!endpoint || !endpoint.startsWith('/api/cron/')) {
      return NextResponse.json({ error: 'Invalid cron endpoint' }, { status: 400 });
    }
    // Route the test send to the admin's own inbox so no real user is emailed.
    const testEmail = encodeURIComponent(user!.email!);
    target = `${origin}${endpoint}?test_email=${testEmail}`;
    init = { method: 'GET', headers: cronAuth };
  } else {
    return NextResponse.json({ error: 'Unknown testType' }, { status: 400 });
  }

  try {
    const res = await fetch(target, init);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Proxy failed' }, { status: 502 });
  }
}
