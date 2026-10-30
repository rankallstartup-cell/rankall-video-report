import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { id, action: 'approved' | 'rejected', businessName? } — approve/reject an
// auto-generated fix. On approve with a businessName, the placeholders in the
// generated content are replaced with the real name. Auth via cookie session; DB
// ops via SERVICE ROLE (scoped to user.id) so RLS on generated_fixes never blocks.
export async function POST(req: NextRequest) {
  const authed = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action, businessName } = await req.json();
  if (!id || !['approved', 'rejected', 'applied', 'pending_review'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { status: action, updated_at: now };
  if (action === 'approved') updateData.approved_at = now;
  else if (action === 'applied') updateData.applied_at = now;
  else if (action === 'rejected') updateData.rejected_at = now;
  else if (action === 'pending_review') updateData.applied_at = null; // undo: reset to queue

  // On approve with a real business name, personalise the generated content by
  // replacing the placeholders left in during generation.
  if (action === 'approved' && businessName) {
    const { data: fix } = await admin
      .from('generated_fixes')
      .select('generated_content')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    const content = fix?.generated_content as string | undefined;
    if (content) {
      updateData.generated_content = content
        .replace(/YOUR_BUSINESS_NAME/g, businessName)
        .replace(/\[Business Name\]/g, businessName)
        .replace(/\[businessName\]/g, businessName);
    }
  }

  const { data, error } = await admin
    .from('generated_fixes')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Fix not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, fix: data });
}
