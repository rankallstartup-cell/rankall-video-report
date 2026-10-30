import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Marks the one-time retention discount as used for the SIGNED-IN customer,
// so a repeat canceller can never be offered the 50% discount again.
//
// Security: the user comes from the session cookie only. The old route took
// body.userId and wrote it with the service role, so anyone could mark any
// user. The flag lives in app_metadata (service-role only) — a user_metadata
// flag can be cleared by the user via supabase.auth.updateUser() to
// re-qualify for the discount. Readers must use app_metadata.discount_offer_used.
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Merge onto existing app_metadata so we don't clobber account_type etc.
    const { data: existing } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const currentApp = (existing?.user?.app_metadata ?? {}) as Record<string, unknown>;

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...currentApp,
        discount_offer_used: true,
        discount_offer_date: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('mark-discount-used error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
