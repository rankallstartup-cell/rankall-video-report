import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ax72: the proof-card page's source of verified outcomes. Session-auth +
// admin read (verified_outcomes RLS is not relied on). Only the caller's
// own rows, only is_verified = true — a proof card can only come from one.
export async function GET(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('verified_outcomes')
    .select('id, fix_type, business_name, score_before, score_after, created_at, verified_at, days_to_improvement, scan_id_after, is_public')
    .eq('user_id', user.id)
    .eq('is_verified', true)
    .order('verified_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load verified outcomes' }, { status: 500 });
  return NextResponse.json({ outcomes: data ?? [] });
}
