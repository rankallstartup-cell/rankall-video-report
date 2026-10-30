import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/planConfig';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const VALID_PLANS = [
  'free',
  'local_pro',
  'personal_pro',
  'local_pro_seo',
  'agency',
  'agency_seo',
  'enterprise',
  'government',
];

let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, p) { return (getAdminClient() as any)[p]; },
});

export async function POST(req: NextRequest) {
  try {
    const { plan, userId } = await req.json();

    // ax77: verify the caller's REAL session — the old code trusted
    // body.callerEmail, so anyone could POST callerEmail
    // 'nandish@rankall.io' and switch ANY user's plan (privilege
    // escalation). callerEmail is now ignored. The browser caller
    // (plan-switcher page) sends its session cookie with the fetch.
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!isAdminUser(user?.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: `Invalid plan: ${plan}` }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // b062: the grant lands in app_metadata (trusted — admin API only,
    // users cannot write it; resolvers read it) AND user_metadata
    // (legacy display-only readers). Resolvers NEVER read user_metadata.
    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(userId, {
      app_metadata: { account_type: plan },
      user_metadata: { account_type: plan },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
