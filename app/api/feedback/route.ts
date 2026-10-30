import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/feedback
 *
 * Sends user feedback (e.g. a feature request from the Settings cancel
 * flow) to the team by email. The old cancel-flow "Submit feedback" button
 * just closed the modal and DISCARDED the text the user typed — this route
 * exists so that button actually delivers the feedback. Returns 502 when
 * the email cannot be sent so the UI shows an error instead of claiming
 * the feedback was submitted.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const type = typeof body.type === 'string' ? body.type : 'feedback';
    if (!text) return NextResponse.json({ error: 'Feedback text is required' }, { status: 400 });

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sent = await sendEmail({
      to: 'hello@rankall.io',
      subject: `Rankall feedback: ${type} from ${user.email ?? 'a user'}`,
      html: `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#0A0A14;">
<p><strong>Type:</strong> ${esc(type)}</p>
<p><strong>User:</strong> ${esc(user.email ?? '')} (${esc(user.id)})</p>
<p><strong>Message:</strong></p>
<p style="white-space:pre-wrap;">${esc(text)}</p>
</body></html>`,
    });
    if (!sent) {
      return NextResponse.json({ error: 'Could not send feedback. Please try again.' }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Feedback route error:', e);
    return NextResponse.json({ error: 'Could not send feedback. Please try again.' }, { status: 500 });
  }
}
