import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface VerifiedOutcome {
  id: string;
  user_id: string | null;
  business_name: string | null;
  business_industry: string | null;
  fix_type: string | null;
  score_before: number | null;
  score_after: number | null;
  score_improvement: number | null;
  verified_at: string | null;
  is_verified: boolean | null;
  is_public: boolean | null;
  confidence_level: string | null;
}

async function getOutcome(id: string): Promise<VerifiedOutcome | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('verified_outcomes')
    .select('id, user_id, business_name, business_industry, fix_type, score_before, score_after, score_improvement, verified_at, is_verified, is_public, confidence_level')
    .eq('id', id)
    .maybeSingle();
  return (data as VerifiedOutcome | null) ?? null;
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// GET — public. Returns the outcome ONLY if it is verified AND the owner
// made it public. Anything else is a 404: no fake proof, no leaks.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const outcome = await getOutcome(id);
  if (!outcome || outcome.is_verified !== true || outcome.is_public !== true) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { user_id: _userId, ...publicOutcome } = outcome;
  return NextResponse.json(publicOutcome, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

// PATCH — owner only. Toggles is_public (the permission to publish).
// Body: { is_public: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const outcome = await getOutcome(id);
  if (!outcome) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (outcome.user_id !== userId) {
    return NextResponse.json({ error: 'Not your outcome' }, { status: 403 });
  }
  if (outcome.is_verified !== true) {
    return NextResponse.json(
      { error: 'Only verified outcomes can be made public' },
      { status: 422 }
    );
  }
  let isPublic: boolean;
  try {
    const body = await req.json();
    isPublic = body.is_public === true;
  } catch {
    return NextResponse.json({ error: 'Body must be { is_public: boolean }' }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('verified_outcomes')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ id, is_public: isPublic });
}
