import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { TRIAL_WHITELABEL_BLOCKED_MESSAGE } from '@/lib/trialCaps';
import { isAgencyPlan } from '@/lib/planConfig';

// PUT /api/agency/settings — save the caller's agency settings.
// Server-side enforcement for the white-label trial cap (b28g): a trialing
// account cannot enable white-label. The dashboard settings page previously
// upserted agency_settings directly from the browser, so the toggle had no
// server gate at all — any client could flip it. All saves now go through
// this route. Logo upload (Supabase Storage) is unchanged; a logo alone does
// NOT enable white-label — only an explicit white_label_enabled: true does,
// and that is what the trial gate blocks.

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // b89d: agency settings are an Agency-plan surface (canSeeAgency) —
  // the route gated only the trial white-label case, so a Free
  // account could save branding AND enable white-label by calling
  // this route directly. The plan gate now applies to every save;
  // the trial cap below still applies within agency plans.
  let resolved: Awaited<ReturnType<typeof resolvePlanServer>> | null = null;
  try {
    resolved = await resolvePlanServer(user.id);
  } catch { /* handled below */ }
  if (!resolved) {
    return NextResponse.json({
      error: 'plan_unavailable',
      message: 'We could not confirm your plan right now, so settings were not saved. Please try again.',
    }, { status: 503 });
  }
  if (!resolved.isAdmin && !isAgencyPlan(resolved.plan)) {
    return NextResponse.json({
      error: 'upgrade_required',
      message: 'Agency settings are available on the Agency plan.',
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }
  const isTrialing = resolved.isTrialing;

  const whiteLabelRequested = body.white_label_enabled === true;

  // Trial cap: white-label is blocked during trial. This route is the ONLY
  // write path (agency_settings has RLS with no client write policy —
  // migration 20261016000300_billing_hardening.sql). Fail CLOSED for a
  // white-label enable when the plan cannot be resolved; other fields save.
  if (whiteLabelRequested) {
    if (isTrialing) {
      return NextResponse.json({
        error: 'trial_whitelabel_blocked',
        message: TRIAL_WHITELABEL_BLOCKED_MESSAGE,
        upgradeUrl: '/pricing',
      }, { status: 403 });
    }
  }

  // Whitelist fields — never trust a body user id; the row is always the
  // caller's own.
  const payload = {
    agency_user_id: user.id,
    agency_name: typeof body.agency_name === 'string' ? body.agency_name : '',
    agency_website: typeof body.agency_website === 'string' ? body.agency_website : '',
    agency_primary_color: typeof body.agency_primary_color === 'string' ? body.agency_primary_color : '#7C3AED',
    agency_email: typeof body.agency_email === 'string' ? body.agency_email : '',
    agency_phone: typeof body.agency_phone === 'string' ? body.agency_phone : '',
    agency_logo_url: typeof body.agency_logo_url === 'string' ? body.agency_logo_url : '',
    white_label_enabled: whiteLabelRequested,
  };

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await admin
    .from('agency_settings')
    .upsert(payload, { onConflict: 'agency_user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save agency settings' }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
