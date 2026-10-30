import { NextResponse } from 'next/server';
import { listVideoJobs } from '../route';
import { StoreUnavailable } from '@/lib/video/jobStore';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// GET /api/hackathon/video-report/jobs — list every video job, newest
// first, from the durable Supabase store (see lib/video/jobStore.ts).
// Same flag as the job route (404s when off). When the store is
// unavailable (migration not run yet), answers an explicit 503
// 'job_store_unavailable' instead of an empty list that would hide jobs.
export async function GET() {
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  try {
    return NextResponse.json({ jobs: await listVideoJobs() }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof StoreUnavailable) {
      return NextResponse.json({ error: 'job_store_unavailable' }, { status: 503, headers: NO_STORE });
    }
    console.error('[hackathon/video-report/jobs] list failed:', err);
    return NextResponse.json({ error: 'Job store error' }, { status: 500, headers: NO_STORE });
  }
}
