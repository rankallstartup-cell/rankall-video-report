import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// Phase 16: posts a test message to the Slack webhook to confirm alerts work.
async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return isAdminUser(user?.email);
}

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return NextResponse.json({ sent: false, error: 'SLACK_WEBHOOK_URL not set' }, { status: 400 });

  const timestamp = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🧪 Rankall Health Check Alert\nThis is a test from the QA page.\nTime: ${timestamp}\nStatus: All systems operational`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ sent: false, error: `Slack HTTP ${res.status}: ${detail}` }, { status: 502 });
    }
    return NextResponse.json({ sent: true, timestamp });
  } catch (e) {
    return NextResponse.json({ sent: false, error: String(e) }, { status: 500 });
  }
}
