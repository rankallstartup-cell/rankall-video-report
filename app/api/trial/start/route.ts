import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { startTrialForUser } from '@/lib/trial';

export const dynamic = 'force-dynamic';

// POST /api/trial/start — start the caller's one 7-day trial (ax6m).
// Idempotent: if the user already has any subscriptions row, returns its
// state without creating a second trial. The plan comes from the body, else
// from the signup intent stored in metadata (intended_plan from OAuth,
// plan display name from email signup).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const planInput =
    (typeof body.plan === 'string' ? body.plan : null) ??
    (typeof meta.intended_plan === 'string' ? meta.intended_plan : null) ??
    (typeof meta.plan === 'string' ? meta.plan : null);
  const result = await startTrialForUser(user.id, planInput);
  if (!result) {
    return NextResponse.json({ error: 'trial_start_failed' }, { status: 500 });
  }
  return NextResponse.json({ trial: result });
}
