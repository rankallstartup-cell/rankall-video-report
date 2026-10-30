import { NextRequest, NextResponse } from 'next/server';
import { isInternalAutomationRequest } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
  if (!isInternalAutomationRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { query, publication, deadline, contact_email } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

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
        content: `You are Nandish, Founder of Rankall.io — a platform that scans local businesses across 12 AI platforms (ChatGPT, Gemini, Perplexity, Google AI, Copilot, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, Meta AI) to measure and improve their AI search visibility.

Write an expert HARO (Help a Reporter Out) response to this journalist query:

Query: ${query}
Publication: ${publication || 'unknown publication'}
Deadline: ${deadline || 'ASAP'}

Guidelines:
- Respond as an expert in AI search visibility for local businesses
- Include specific data points or insights from running Rankall.io
- Keep it under 400 words
- Include a brief bio at the end: "Nandish is the founder of Rankall.io, an AI visibility platform that has scanned thousands of local businesses across 12 AI platforms."
- Make it quotable and newsworthy
- Do not be promotional — provide genuine expert insight

Return only the response text.`,
      }],
    }),
  });

  const anthropicData = await anthropicRes.json();
  const response_text: string = anthropicData.content?.[0]?.text ?? '';

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: '#press-opportunities',
        text: `*New HARO Response Generated*\n*Publication:* ${publication || 'Unknown'}\n*Deadline:* ${deadline || 'ASAP'}\n*Contact:* ${contact_email || 'N/A'}\n*Query:* ${query}\n\n*Response:*\n${response_text}`,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ response_text });
}
