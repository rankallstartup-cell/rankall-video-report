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

// Lightweight connection-status read for the logged-in user's GA4 integration.
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
    .eq('integration_type', 'google_analytics')
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  const packed = String(integration.site_url || '');
  const [property, name] = packed.includes('|') ? packed.split('|') : ['', ''];

  return NextResponse.json({
    connected: true,
    propertyName: name || '',
    propertyId: property || '',
    connectedAt: integration.created_at,
  });
}
