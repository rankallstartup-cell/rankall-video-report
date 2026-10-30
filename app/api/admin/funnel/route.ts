import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUser } from '@/lib/apiAuth';
import { isAdminUser } from '@/lib/planConfig';

// CONV-00: admin-only funnel conversion dashboard API.
// Aggregates funnel_events into stage-by-stage counts and conversion %
// per traffic source. Admin only.

const STAGES = [
  'scan_started',
  'scan_completed',
  'report_viewed',
  'report_shared',
  'profile_claimed',
  'trial_started',
  'paid',
] as const;

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: 'Access denied — admin only.' }, { status: 403 });
  }

  const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('days') || '30', 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await db
    .from('funnel_events')
    .select('event_name, user_id, email, scan_id, source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(20000);

  if (error) {
    // Table may not exist yet (migration not run) — return empty, not 500.
    return NextResponse.json({ days, stages: [], conversions: [], note: 'no data yet' });
  }

  const rows = (data ?? []) as Array<{
    event_name: string; user_id: string | null; email: string | null;
    scan_id: string | null; source: string; created_at: string;
  }>;

  // Distinct identity per stage per source (user_id > email > scan_id).
  const ident = (r: (typeof rows)[number]) =>
    r.user_id || (r.email ? `email:${r.email}` : null) || (r.scan_id ? `scan:${r.scan_id}` : null);

  const byStageSource = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    if (!STAGES.includes(r.event_name as (typeof STAGES)[number])) continue;
    const id = ident(r);
    if (!id) continue;
    const src = r.source || 'unknown';
    if (!byStageSource.has(r.event_name)) byStageSource.set(r.event_name, new Map());
    const m = byStageSource.get(r.event_name)!;
    if (!m.has(src)) m.set(src, new Set());
    m.get(src)!.add(id);
  }

  const sources = ['cold', 'influencer', 'agency', 'outbound', 'unknown'];
  const stages = STAGES.map((stage) => {
    const m = byStageSource.get(stage) ?? new Map<string, Set<string>>();
    const by_source: Record<string, number> = {};
    let total = 0;
    for (const s of sources) {
      const n = m.get(s)?.size ?? 0;
      by_source[s] = n;
      total += n;
    }
    return { event: stage, total, by_source };
  });

  const conversions = [];
  for (let i = 1; i < stages.length; i++) {
    const from = stages[i - 1];
    const to = stages[i];
    const by_source: Record<string, number | null> = {};
    for (const s of sources) {
      const f = from.by_source[s] ?? 0;
      const t = to.by_source[s] ?? 0;
      by_source[s] = f > 0 ? Math.round((t / f) * 1000) / 10 : null;
    }
    conversions.push({
      from: from.event,
      to: to.event,
      total_pct: from.total > 0 ? Math.round((to.total / from.total) * 1000) / 10 : null,
      by_source,
    });
  }

  // CONV-01: viral coefficient — shares per 100 report views, overall + per source.
  const viewed = stages.find((s) => s.event === 'report_viewed');
  const shared = stages.find((s) => s.event === 'report_shared');
  const viralBySource: Record<string, number | null> = {};
  for (const s of sources) {
    const v = viewed?.by_source[s] ?? 0;
    const sh = shared?.by_source[s] ?? 0;
    viralBySource[s] = v > 0 ? Math.round((sh / v) * 1000) / 10 : null;
  }
  const viral = {
    shares: shared?.total ?? 0,
    viewers: viewed?.total ?? 0,
    coefficient: viewed && viewed.total > 0
      ? Math.round(((shared?.total ?? 0) / viewed.total) * 1000) / 10
      : null,
    by_source: viralBySource,
  };

  return NextResponse.json({ days, total_events: rows.length, stages, conversions, viral });
}
