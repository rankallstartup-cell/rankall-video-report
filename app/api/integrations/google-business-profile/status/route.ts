import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Service-role client — bypasses RLS for user_integrations reads (still scoped
// to the authenticated user's id). Auth itself uses the anon/cookie client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Lightweight connection-status read for the logged-in user's GBP integration.
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('site_url, created_at')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_business_profile')
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  const pending = integration.site_url === 'pending_approval' || !String(integration.site_url || '').includes('/locations/');
  // Present a friendly location label; the stored value is a resource path.
  const locationName = pending ? undefined : String(integration.site_url);

  return NextResponse.json({
    connected: true,
    pending,
    locationName,
    connectedAt: integration.created_at,
  });
}
