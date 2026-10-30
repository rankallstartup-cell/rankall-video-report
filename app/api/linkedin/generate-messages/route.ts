import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Generates the 3 manual LinkedIn messages (connection, post-connect, follow-up)
// via Haiku. The human copies + pastes them — no LinkedIn API, no automation.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function fallbackMessages(a: { businessName: string; contactName: string; industry: string; city: string; score: number; reportUrl: string; videoUrl: string }) {
  const name = a.contactName || 'there';
  const conn = `Hi ${name}, I ran an AI visibility scan on ${a.businessName} and found something worth a look — your business is scoring ${a.score}/100 across the major AI platforms. Mind if I share what I found? It's a quick read.`.slice(0, 300);
  const f1 = `Thanks for connecting, ${name}! I mentioned scanning ${a.businessName}. Here's what I found:\n\n- AI visibility score: ${a.score}/100\n- A competitor is being recommended ahead of you on several of the 12 AI platforms\n- That gap costs real customers every month\n\nYour full report: ${a.reportUrl}\n1-minute audio walkthrough: ${a.videoUrl}\n\nHappy to jump on a quick call if useful — no pressure either way.`;
  const f2 = `${name}, just circling back. Your AI visibility report is still here: ${a.reportUrl}\n\nQuick context: when someone asks ChatGPT for ${a.industry || 'a business like yours'} in ${a.city || 'your area'}, your competitor is being recommended — you're not. The first fix takes about 20 minutes and is free. Worth a look?`;
  return { connection_message: conn, followup_message_1: f1, followup_message_2: f2 };
}

export async function POST(req: NextRequest) {
  try {
    // b01t: the old code had no auth and updated linkedin_queue by queueId
    // alone — anyone could inject messages into another user's queue (and
    // burn Anthropic cost). Require a session; scope the write to the
    // caller's own rows.
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const body = await req.json();
    const { businessName = '', contactName = '', industry = '', city = '', score = 0, reportUrl = 'https://rankall.io', videoUrl = 'https://rankall.io', queueId } = body;
    if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 });

    const args = { businessName, contactName, industry, city, score, reportUrl, videoUrl };
    let messages = fallbackMessages(args);

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 900,
            messages: [{
              role: 'user',
              content: `Write 3 LinkedIn outreach messages for a real human to send (copy-paste, no automation). Be personal and specific, never sound like a bot, never use spam language. Use this data:
Contact: ${contactName || 'the owner'}
Business: ${businessName}
Industry: ${industry || 'local business'}
City: ${city || 'their area'}
AI visibility score: ${score}/100
Report URL: ${reportUrl}
Audio walkthrough URL: ${videoUrl}

Return STRICT JSON only (no markdown), with keys:
{"connection_message": "...", "followup_message_1": "...", "followup_message_2": "..."}

Rules:
- connection_message: MUST be under 300 characters (LinkedIn limit). Personal, mentions a specific finding from the scan. Do NOT mention Rankall by name or automation.
- followup_message_1: sent after they connect. Include the score, the competitor gap, the report URL and the audio walkthrough URL. Short paragraphs, mobile-friendly, low-pressure.
- followup_message_2: gentle follow-up if no reply. Mentions that when someone asks ChatGPT for ${industry || 'their service'} in ${city || 'their area'}, the competitor is recommended and they are not; the first fix is free and ~20 minutes. Include the report URL.`,
            }],
          }),
        });
        const data = await res.json();
        const text = data?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (parsed.connection_message && parsed.followup_message_1 && parsed.followup_message_2) {
          messages = {
            connection_message: String(parsed.connection_message).slice(0, 300),
            followup_message_1: String(parsed.followup_message_1),
            followup_message_2: String(parsed.followup_message_2),
          };
        }
      } catch { /* fall back to templated messages */ }
    }

    // Persist onto the queue row if an id was provided (best-effort).
    if (queueId) {
      try {
        await admin().from('linkedin_queue').update({ ...messages, updated_at: new Date().toISOString() }).eq('id', queueId).eq('user_id', user.id);
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ...messages });
  } catch (err) {
    return NextResponse.json({ error: 'generation_failed', message: String(err) }, { status: 500 });
  }
}
