import { NextRequest, NextResponse } from 'next/server';
import { isInternalAutomationRequest } from '@/lib/apiAuth';
import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/planConfig';
import { parseLinkedInInput, buildLinkedInPrompt, linkedInFallbackFollowup } from '@/lib/outreachCopy';

export const dynamic = 'force-dynamic';


function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Single source of truth for admin access: the hardcoded ADMIN_EMAILS allowlist
// (via isAdminUser). No database role column grants admin — matches the rest of
// the codebase. We still resolve the user from their bearer token, then gate on
// their email.
async function isAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser(token);
  return isAdminUser(user?.email);
}

export async function POST(req: NextRequest) {
  const isCron = isInternalAutomationRequest(req);

  if (!isCron) {
    const adminCheck = await isAdmin(req);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Item 4: validate inputs — missing fields used to print as "undefined"
  // ("AI Score: undefined/100", "recommending undefined"). Missing parts are
  // omitted from the prompt and the fallback instead.
  const parsed = parseLinkedInInput(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const facts = parsed.facts;

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
        content: buildLinkedInPrompt(facts),
      }],
    }),
  });

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

  let connection_message = '';
  let followup_message = '';

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    connection_message = parsed.connection_message ?? '';
    followup_message = parsed.followup_message ?? '';
  } catch {
    connection_message = rawText.slice(0, 300);
    followup_message = linkedInFallbackFollowup(facts);
  }

  // Ensure connection message is within 300 chars
  if (connection_message.length > 300) {
    connection_message = connection_message.slice(0, 297) + '...';
  }

  const sb = getSupabase();
  await sb.from('linkedin_outreach_queue').insert({
    profile_url: facts.linkedinUrl,
    owner_name: facts.ownerName,
    business_name: facts.businessName,
    connection_message,
    followup_message,
    status: 'pending',
    scan_id: facts.scanId,
    scheduled_for: new Date().toISOString(),
  });

  return NextResponse.json({ connection_message, followup_message, queued: true });
}
