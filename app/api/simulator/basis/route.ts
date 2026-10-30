import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { basisFromCounts } from '@/lib/simulator';

export const dynamic = 'force-dynamic';

// Phase 15: returns the real data basis for a projection by counting actual rows.
// Ladder: verified outcomes (>=3) → similar businesses (>=10) → industry avg (>=5)
// → fallback estimate. Confidence is derived from real counts, never hardcoded.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const { industry = '', countryCode = 'US', fixType = '' } = await req.json();
    const sb = admin();

    let verifiedCount = 0;
    let similarCount = 0;
    let industryCount = 0;

    try {
      let q = sb
        .from('verified_outcomes')
        .select('*', { count: 'exact', head: true })
        .eq('business_industry', industry)
        .eq('country_code', countryCode)
        .eq('is_verified', true)
        .eq('is_public', true);
      if (fixType) q = q.eq('fix_type', fixType);
      const { count } = await q;
      verifiedCount = count || 0;
    } catch { /* table/columns may be new — treat as 0 */ }

    try {
      const { count } = await sb
        .from('rankall_scans')
        .select('*', { count: 'exact', head: true })
        .eq('industry', industry)
        .eq('country_code', countryCode);
      similarCount = count || 0;
    } catch { /* ignore */ }

    try {
      const { count } = await sb
        .from('rankall_scans')
        .select('*', { count: 'exact', head: true })
        .eq('industry', industry);
      industryCount = count || 0;
    } catch { /* ignore */ }

    const basis = basisFromCounts(verifiedCount, similarCount, industryCount, industry, countryCode);
    return NextResponse.json(basis);
  } catch (err) {
    // Fail open to the honest fallback — never block the simulator on a basis error.
    return NextResponse.json(basisFromCounts(0, 0, 0, '', 'US'));
  }
}
