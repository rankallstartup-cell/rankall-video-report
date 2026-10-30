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

const POST_TYPES: Record<number, { type: string; prompt: string }> = {
  1: {
    type: 'data_insight',
    prompt: 'Write a LinkedIn post sharing a surprising data insight about AI visibility for local businesses. Use specific numbers and statistics. End with a thought-provoking question.',
  },
  2: {
    type: 'case_study',
    prompt: 'Write a LinkedIn case study post about a local business that improved their AI visibility score. Include before/after numbers. Make it narrative and inspiring.',
  },
  3: {
    type: 'industry_insight',
    prompt: 'Write a LinkedIn post about a trend in AI search and how it affects local businesses. Be forward-thinking and authoritative.',
  },
  4: {
    type: 'tip',
    prompt: 'Write a LinkedIn post sharing one actionable tip for improving AI visibility (ChatGPT, Gemini, Perplexity). Make it immediately useful and easy to implement.',
  },
  5: {
    type: 'engagement_question',
    prompt: 'Write a LinkedIn post asking an engaging question about how business owners use AI or how they think about AI search visibility. Encourage comments.',
  },
};

// vercel.json schedules this route; Vercel Cron sends GET (with the
// CRON_SECRET bearer), so a POST-only export 405'd every scheduled run.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!isInternalAutomationRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Day of week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  const dayOfWeek = new Date().getDay(); // 0=Sun...6=Sat
  const postConfig = POST_TYPES[dayOfWeek] ?? POST_TYPES[1];

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
        content: `You are Nandish, founder of Rankall.io — a tool that scans local businesses across 12 AI platforms (ChatGPT, Gemini, Perplexity, etc.) to show their AI visibility score.

${postConfig.prompt}

Write from first person perspective. Keep it under 1300 characters. No hashtag spam — max 3 relevant hashtags. Make it authentic and value-driven. Return only the post text.`,
      }],
    }),
  });

  const anthropicData = await anthropicRes.json();
  const content: string = anthropicData.content?.[0]?.text ?? '';

  const scheduledFor = new Date().toISOString().split('T')[0];

  const sb = getSupabase();
  await sb.from('linkedin_posts').insert({
    post_type: postConfig.type,
    content,
    scheduled_for: scheduledFor,
    posted: false,
    generated_at: new Date().toISOString(),
  });

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#content-calendar',
        text: `*New LinkedIn Post* (${postConfig.type}) for ${scheduledFor}\n\n${content}`,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ content, post_type: postConfig.type, scheduled_for: scheduledFor });
}
