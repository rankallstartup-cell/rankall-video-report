import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isScanId } from '@/lib/reportPayload';
import { buildVideoReadyEmail } from '@/lib/video/videoReportEmail';
import { sendEmail } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

// Hackathon video-report "video ready" email — Meta Global AI Developer
// Hackathon, Day 5. Closes the scan → video → email → signup loop as far
// as existing infra allows.
//
// POST /api/hackathon/video-report/notify
//   Body: { scanId, email, videoUrl }
//     scanId   — loads the business facts from rankall_scans (never trusts
//                caller-supplied names/scores — nothing invented).
//     email    — recipient address, supplied by the operator/demo flow.
//                This page collects no email itself; the endpoint is the
//                seam the Day 5 judge demo mode (or a manual send) calls.
//     videoUrl — the finished mp4 URL from a completed pipeline job.
//   Sends via the repo's existing sendEmail (Resend HTTP API).
//
// Explicit boundary, NOT a fake send: when RESEND_API_KEY is missing (or
// the rankall.io sending domain is not verified on Resend), sendEmail
// returns false and this route answers { sent: false, reason:
// 'email_not_configured' } with 503. The caller must surface that
// honestly — the video page itself never claims an email went out.
// Gated by HACKATHON_VIDEO_REPORT_ENABLED=1, like the other hackathon
// routes. DB-free: no rows are written.

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  let body: { scanId?: unknown; email?: unknown; videoUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  if (!isScanId(body.scanId)) {
    return NextResponse.json({ error: 'scanId is required' }, { status: 400, headers: NO_STORE });
  }
  if (typeof body.email !== 'string' || !isEmail(body.email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400, headers: NO_STORE });
  }
  if (typeof body.videoUrl !== 'string' || !isHttpUrl(body.videoUrl)) {
    return NextResponse.json({ error: 'videoUrl must be an http(s) URL' }, { status: 400, headers: NO_STORE });
  }

  const admin = getSupabaseAdmin();
  const { data: scan, error } = await admin
    .from('rankall_scans')
    .select('user_business_name, business_name, location, industry, overall_score')
    .eq('id', body.scanId)
    .maybeSingle();
  if (error) {
    console.error('[hackathon/video-report/notify] scan load error:', error.message);
    return NextResponse.json({ error: 'Load failed' }, { status: 500, headers: NO_STORE });
  }
  if (!scan) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const row = scan as {
    user_business_name?: string | null;
    business_name?: string | null;
    location?: string | null;
    industry?: string | null;
    overall_score?: number | null;
  };
  const deliveryUrl =
    `${req.nextUrl.origin}/hackathon/video-report/${body.scanId}` +
    `?videoUrl=${encodeURIComponent(body.videoUrl)}`;

  let email;
  try {
    email = buildVideoReadyEmail({
      businessName: row.user_business_name || row.business_name || 'your business',
      city: row.location ?? null,
      industry: row.industry ?? null,
      score: row.overall_score ?? null,
      deliveryUrl,
      videoUrl: body.videoUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid email input' },
      { status: 400, headers: NO_STORE },
    );
  }

  const sent = await sendEmail({ to: body.email, subject: email.subject, html: email.html });
  if (!sent) {
    return NextResponse.json(
      { sent: false, reason: 'email_not_configured' },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json({ sent: true }, { headers: NO_STORE });
}
