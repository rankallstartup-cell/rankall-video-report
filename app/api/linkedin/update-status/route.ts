import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VALID = ['pending', 'message_sent', 'connected', 'replied', 'converted', 'not_interested', 'no_response'];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Updates a linkedin_queue row's status (and the matching timestamp) or notes.
// Scoped to the owning user_id to prevent cross-user writes.
export async function POST(req: NextRequest) {
  try {
    // b01t: the old code trusted the client-supplied userId — both the row
    // id and the userId came from the request body, so the "scope" proved
    // nothing. Bind the scope to the caller's real session.
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { id, userId, status, notes } = await req.json();
    if (!id || !userId) return NextResponse.json({ error: 'id and userId required' }, { status: 400 });
    if (userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof notes === 'string') update.notes = notes;
    if (status) {
      if (!VALID.includes(status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      update.status = status;
      const now = new Date().toISOString();
      if (status === 'message_sent') update.message_sent_at = now;
      if (status === 'connected') update.connected_at = now;
      if (status === 'replied') update.replied_at = now;
    }

    const { error } = await admin().from('linkedin_queue').update(update).eq('id', id).eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
