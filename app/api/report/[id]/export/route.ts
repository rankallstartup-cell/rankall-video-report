import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { canViewReport, isScanId } from '@/lib/reportPayload';
import { resolvePlanServer } from '@/lib/resolvePlanServer';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

async function sessionUserId(req: NextRequest): Promise<string | null> {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// INT-01: CSV export of a scan report + its fix plan.
// Paid plans only — free and trial accounts get an honest 403, never the file.
// No PII beyond what the owner already sees in their own report.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isScanId(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const viewerId = await sessionUserId(req);
  if (!viewerId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: NO_STORE });
  }

  const admin = getSupabaseAdmin();
  const { data: scanRow } = await admin
    .from('rankall_scans')
    .select('id, user_id, user_business_name, input, overall_score, industry, city, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!scanRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  const ownerId = (scanRow as { user_id?: string | null }).user_id ?? null;
  if (!canViewReport(ownerId, viewerId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  // Plan gate: paid plans only. Trialing and free get an honest message.
  const { plan, isTrialing } = await resolvePlanServer(viewerId);
  const isPaid = plan !== 'free';
  if (!isPaid || isTrialing) {
    return NextResponse.json(
      {
        error: isTrialing
          ? 'CSV export is not included during your trial. Upgrade to a paid plan to export reports.'
          : 'CSV export is a paid-plan feature. Upgrade to export your reports.',
      },
      { status: 403, headers: NO_STORE },
    );
  }

  const scan = scanRow as {
    user_business_name: string | null; input: string | null;
    overall_score: number | null; industry: string | null;
    city: string | null; created_at: string | null;
  };
  const business = scan.user_business_name || scan.input?.split(' in ')[0] || 'Your Business';

  // Per-platform results for this scan.
  const { data: platformRows } = await admin
    .from('rankall_platform_results')
    .select('platform, mentioned, sentiment, answer')
    .eq('scan_id', id);

  // Fix plan for this scan.
  const { data: fixRows } = await admin
    .from('generated_fixes')
    .select('fix_type, title, impact, status')
    .eq('scan_id', id)
    .order('created_at', { ascending: true });

  const lines: string[] = [];
  lines.push(['Report exported', 'Rankall.io'].map(csvCell).join(','));
  lines.push(['Business', business].map(csvCell).join(','));
  lines.push(['Scan date', scan.created_at ?? ''].map(csvCell).join(','));
  lines.push(['AI Visibility Score', scan.overall_score ?? ''].map(csvCell).join(','));
  lines.push(['Industry', scan.industry ?? ''].map(csvCell).join(','));
  lines.push(['City', scan.city ?? ''].map(csvCell).join(','));
  lines.push('');
  lines.push(['Platform', 'Mentioned', 'Sentiment'].map(csvCell).join(','));
  for (const r of ((platformRows as Array<Record<string, unknown>> | null) ?? [])) {
    lines.push([r.platform, r.mentioned ? 'yes' : 'no', r.sentiment ?? ''].map(csvCell).join(','));
  }
  lines.push('');
  lines.push(['Fix', 'Expected impact', 'Status'].map(csvCell).join(','));
  for (const f of ((fixRows as Array<Record<string, unknown>> | null) ?? [])) {
    lines.push([f.title ?? f.fix_type, f.impact ?? '', f.status ?? ''].map(csvCell).join(','));
  }

  const csv = lines.join('\n');
  const filename = `rankall-report-${id.slice(0, 8)}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...NO_STORE,
    },
  });
}
