// lib/scanInfoAccess.ts — access tiers for /api/scan-info (pure).
export type ScanInfoAccess = 'full' | 'public' | 'none';

export function scanInfoAccess(args: { ownerOrAdmin: boolean; agencyLinked: boolean; publicShare: boolean }): ScanInfoAccess {
  if (args.ownerOrAdmin || args.agencyLinked) return 'full';
  return args.publicShare ? 'public' : 'none';
}

/** Public tier = what the public share card shows (name, score, place,
 *  date). The competitor name stays with the owner. */
export function scanInfoPayload(row: Record<string, unknown>, access: Exclude<ScanInfoAccess, 'none'>): Record<string, unknown> {
  const base = {
    business_name: row.business_name ?? null,
    score: row.score ?? null,
    location: row.location ?? null,
    country_code: row.country_code ?? null,
    created_at: row.created_at ?? null,
  };
  if (access === 'public') return base;
  return { ...base, competitor_name: row.competitor_name ?? null };
}
