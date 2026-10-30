import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canonicalFixImpact } from '@/lib/fixIntelligence';

export const dynamic = 'force-dynamic';

let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _adminClient;
}

/**
 * GET /api/client-portal/overview
 *
 * The agency client portal's data source. The old pages queried a `scans`
 * table (columns score, query_results, platforms, fixes, top_fixes) that is
 * empty — every scan the app writes goes to `rankall_scans`, so clients saw
 * empty/red data with no error.
 *
 * The pages cannot just query `rankall_scans` from the browser: the scan
 * row belongs to the AGENCY user, so RLS would hide it from the client
 * user. This route authenticates the caller via session, resolves their
 * own `agency_clients` link (set when they accepted the agency invite),
 * and reads ONLY the scan linked to that row via the service-role client.
 * No client-supplied ids are trusted, so one client can never read
 * another client's (or another agency's) scan.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const sb = getAdminClient();

    const { data: clientRows, error: clientErr } = await sb
      .from('agency_clients')
      .select('agency_user_id, client_name, business_name, scan_id, latest_score')
      .eq('client_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });
    const clientRow = clientRows?.[0];
    if (!clientRow) {
      return NextResponse.json(
        { error: 'No client account found. Please contact your agency.' },
        { status: 404 },
      );
    }

    const { data: settingsRow } = await sb
      .from('agency_settings')
      .select('agency_name, agency_logo_url, agency_primary_color, agency_email')
      .eq('agency_user_id', clientRow.agency_user_id)
      .maybeSingle();

    let scan: { id: string; score: number | null; createdAt: string | null } | null = null;
    let platforms: Record<string, boolean> = {};
    let fixes: { title: string; detail: string; predictedImpact: number | null }[] = [];

    if (clientRow.scan_id) {
      const { data: scanRow } = await sb
        .from('rankall_scans')
        .select('id, overall_score, created_at')
        .eq('id', clientRow.scan_id)
        .maybeSingle();
      if (scanRow) {
        scan = {
          id: scanRow.id,
          score: scanRow.overall_score ?? null,
          createdAt: scanRow.created_at ?? null,
        };

        const { data: platformRows } = await sb
          .from('rankall_platform_results')
          .select('platform, mentioned')
          .eq('scan_id', clientRow.scan_id);
        for (const r of platformRows ?? []) {
          if (r.platform) platforms[r.platform] = !!r.mentioned;
        }

        const { data: fixRows } = await sb
          .from('generated_fixes')
          .select('fix_type, fix_title, generated_content, predicted_impact, created_at')
          .eq('scan_id', clientRow.scan_id)
          .order('created_at', { ascending: false })
          .limit(150);
        // Dedupe by fix_type (same collapse lib/fixes.ts applies at read
        // time) so regenerated fixes don't repeat in the portal list.
        const seen = new Set<string>();
        for (const f of fixRows ?? []) {
          if (seen.has(f.fix_type)) continue;
          seen.add(f.fix_type);
          fixes.push({
            title: f.fix_title || 'Optimisation fix',
            detail: f.generated_content || '',
            // ax81: canonical impact (metadata midpoint) — the stored
            // value is Claude's legacy guess; see lib/fixes.ts.
            predictedImpact: canonicalFixImpact(f.fix_type),
          });
        }
      }
    }

    return NextResponse.json({
      client: {
        clientName: clientRow.client_name || clientRow.business_name || '',
        latestScore: clientRow.latest_score ?? null,
      },
      agency: settingsRow ?? null,
      scan,
      platforms,
      fixes,
    });
  } catch (e) {
    console.error('Client portal overview error:', e);
    return NextResponse.json({ error: 'Failed to load your dashboard.' }, { status: 500 });
  }
}
