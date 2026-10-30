import { NextRequest, NextResponse } from 'next/server';
import { isInternalAutomationRequest } from '@/lib/apiAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';


function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const FORMATS = [
  {
    name: 'reveal',
    description: (industry: string, city: string) =>
      `Reveal format: "I scanned ${industry} businesses in ${city} and the results are shocking"`,
  },
  {
    name: 'educational',
    description: (industry: string, _city: string) =>
      `Educational format: "Does ChatGPT recommend your ${industry}? Here's how to check"`,
  },
  {
    name: 'comparison',
    description: (industry: string, city: string) =>
      `Comparison format: "I compared AI visibility for ${industry} businesses in ${city}"`,
  },
  {
    name: 'transformation',
    description: (industry: string, _city: string) =>
      `Transformation format: "This ${industry} business went from low to high AI score in 60 days"`,
  },
];

// vercel.json schedules this route; Vercel Cron sends GET (with the
// CRON_SECRET bearer), so a POST-only export 405'd every scheduled run.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!isInternalAutomationRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    industry?: string;
    city?: string;
    format_override?: string;
  };

  const industry = body.industry || 'local business';
  const city = body.city || 'your city';

  // Rotating format by day of week: Mon=0, Wed=1, Fri=2, Sun=3
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayToFormat: Record<number, number> = { 1: 0, 3: 1, 5: 2, 0: 3 };
  const formatIndex = body.format_override
    ? FORMATS.findIndex(f => f.name === body.format_override)
    : (dayToFormat[dayOfWeek] ?? dayOfWeek % 4);

  const format = FORMATS[formatIndex >= 0 ? formatIndex : 0];

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Generate a TikTok script for Rankall.io about AI visibility for local businesses.

Format: ${format.description(industry, city)}

Requirements:
- Hook (first 3 seconds): Attention-grabbing opening line
- Body: Main content (20-40 seconds)
- CTA (last 5 seconds): Call to action pointing to rankall.io
- On-screen text suggestions: 3-5 text overlays to add
- Hashtags: 5-8 relevant hashtags

Return as JSON with keys: "hook", "body", "cta", "on_screen_text" (array of strings), "hashtags" (array of strings), "full_script" (complete script).

Make it engaging, data-driven, and relevant to ${industry} businesses in ${city}. Return only valid JSON.`,
      }],
    }),
  });

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let hook = '';
  let body_text = '';
  let cta = '';
  let hashtags: string[] = [];
  let full_script = '';

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    hook = parsed.hook ?? '';
    body_text = parsed.body ?? '';
    cta = parsed.cta ?? '';
    hashtags = parsed.hashtags ?? [];
    full_script = parsed.full_script ?? `${hook}\n\n${body_text}\n\n${cta}`;
  } catch {
    full_script = rawText;
    hook = rawText.split('\n')[0] ?? '';
    cta = 'Check your score free at rankall.io';
    hashtags = ['#AIMarketing', '#LocalBusiness', '#ChatGPT', '#SEO', '#AIVisibility'];
  }

  const sb = getSupabase();
  await sb.from('tiktok_scripts').insert({
    format: format.name,
    hook,
    body: body_text,
    cta,
    hashtags,
    industry,
    city,
    full_script,
    posted: false,
    generated_at: new Date().toISOString(),
  });

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*New TikTok Script Generated* (${format.name})\n*Hook:* ${hook}\n*CTA:* ${cta}\n*Hashtags:* ${hashtags.join(' ')}`,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ script: full_script, hook, cta, hashtags, format: format.name });
}
