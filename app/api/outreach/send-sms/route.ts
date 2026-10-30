import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, isCronRequest } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Auth: Bearer CRON_SECRET (env, fails closed when unset) or an admin
  // session. The old check compared x-cron-secret against a HARDCODED
  // literal that was also shipped in client bundles — i.e. public.
  if (!isCronRequest(req) && !(await getAdminUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    phone,
    owner_name,
    business_name,
    score,
    competitor_score,
    report_url,
    country_code,
  } = await req.json();

  if (!phone || !owner_name || !business_name || !report_url) {
    return NextResponse.json({ error: 'phone, owner_name, business_name, report_url required' }, { status: 400 });
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth) {
    return NextResponse.json({ error: 'Twilio not configured', setup_required: true }, { status: 200 });
  }

  // Build ≤160 char message
  const name = owner_name.split(' ')[0] ?? owner_name;
  const biz = business_name.length > 20 ? business_name.slice(0, 17) + '...' : business_name;
  // ax6u residual: NEVER render a score that was never measured. The
  // old code turned a missing score into zero, so a prospect got an
  // SMS claiming "ChatGPT score: 0/100. Competitor: 0/100" for
  // numbers that were never computed. A missing score omits its
  // clause; a real measured 0 still renders (it is real data).
  const scorePart = score != null ? `ChatGPT score: ${score}/100. ` : '';
  const compPart = competitor_score != null ? `Competitor: ${competitor_score}/100. ` : '';
  // Truncate URL if needed to fit 160 chars
  const body = `Hi ${name}, I scanned ${biz} — ${scorePart}${compPart}Free report: ${report_url} - Nandish, Rankall`.slice(0, 160);

  const params = new URLSearchParams({
    To: phone,
    From: twilioFrom ?? '',
    Body: body,
  });

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  const twilioData = await twilioRes.json() as { sid?: string; message?: string; error_message?: string };

  if (!twilioRes.ok) {
    return NextResponse.json({ error: twilioData.message ?? twilioData.error_message ?? 'SMS send failed' }, { status: 500 });
  }

  return NextResponse.json({ sent: true, message_sid: twilioData.sid });
}
