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

export async function POST(req: NextRequest) {
  const { ok, user } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body?.id;
  const action = body?.action;
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Missing or invalid id/action' }, { status: 400 });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const sb = admin();
  const { error } = await sb
    .from('data_quality_quarantine')
    .update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      action_taken: action,
    })
    .eq('id', id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
