import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { ok: isAdminUser(user?.email), user };
}

export async function GET(req: NextRequest) {
  const { ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending_review';
  const entityType = searchParams.get('entity_type');

  const sb = admin();
  let query = sb.from('data_quality_quarantine').select('*').order('created_at', { ascending: false }).limit(200);
  if (status && status !== 'all') query = query.eq('status', status);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message });
  return NextResponse.json({ rows: data ?? [] });
}
