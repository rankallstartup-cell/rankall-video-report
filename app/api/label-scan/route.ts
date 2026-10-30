import { NextRequest, NextResponse } from 'next/server';
import { autoLabelScan } from '@/lib/autoLabel';

export const dynamic = 'force-dynamic';

/**
 * POST /api/label-scan — thin wrapper over lib/autoLabel (ticket b7x5).
 *
 * The scan routes now call autoLabelScan directly via next/server after().
 * This endpoint stays for any external caller: it labels the given scan
 * from its stored DB row (idempotent — never overwrites existing labels).
 *
 * Behavior change vs the old route: the old route ran an Intelligence
 * Graph data-quality gate that could SKIP labeling for dirty scans.
 * Phase 1 labeling covers EVERY completed scan (dirty scans get honest
 * labels too), so the gate no longer applies here.
 */
export async function POST(req: NextRequest) {
  try {
    const { scanId } = await req.json();
    if (!scanId || typeof scanId !== 'string') {
      return NextResponse.json({ error: 'scanId required' }, { status: 400 });
    }
    const result = await autoLabelScan({ scanId });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('label-scan error:', err?.message);
    return NextResponse.json({ error: 'Labeling failed', message: err?.message }, { status: 500 });
  }
}
