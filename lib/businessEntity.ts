import { createClient } from '@supabase/supabase-js';

// Service-role client — this layer writes canonical business rows and is only
// ever called server-side (scan route, crons). Never import into a client bundle.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export function generateBusinessSlug(name: string, city: string, state?: string): string {
  return [name, city, state]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 100);
}

export interface FindOrCreateBusinessParams {
  canonicalName: string;
  placeId?: string;
  industry?: string;
  category?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  website?: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  entityType?: string;
}

// Resolve a scan to a canonical business row: match on place_id (stable), then
// name+city, else create. Returns the business id, or null on failure (callers
// treat business linkage as best-effort so a failure never breaks a scan).
export async function findOrCreateBusiness(params: FindOrCreateBusinessParams): Promise<string | null> {
  try {
    // 1. Match on the stable Google identifier first.
    if (params.placeId) {
      const { data: existing } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .eq('place_id', params.placeId)
        .maybeSingle();
      if (existing) return existing.id;
    }

    // 2. Fall back to name + city (best-effort dedup before place_id exists).
    if (params.canonicalName && params.city) {
      const { data: existing } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .ilike('canonical_name', params.canonicalName)
        .ilike('city', params.city)
        .maybeSingle();
      if (existing) return existing.id;
    }

    // 3. Create.
    const slug = generateBusinessSlug(params.canonicalName, params.city || '', params.state);
    const baseRow = {
      canonical_name: params.canonicalName,
      place_id: params.placeId ?? null,
      entity_type: params.entityType || 'business',
      industry: params.industry ?? null,
      category: params.category ?? null,
      city: params.city ?? null,
      state: params.state ?? null,
      country_code: params.countryCode || 'US',
      website: params.website ?? null,
      phone: params.phone ?? null,
      address: params.address ?? null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      first_scanned_at: new Date().toISOString(),
      last_scanned_at: new Date().toISOString(),
    };

    const { data: newBusiness, error } = await supabaseAdmin
      .from('businesses')
      .insert({ ...baseRow, slug })
      .select('id')
      .single();

    if (error) {
      // Slug collision (unique violation) → retry with a disambiguated slug.
      if (error.code === '23505') {
        const { data: retry } = await supabaseAdmin
          .from('businesses')
          .insert({ ...baseRow, slug: `${slug}-${Date.now()}` })
          .select('id')
          .single();
        return retry?.id || null;
      }
      console.error('[businessEntity] create failed:', error.message);
      return null;
    }

    return newBusiness?.id || null;
  } catch (err) {
    console.error('[businessEntity] error:', err);
    return null;
  }
}

// Roll the latest scan's headline metrics up onto the business row so profile
// pages can render without joining every scan. Trend is relative to the prior
// score when known (±2 pt deadband), else 'flat'.
export async function updateBusinessScore(
  businessId: string,
  score: number,
  scanId: string,
  platformsCount: number,
  previousScore?: number,
): Promise<void> {
  const trend = previousScore === undefined
    ? 'flat'
    : score > previousScore + 2
      ? 'up'
      : score < previousScore - 2
        ? 'down'
        : 'flat';

  await supabaseAdmin
    .from('businesses')
    .update({
      latest_score: score,
      latest_scan_id: scanId,
      score_trend: trend,
      platforms_count: platformsCount,
      last_scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', businessId);
}
