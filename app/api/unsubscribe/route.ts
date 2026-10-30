import { NextRequest, NextResponse } from 'next/server';
import {
  verifyUnsubscribeToken,
  generateUnsubscribeToken,
  addToDoNotContact,
} from '@/lib/outreachGuard';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/emailTemplates';
import { isHoneypotTripped, clientIp, allowByDbLimit } from '@/lib/publicFormGuard';

// b8be: unsubscribe is a state-changing action — it must NEVER happen
// on GET (email clients and link prefetchers fetch URLs without user
// consent) and never on page load. The old GET handler unsubscribed on
// any fetch, and the old page auto-fired it on mount whenever
// ?email=&token= were present. Mutation now happens only via POST
// with an explicit submit, and only with a valid token.
//
// POST body: { email, token? }
//   - With a valid token (the signed link in an email): unsubscribes.
//   - Without a token (the bare-page form): sends a confirmation email
//     with a signed link, but ONLY if the address is on the outreach
//     list — otherwise the same generic reply with no send (no
//     enumeration, no using Rankall to mail arbitrary addresses).
//     If the send fails, the page still shows the generic reply PLUS
//     the fallback (link in any email / hello@rankall.io), so the
//     user is never stranded on a lie.

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DB_LIMIT = 10;
const DB_WINDOW_MS = 60 * 60 * 1000; // per IP per hour

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST to unsubscribe.' },
    { status: 405 },
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Honeypot: bots that fill the hidden field get a silent fake success.
  if (isHoneypotTripped(body)) {
    return NextResponse.json({ success: true });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const allowed = await allowByDbLimit(admin, 'unsubscribe', clientIp(req.headers), DB_LIMIT, DB_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // Token path: the signed link in an email, confirmed by an explicit submit.
  if (token) {
    if (!verifyUnsubscribeToken(email, token)) {
      return NextResponse.json({ error: 'This unsubscribe link is expired or invalid. Please use the most recent email, or contact us.' }, { status: 400 });
    }
    await addToDoNotContact(email, 'Unsubscribed via email link', 'unsubscribe');
    return NextResponse.json({ success: true });
  }

  // Tokenless path: send a confirmation link — only to addresses on the
  // outreach list. Same generic reply either way (no enumeration).
  const { data } = await admin
    .from('outreach_targets')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  if (data) {
    const confirmToken = generateUnsubscribeToken(email);
    if (confirmToken) {
      const link = `${req.nextUrl.origin}/unsubscribe?email=${encodeURIComponent(email)}&token=${confirmToken}`;
      const sent = await sendEmail({
        to: email,
        subject: 'Confirm your unsubscribe from Rankall',
        html: `<p>Click the link below to stop receiving marketing emails from Rankall.</p><p><a href="${link}">Unsubscribe me</a></p><p>Transactional emails — scan results, receipts, and security notices — will continue.</p><p>If you did not request this, ignore this email.</p>`,
      });
      if (!sent) console.error('[unsubscribe] confirmation email failed for', email);
    }
  }
  return NextResponse.json({ success: true, checkInbox: true });
}
