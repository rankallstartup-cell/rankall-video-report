import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canAccessScan, getSessionUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Anonymous homepage scans (user_id null) let the visitor pick "this is my
// business" right after the scan. Without an owner to check, that one write
// is allowed only while the scan is fresh AND has no name yet (first write
// wins) — so nobody can rename an existing report.
const ANON_RENAME_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { scanId, businessName } = await req.json();
    if (!scanId || typeof businessName !== 'string' || !businessName.trim()) {
      return NextResponse.json({ error: 'scanId and businessName required' }, { status: 400 });
    }
    const name = businessName.trim().slice(0, 200);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    // IDOR fix: the old route renamed ANY scan id with the service role.
    const { data: scan, error: readErr } = await supabase
      .from('rankall_scans')
      .select('id, user_id, user_business_name, created_at')
      .eq('id', scanId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await getSessionUser(req);
    if (scan.user_id) {
      if (!canAccessScan(scan, user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const age = Date.now() - new Date(scan.created_at as string).getTime();
      const fresh = Number.isFinite(age) && age >= 0 && age <= ANON_RENAME_WINDOW_MS;
      if (!fresh || scan.user_business_name) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    let update = supabase
      .from('rankall_scans')
      .update({ user_business_name: name })
      .eq('id', scanId);
    // Ownerless: conditional write so two racing requests can't both win.
    if (!scan.user_id) update = update.is('user_business_name', null);
    const { error } = await update;

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
