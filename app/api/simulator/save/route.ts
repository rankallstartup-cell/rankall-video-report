import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Phase 15: persist a simulation projection and return a public share URL.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Short, URL-safe, unguessable id.
function makeShareId(): string {
  return 'sim_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      scanId = null,
      userId = null,
      projectionData = null,
      currentScore = null,
      projectedScore = null,
      revenueRecovered = null,
      industry = null,
      isPublic = true,
    } = body;

    if (!projectionData) {
      return NextResponse.json({ error: 'projectionData required' }, { status: 400 });
    }

    const shareId = makeShareId();
    const sb = admin();

    const { error } = await sb.from('simulation_views').insert({
      scan_id: scanId,
      user_id: userId,
      current_score: currentScore,
      projected_score: projectedScore,
      revenue_recovered: revenueRecovered,
      industry,
      projection_data: projectionData,
      is_public: !!isPublic,
      share_id: shareId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io';
    return NextResponse.json({ shareId, url: `${base}/simulator/${shareId}` });
  } catch (err) {
    return NextResponse.json({ error: 'save_failed', message: String(err) }, { status: 500 });
  }
}
