import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/apiAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Maps days-since-signup to triggerEvent name
const SEQUENCE: Array<{ days: number; event: string }> = [
  { days: 1,  event: 'day1_followup' },
  { days: 2,  event: 'day2'          },
  { days: 3,  event: 'day3_nudge'    },
  { days: 7,  event: 'day7_rescan'   },
  { days: 14, event: 'day14_urgency' },
  { days: 30, event: 'day30_report'  },
  { days: 60, event: 'day60'         },
];

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron call
  // Fail closed: with CRON_SECRET unset the old compare accepted the
  // literal header "Bearer undefined".
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';
  const results: Array<{ userId: string; event: string; status: string }> = [];

  for (const { days, event } of SEQUENCE) {
    // Find users whose account is exactly `days` days old (±12h window)
    const windowStart = new Date(Date.now() - (days * 24 + 12) * 3600 * 1000).toISOString();
    const windowEnd   = new Date(Date.now() - (days * 24 - 12) * 3600 * 1000).toISOString();

    const { data: users } = await supabase
      .from('rankall_users')
      .select('id, email, created_at')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd);

    if (!users?.length) continue;

    for (const user of users) {
      // Fetch their latest scan
      const { data: scan } = await supabase
        .from('rankall_scans')
        .select('id, input, user_business_name, overall_score, trust_signals, competitor_name, industry')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Fetch score history for day30
      let scoreHistory: Array<{ overall_score: number; created_at: string }> = [];
      if (event === 'day30_report') {
        // ax9c: score_history has no overall_score/created_at columns — its
        // real columns are score / recorded_at. Map to the shape the
        // day-30 email expects.
        const { data: hist } = await supabase
          .from('score_history')
          .select('score, recorded_at')
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: true })
          .limit(30);
        scoreHistory = (hist ?? []).map(r => ({
          overall_score: (r as { score?: number | null }).score ?? 0,
          created_at: (r as { recorded_at?: string | null }).recorded_at ?? '',
        }));
      }

      // Count fixes
      let fixesApplied = 0;
      let fixesPending = 0;
      if (scan?.id) {
        const { data: fixes } = await supabase
          .from('fix_predictions')
          .select('status')
          .eq('scan_id', scan.id);
        fixesApplied = fixes?.filter(f => f.status === 'applied').length ?? 0;
        fixesPending = fixes?.filter(f => f.status !== 'applied').length ?? 0;
      }

      const trustScore = (scan?.trust_signals as any)?.overall;
      const businessName = scan?.user_business_name || scan?.input?.split(' in ')[0] || '';

      const res = await fetch(`${baseUrl}/api/email-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          businessName,
          scanId: scan?.id,
          currentScore: typeof scan?.overall_score === 'number' ? scan.overall_score : undefined,
          trustScore: typeof trustScore === 'number' ? trustScore : undefined,
          competitorName: scan?.competitor_name,
          industry: scan?.industry,
          lastQuery: scan?.input,
          scoreHistory,
          fixesApplied,
          fixesPending,
          triggerEvent: event,
        }),
      });

      const data = await res.json();
      results.push({
        userId: user.id,
        event,
        status: data.skipped ? 'skipped' : data.success ? 'sent' : 'error',
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
