import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Returns the commit the running deployment was built from — hit this to confirm
// which build production is actually serving.
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
