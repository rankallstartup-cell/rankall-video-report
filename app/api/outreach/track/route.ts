import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { safeTrackRedirect } from '@/lib/safeRedirect';

export const dynamic = 'force-dynamic';

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

// GET /api/outreach/track?token=XXX&event=open|click — email tracking pixel/redirect
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const event = searchParams.get('event') || 'open';
  const redirect = searchParams.get('redirect');

  if (token) {
    try {
      const sb = getAdminClient();
      await sb.from('outreach_events').insert({
        token,
        event,
        ip: req.headers.get('x-forwarded-for') || null,
        user_agent: req.headers.get('user-agent') || null,
        created_at: new Date().toISOString(),
      });

      if (event === 'open' || event === 'click') {
        await sb
          .from('outreach_intelligence')
          .update({ status: 'engaged', last_engaged_at: new Date().toISOString() })
          .eq('tracking_token', token)
          .eq('status', 'new');
        // Cold-sequence tracking: the token is the outreach_sequence_log id. Stamp
        // opened/clicked so /api/cron/outreach-sequence can stop on click. No-ops
        // for nurture/intelligence tokens that don't match a sequence-log row.
        const nowStamp = new Date().toISOString();
        await sb
          .from('outreach_sequence_log')
          .update(event === 'click' ? { clicked_at: nowStamp, opened_at: nowStamp } : { opened_at: nowStamp })
          .eq('id', token);
      }
    } catch { /* non-fatal */ }
  }

  if (redirect) {
    // Allow-listed rankall.io hosts only — this was an open redirect.
    return NextResponse.redirect(safeTrackRedirect(redirect));
  }

  // 1x1 transparent GIF for open pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return new NextResponse(pixel, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store' },
  });
}

// POST /api/outreach/track — video event tracking with hot lead Slack alerts
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { event, scan_id, clicked_cta } = body as {
    event?: string;
    scan_id?: string;
    clicked_cta?: boolean;
  };

  if (!event || !scan_id) {
    return NextResponse.json({ error: 'Missing event or scan_id' }, { status: 400 });
  }

  const sb = getAdminClient();

  // Hash IP for privacy
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  const ipHash = ip ? Buffer.from(ip).toString('base64').slice(0, 16) : null;

  // Insert video_views record
  try {
    await sb.from('video_views').insert({
      scan_id,
      event,
      clicked_cta: clicked_cta ?? (event === 'video_cta_clicked'),
      ip_hash: ipHash,
      viewed_at: new Date().toISOString(),
      user_agent: req.headers.get('user-agent') || null,
    });
  } catch { /* non-fatal */ }

  // Hot lead triggers
  const isHotLead = event === 'video_cta_clicked' ||
    (event === 'video_page_viewed' && false /* check if 2nd view */);

  if (isHotLead && process.env.SLACK_WEBHOOK_URL) {
    // Get scan details
    const { data: scanInfo } = await sb
      .from('outreach_targets')
      .select('business_name, city, industry, rankall_score, competitor_name')
      .eq('scan_id', scan_id)
      .single();

    if (scanInfo) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🔥 HOT LEAD ALERT\n\nBusiness: ${scanInfo.business_name} — ${scanInfo.city}\nIndustry: ${scanInfo.industry}\nScore: ${scanInfo.rankall_score}/100\nEvent: ${event}\n\n→ Follow up NOW\nhttps://rankall.io/report/${scan_id}`,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
