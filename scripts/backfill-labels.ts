/**
 * Phase 1 backfill runner (ticket b7x6, labeling program umbrella b7x4).
 *
 * Labels EXISTING scans + answers. All labeling logic lives in
 * lib/backfillLabels.ts, which drives PR #58's autoLabelScan — there is
 * exactly one labeling implementation.
 *
 * Run with (tsx resolves the @/ alias via tsconfig.json):
 *   npx tsx scripts/backfill-labels.ts --dry-run
 *   npx tsx scripts/backfill-labels.ts --dry-run --skip-trust
 *   npx tsx scripts/backfill-labels.ts --limit 50
 *   npx tsx scripts/backfill-labels.ts --scan-id <uuid>
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL   Supabase project URL (staging or prod)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key for THAT project (bypasses RLS)
 *
 * SAFETY — read before running:
 * - STAGING FIRST. Always dry-run, then run on staging, then verify counts
 *   before even thinking about prod.
 * - PROD RUN IS HELD: the production backfill runs ONLY with Nandish's
 *   explicit approval, against prod env vars, after the staging run is
 *   verified. Never point this at prod "just to check".
 * - IDEMPOTENT: re-running is safe (only blanks are filled). A second run
 *   after a successful first run reports 0 filled.
 * - Trust backfill: recomputed via detectTrustSignals from STORED scan
 *   inputs (same pattern as the weekly rescan). The website HTML is
 *   fetched live, so backfilled trust_signals reflect the website as of
 *   the backfill run date, not the original scan date. Use --skip-trust
 *   to label + fill sentiment only.
 * - Exit code: 0 = completed with no row failures; 1 = completed with
 *   one or more per-scan failures (see the printed failure list).
 */
import { getSupabaseAdmin } from '../lib/supabase';
import { backfillLabels, type StoredScanRow } from '../lib/backfillLabels';
import { detectTrustSignals } from '../lib/trustServer';
import { resolveRescanWebsite } from '../lib/rescanTrust';
import { getTrustedStoredGoogle } from '../lib/enrichment';
import { createClient } from '@supabase/supabase-js';

/**
 * Sandbox-only auth shim. In this environment the staging credential is an
 * `hsurr:` surrogate that the egress proxy swaps for the real key — but it
 * only swaps the `apikey` header (the connector's declared placement).
 * supabase-js also sends an `Authorization: Bearer <surrogate>` header,
 * which arrives unswapped and makes PostgREST reject the request
 * ("Expected 3 parts in JWT"). Dropping `Authorization` makes the sandbox
 * run behave exactly like the Python connector (apikey only). Real keys
 * (prod runs, local dev) are NOT surrogates and keep the stock client.
 */
function adminClientFor(url: string, key: string) {
  if (!key.startsWith('hsurr:')) return getSupabaseAdmin();
  const surrogateSafeFetch = (input: any, init?: any): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.delete('authorization');
    return fetch(input, { ...init, headers });
  };
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: surrogateSafeFetch },
  });
}

function parseArgs(argv: string[]): {
  dryRun: boolean;
  skipTrust: boolean;
  limit?: number;
  scanId?: string;
} {
  const out: { dryRun: boolean; skipTrust: boolean; limit?: number; scanId?: string } = {
    dryRun: false,
    skipTrust: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-trust') out.skipTrust = true;
    else if (a === '--limit') {
      const n = Number(argv[i + 1]);
      if (!Number.isFinite(n) || n < 0) {
        console.error('--limit needs a non-negative number');
        process.exit(2);
      }
      out.limit = n;
      i += 1;
    } else if (a === '--scan-id') {
      out.scanId = argv[i + 1];
      i += 1;
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }
  const host = new URL(supabaseUrl).hostname;
  const isProd = host.includes('lphrlyhhahlaqxhsmmpv');
  console.log(`Target: ${host}${isProd ? '  ← PRODUCTION — prod runs need Nandish approval' : '  (staging)'}`);
  if (args.dryRun) console.log('Mode: DRY RUN — reads only, nothing will be written.');
  else console.log('Mode: LIVE RUN — blanks will be filled.');

  const admin = adminClientFor(supabaseUrl, serviceRoleKey);

  const recomputeTrust = async (scan: StoredScanRow): Promise<unknown | null> => {
    const enrichment = (scan.enrichment ?? {}) as Record<string, any>;
    const trustedGoogle = getTrustedStoredGoogle(
      typeof scan.input === 'string' ? scan.input : '',
      typeof scan.location === 'string' ? scan.location : '',
      enrichment.google ?? null,
    );
    const site = resolveRescanWebsite(scan as { website_url?: unknown }, trustedGoogle?.website);
    const { data: platformRows, error } = await admin
      .from('rankall_platform_results')
      .select('platform, response_text, mentioned')
      .eq('scan_id', scan.id);
    if (error) throw error;
    const rows = (platformRows ?? []) as Array<{ platform: string; response_text: string | null; mentioned: boolean | null }>;
    return detectTrustSignals(
      {
        businessInput: typeof scan.input === 'string' ? scan.input : '',
        websiteUrl: site.websiteUrl,
        websiteVerified: site.websiteVerified,
        scanResults: rows.map((r) => ({
          platform: r.platform,
          response: r.response_text,
          mentioned: r.mentioned === true,
        })),
        citationSources: Array.isArray(scan.citation_sources) ? (scan.citation_sources as string[]) : [],
        industry: typeof scan.industry === 'string' ? scan.industry : undefined,
        enrichment: {
          google: trustedGoogle ?? null,
          serpData: enrichment.serpData ?? null,
          reddit: enrichment.reddit ?? null,
        },
        competitorNames: typeof scan.competitor_name === 'string' && scan.competitor_name ? [scan.competitor_name] : [],
      },
      typeof scan.country_code === 'string' && scan.country_code ? scan.country_code : 'US',
    );
  };

  const result = await backfillLabels({
    dryRun: args.dryRun,
    skipTrust: args.skipTrust,
    limit: args.limit,
    scanIds: args.scanId ? [args.scanId] : undefined,
    recomputeTrust: args.skipTrust ? undefined : recomputeTrust,
    admin,
    onProgress: (done, total, scanId) => {
      if (done % 50 === 0 || done === total) console.log(`  … ${done}/${total} scans (last: ${scanId})`);
    },
  });

  console.log('— Backfill summary —');
  console.log(`  dryRun:           ${result.dryRun}`);
  console.log(`  scans considered: ${result.scansConsidered}`);
  console.log(`  scans processed:  ${result.scansProcessed}`);
  console.log(`  labels created:   ${result.labelsCreated}`);
  console.log(`  sentiments filled:${result.sentimentsUpdated}`);
  console.log(`  trust backfilled: ${result.trustBackfilled}`);
  console.log(`  failures:         ${result.failures.length}`);
  for (const f of result.failures) {
    console.log(`    - ${f.scanId} [${f.step}] ${f.message}`);
  }
  if (result.failures.length > 0) {
    console.log('Completed WITH failures — see list above. Re-run is safe (only blanks are filled).');
    return 1;
  }
  console.log('Completed with no row failures.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Backfill crashed:', err);
    process.exit(1);
  });
