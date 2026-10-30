import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    // b01t: this endpoint had NO auth at all and returned everyone's
    // outreach emails (incl. full body_html) via the service-role key.
    // outreach_log rows carry no user_id, so per-user scoping is impossible;
    // admin-only matches its only consumer (the admin-gated dashboard
    // outreach page, which returns null for non-admins).
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!isAdminUser(user?.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from('outreach_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
