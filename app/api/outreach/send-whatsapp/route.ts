import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminUser, isCronRequest } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { buildWhatsAppMessage, whatsappLogScore } from '@/lib/outreachCopy';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io';

// POST /api/outreach/send-whatsapp
// Body: { to (E.164 phone), firstName?, businessName, industry?, city?, competitorName?, competitorScore?, score?, scanId? }
// Sends via Twilio WhatsApp REST API. All Twilio access is env-guarded.
export async function POST(req: NextRequest) {
  // Auth: this route had NO auth — anyone could send WhatsApp messages
  // (arbitrary recipient + business text) on Rankall's Twilio account.
  // Now: an admin session or the CRON_SECRET bearer (fails closed), plus a
  // daily send cap per caller.
  const internal = isCronRequest(req);
  const adminUser = internal ? null : await getAdminUser(req);
  if (!internal && !adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(`whatsapp:${adminUser?.id ?? 'cron'}`, adminUser?.id ?? 'cron', { limit: 200 });
  if (!rl.allowed) return NextResponse.json({ error: 'Daily WhatsApp send cap reached' }, { status: 429 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+14155238886'

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'Twilio WhatsApp not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { to, firstName, businessName, industry, city, competitorName, competitorScore, scanId, countryCode, language, score } = body;
  if (!to || !businessName) {
    return NextResponse.json({ error: 'to and businessName required' }, { status: 400 });
  }

  // Normalise the destination to WhatsApp format
  const toWhatsApp = String(to).startsWith('whatsapp:') ? String(to) : `whatsapp:${to}`;
  const reportUrl = scanId ? `${BASE_URL}/report/${encodeURIComponent(String(scanId))}` : BASE_URL;

  // Respect unsubscribe list (by phone)
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: unsub } = await sb.from('outreach_unsubscribes').select('phone').eq('phone', to).maybeSingle();
    if (unsub) return NextResponse.json({ skipped: true, reason: 'unsubscribed' });
  } catch { /* non-fatal */ }

  // Item 4: competitor lead only when measured; no score line when unmeasured.
  const message = buildWhatsAppMessage({ firstName, businessName, industry, city, competitorName, competitorScore, reportUrl, countryCode, language, score });

  const params = new URLSearchParams();
  params.append('To', toWhatsApp);
  params.append('From', fromNumber);
  params.append('Body', message);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Twilio WhatsApp error:', data);
    return NextResponse.json({ error: data.message || 'Send failed', code: data.code }, { status: 500 });
  }

  // Log to outreach_log
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await sb.from('outreach_log').insert({
      business_name: businessName,
      phone: to,
      city,
      industry,
      scan_id: scanId || null,
      channel: 'whatsapp',
      score: whatsappLogScore(score),
      sent_at: new Date().toISOString(),
      status: 'sent',
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, sid: data.sid });
}
