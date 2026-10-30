import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Strip markdown / TTS-unfriendly artifacts so ElevenLabs reads clean prose.
function stripMarkdown(text: string): string {
  return (text || '')
    // [0:00-0:20] style timestamps
    .replace(/\[\s*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s*\]/g, '')
    // any remaining [bracketed] content
    .replace(/\[[\s\S]*?\]/g, '')
    // bold **text** and __text__
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/__([\s\S]*?)__/g, '$1')
    // italics *text* and _text_
    .replace(/\*([\s\S]*?)\*/g, '$1')
    .replace(/_([\s\S]*?)_/g, '$1')
    // headings (#, ##, ...) at line start
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    // bullet markers -, •, * at line start
    .replace(/^\s*[-•*]\s+/gm, '')
    // section labels like "Hook:", "CTA:", "The fix:" at line start
    .replace(/^\s*(hook|the reveal|reveal|the fix|fix|cta|call to action|intro|outro|script)\s*:\s*/gim, '')
    // stray markdown chars
    .replace(/[#>`]/g, '')
    // collapse whitespace
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  // Fails closed when CRON_SECRET is unset ("Bearer undefined" used to pass).
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    business_name, owner_name, city, industry,
    score, competitor, competitor_score, revenue_leak,
    scan_id, country_code, kp_missing
  } = await req.json();

  const symbol = country_code === 'GB' ? '£' : country_code === 'AU' ? 'A$' : country_code === 'IN' ? '₹' : '$';

  const ownerName = owner_name || 'there';
  const businessName = business_name || 'your business';
  const cityName = city || 'your area';
  const industryName = industry || 'business';
  const competitorName = competitor || 'a competitor';

  // ax6u: every number in this email is presented as measured. Missing
  // scores/revenue used to print as "undefined/100" or became "0 of 11
  // platforms"; platform counts were derived from the score (score/100 × 11),
  // which is not a platform count. Require real numbers, never derive them.
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!isNum(score) || !isNum(competitor_score) || !isNum(revenue_leak)) {
    return NextResponse.json({ error: 'score, competitor_score and revenue_leak must be measured numbers' }, { status: 422 });
  }

  const fix1Title = kp_missing
    ? 'claiming your Google Knowledge Panel'
    : 'Google Business Profile optimization';
  const fix1Desc = kp_missing
    ? 'Right now you have no Google Knowledge Panel, which is the single biggest reason AI platforms skip over you. Claiming it tells them you are a real, verified business.'
    : 'It means filling in your Google Business Profile completely, with the right categories, services and hours, so AI platforms see you as the obvious answer.';

  // Generate script via Claude Haiku — plain TTS-safe prose, no markdown.
  const scriptRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Write a personalized 1-minute spoken audio script (about 150 to 170 words) for ${ownerName}, the owner of ${businessName}, a ${industryName} in ${cityName}.

This will be read aloud by a text-to-speech voice, so write PLAIN PROSE ONLY. Absolutely NO markdown, NO asterisks, NO headings, NO section labels, NO timestamps, NO bullet points, NO stage directions. Just the words to be spoken, in flowing sentences.

Use exactly these real facts:
- Owner: ${ownerName}
- Business: ${businessName}
- City: ${cityName}
- Industry: ${industryName}
- Top competitor being recommended instead: ${competitorName}
- ${businessName} AI visibility score: ${score} out of 100
- ${competitorName} AI visibility score: ${competitor_score} out of 100
- Revenue gap: approximately ${symbol}${revenue_leak} every month
- Fix number one: ${fix1Title}. ${fix1Desc}

Follow this structure closely, in natural spoken language:
Start: "${ownerName}, I scanned ${businessName} this morning." Then explain that when people search for the best ${industryName} in ${cityName} on ChatGPT, Gemini and 9 other AI platforms, ${competitorName} is being recommended. State that ${businessName} scores ${score} out of 100 while ${competitorName} scores ${competitor_score} out of 100. Say that gap is estimated to cost approximately ${symbol}${revenue_leak} every month. Then the good news: fix number one is free and takes 20 minutes, and it is ${fix1Title} — briefly describe it. Do not promise or quote a specific score increase. End with: "See your full report at rankall.io."

Return only the spoken script text.`
      }]
    }),
  });

  const scriptData = await scriptRes.json();
  const rawScript: string = scriptData.content?.[0]?.text ?? '';
  const script = stripMarkdown(rawScript);

  // Generate audio via ElevenLabs if configured
  let audioUrl: string | null = null;
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
    const audioRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (audioRes.ok) {
      const audioBuffer = await audioRes.arrayBuffer();
      // Store in Supabase Storage via REST
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        // Ensure the bucket exists (idempotent).
        await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: 'outreach-videos', name: 'outreach-videos', public: true }),
        }).catch(() => {});

        const storageRes = await fetch(
          `${supabaseUrl}/storage/v1/object/outreach-videos/${scan_id}/audio.mp3`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
              'x-upsert': 'true',
              'Content-Type': 'audio/mpeg',
            },
            body: audioBuffer,
          }
        );
        if (storageRes.ok) {
          audioUrl = `${supabaseUrl}/storage/v1/object/public/outreach-videos/${scan_id}/audio.mp3`;
        }
      }
    }
  }

  const videoPageUrl = `https://rankall.io/video/${scan_id}`;

  const subjectLines = [
    `AI assistants are recommending ${competitorName} in ${cityName}`,
    `I scanned ${businessName} — your AI score is ${score}/100`,
    `${competitorName} is getting your customers. Here's proof.`,
  ];
  const subject = subjectLines[Math.floor(Math.random() * subjectLines.length)];

  // Rich audio-player thumbnail (email-safe, table-based inline styles).
  const thumbnail = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;background:#0f0f23;border-radius:12px;overflow:hidden">
    <tr>
      <td style="height:338px;padding:24px;background:#0f0f23;border-radius:12px;vertical-align:top">
        <a href="${videoPageUrl}" style="text-decoration:none;color:#ffffff;display:block;height:290px;position:relative">
          <div style="font-size:16px;font-weight:700;color:#a78bfa">${businessName}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:48px;border-collapse:collapse">
            <tr>
              <td width="40%" align="center" style="vertical-align:middle">
                <div style="font-size:13px;color:#9ca3af">You</div>
                <div style="font-size:56px;font-weight:800;color:#dc2626;line-height:1">${score}</div>
              </td>
              <td width="20%" align="center" style="vertical-align:middle;font-size:20px;font-weight:800;color:#6b7280">VS</td>
              <td width="40%" align="center" style="vertical-align:middle">
                <div style="font-size:13px;color:#9ca3af">${competitorName}</div>
                <div style="font-size:56px;font-weight:800;color:#10b981;line-height:1">${competitor_score}</div>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:40px;border-collapse:collapse">
            <tr>
              <td align="center" style="vertical-align:bottom">
                <span style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:15px;font-weight:700;padding:12px 24px;border-radius:10px">▶ Listen to Your 1-Minute Audio Walkthrough</span>
              </td>
            </tr>
          </table>
          <div style="text-align:right;font-size:12px;color:#6b7280;margin-top:18px">rankall.io</div>
        </a>
      </td>
    </tr>
  </table>`;

  const emailHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <p>Hi ${ownerName},</p>
  <p>I scanned <strong>${businessName}</strong> across 12 AI platforms (ChatGPT, Gemini, Perplexity, and more).</p>
  ${thumbnail}
  <p style="margin-top:16px">Your AI score: <strong style="color:#dc2626">${score}/100</strong><br>
  ${competitorName}: <strong style="color:#059669">${competitor_score}/100</strong></p>
  <p>We estimate that gap costs you roughly <strong>${symbol}${revenue_leak}/month</strong> in missed AI referrals.</p>
  <p>Fix #1 is completely free — takes 20 minutes.</p>
  <p>— Rankall.io</p>
</div>`;

  const whatsappMessage = `Hi ${ownerName}! I scanned ${businessName} — your AI score is ${score}/100 while ${competitorName} scores ${competitor_score}/100. That's an estimated ~${symbol}${revenue_leak}/mo in missed referrals. Free 60-sec audio walkthrough: ${videoPageUrl}`;

  return NextResponse.json({
    scan_id,
    video_page_url: videoPageUrl,
    audio_url: audioUrl,
    email_subject: subject,
    email_html: emailHtml,
    whatsapp_message: whatsappMessage,
    script,
  });
}
