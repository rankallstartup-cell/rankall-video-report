import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/planConfig';
import { isCronRequest } from '@/lib/apiAuth';
import { buildVideoScript } from '@/lib/outreachCopy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


// POST /api/generate-video-email
// Body: { scan_id, business_name, score, competitor_name, top_fix, recipient_name, voice_id? }
// Returns: { success, script, audio_url, video_page_url }
export async function POST(req: NextRequest) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
  }

  // Fails closed when CRON_SECRET is unset (the old string compare accepted
  // the literal "Bearer undefined").
  const cronOk = isCronRequest(req);

  const body = await req.json();
  const { scan_id, business_name, score, competitor_name, top_fix, recipient_name, voice_id } = body;

  // ax77: the old check trusted `body.caller_email` — client-supplied text.
  // Anyone could POST caller_email 'nandish@rankall.io' and pass as admin
  // on this paid (ElevenLabs) endpoint. Verify the caller's real session
  // instead; the CRON_SECRET path stays for server-to-server callers.
  // (No in-code caller passes caller_email — the only caller of the
  // sibling /api/outreach/generate-video-email route is the Apollo
  // webhook, which uses CRON_SECRET.)
  if (!cronOk) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!isAdminUser(user?.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!scan_id || !business_name || score === undefined) {
    return NextResponse.json({ error: 'scan_id, business_name, and score are required' }, { status: 400 });
  }

  // Item 4: only measured facts — the old script derived platform counts
  // from the score, claimed "including ChatGPT" and promised "3 to 5 more
  // AI platforms within 6 weeks". Platform counts are printed only when the
  // caller passes the scan's real mentioned_count.
  const script = buildVideoScript({
    businessName: String(business_name),
    recipientName: recipient_name,
    score,
    mentionedCount: body.mentioned_count,
    totalPlatforms: body.total_platforms ?? (typeof body.mentioned_count === 'number' ? 12 : undefined),
    competitorName: competitor_name,
    topFix: top_fix,
  });

  try {
    const voiceId = voice_id || process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error('ElevenLabs error:', err);
      return NextResponse.json({ error: 'TTS generation failed', detail: err }, { status: 500 });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;

    const videoPageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/video/${scan_id}`;

    return NextResponse.json({
      success: true,
      script,
      audio_data_url: audioDataUrl,
      video_page_url: videoPageUrl,
      scan_id,
    });
  } catch (e) {
    console.error('generate-video-email error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
