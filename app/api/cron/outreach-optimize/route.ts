import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { summarizeDay1Variants } from '@/lib/outreachSequences';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: targets } = await supabase
    .from('outreach_targets')
    .select('industry, country_code, status, rankall_score, competitor_name')
    .gte('created_at', sevenDaysAgo);

  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, message: 'No data this week' });
  }

  const totalSent = targets.length;
  const totalConv = targets.filter(t => t.status === 'converted').length;
  const convRate = totalSent > 0 ? ((totalConv / totalSent) * 100).toFixed(1) : '0';

  const industryMap: Record<string, { total: number; conv: number }> = {};
  targets.forEach(t => {
    const k = t.industry ?? 'Unknown';
    if (!industryMap[k]) industryMap[k] = { total: 0, conv: 0 };
    industryMap[k].total++;
    if (t.status === 'converted') industryMap[k].conv++;
  });
  const topIndustry = Object.entries(industryMap)
    .map(([k, v]) => ({ industry: k, rate: v.total > 0 ? (v.conv / v.total) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)[0];

  // Outreach #7 — Day-1 A/B test: open/click by subject variant, from the
  // sequence rows sent this week (opens/clicks are stamped on the row by
  // /api/outreach/track). Degrades safely if the variant column doesn't
  // exist yet (migration not run): day1Variants stays null, everything
  // else reports as before.
  let day1Variants: ReturnType<typeof summarizeDay1Variants> | null = null;
  try {
    const { data: day1Rows, error: day1Error } = await supabase
      .from('outreach_sequence_log')
      .select('variant, opened_at, clicked_at')
      .eq('sequence_day', 1)
      .eq('status', 'sent')
      .gte('sent_at', sevenDaysAgo);
    if (day1Error) {
      console.warn('[outreach-optimize] Day-1 variant query failed, skipping variant breakout:', day1Error.message);
    } else {
      day1Variants = summarizeDay1Variants((day1Rows ?? []) as Array<{ variant: string | null; opened_at: string | null; clicked_at: string | null }>);
    }
  } catch (err) {
    console.warn('[outreach-optimize] Day-1 variant query threw, skipping variant breakout:', err instanceof Error ? err.message : String(err));
  }

  const variantLines = day1Variants
    ? Object.entries(day1Variants).map(([v, s]) => `Day-1 variant ${v}: sent ${s.sent} · opened ${s.opened} (${(s.openRate * 100).toFixed(1)}%) · clicked ${s.clicked} (${(s.clickRate * 100).toFixed(1)}%)`).join('\n')
    : 'Day-1 variants: n/a (migration not run yet or no Day-1 sends this week)';

  const summaryData = JSON.stringify({ totalSent, totalConv, convRate, industryMap, day1Variants }, null, 2);

  let recommendations = '';
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Based on this week's outreach data:\n${summaryData}\n\nGenerate 3 specific, actionable recommendations to improve conversion rate next week. Reference actual numbers. Be concise.`,
        }],
      }),
    });
    if (aiRes.ok) {
      const aiData = await aiRes.json() as { content: Array<{ type: string; text: string }> };
      recommendations = aiData.content?.[0]?.text ?? '';
    }
  } catch { /* non-fatal */ }

  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `📊 Weekly Outreach Intelligence\n\nSent: ${totalSent} | Converted: ${totalConv} | Rate: ${convRate}%\nBest industry: ${topIndustry?.industry ?? 'N/A'} (${topIndustry?.rate.toFixed(1) ?? 0}%)\n\nDay-1 subject A/B:\n${variantLines}\n\nHaiku recommendations:\n${recommendations}\n\nhttps://rankall.io/admin/outreach-intelligence`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, sent: totalSent, converted: totalConv, convRate, day1Variants });
}
