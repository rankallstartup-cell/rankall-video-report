import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUser } from '@/lib/apiAuth';
import { canViewInboxSearch } from '@/lib/inboxShare';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/inbox/[id] — one saved AI Inbox search. The OWNER (session) may
// always read it; anyone else only when the owner explicitly shared it via
// "Share Results" (is_shared). It used to return any user's results to
// anyone holding the id. A missing is_shared column (migration not applied)
// reads as not shared — fail closed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'supabase env not configured' }, { status: 500 });
    }

    const { data, error } = await admin()
      .from('ai_inbox_searches')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE });
    const row = data as Record<string, unknown>;

    const viewer = await getSessionUser(req);
    if (!canViewInboxSearch(row, viewer?.id ?? null)) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(
      { row: { id: row.id, query: row.query, results: row.results, created_at: row.created_at } },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error('inbox/[id] GET error:', e);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}

// POST { action: 'share' | 'unshare' } — owner publishes / un-publishes the
// search for the public /inbox/[id] page.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let action: unknown = null;
  try { action = (await req.json())?.action; } catch { /* invalid body */ }
  if (action !== 'share' && action !== 'unshare') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const viewer = await getSessionUser(req);
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await admin()
    .from('ai_inbox_searches')
    .update({ is_shared: action === 'share' })
    .eq('id', id)
    .eq('user_id', viewer.id)
    .select('id');
  if (error) {
    console.error('inbox share update failed (migration 20261016000400_inbox_share applied?):', error);
    return NextResponse.json({ error: 'Sharing is unavailable right now' }, { status: 503 });
  }
  if (!Array.isArray(data) || data.length === 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ success: true, shared: action === 'share' });
}
