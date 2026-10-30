import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabaseAdmin;
}

export interface KnowledgePanelResult {
  /**
   * Cache-validation key: normalized "entityType|name|city|country" this result
   * was computed for. The knowledge_panel_cache row is keyed by user_id alone,
   * so without this the first scan's panel leaks into every later scan for a
   * different business. Never trust a cached result whose entityKey differs.
   */
  entityKey?: string;
  exists: boolean;
  claimed: boolean;
  title: string | null;
  description: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  categories: string[];
  socialLinks: string[];
  website: string | null;
  completeness: number;
  missingFields: string[];
  entityType: 'person' | 'business' | 'unknown';
  wikiDataId: string | null;
  wikipediaUrl: string | null;
  score_contribution: number;
  cached: boolean;
  error: string | null;
}

function getEmptyResult(): KnowledgePanelResult {
  return {
    exists: false, claimed: false, title: null, description: null,
    hasPhoto: false, photoUrl: null, categories: [], socialLinks: [],
    website: null, completeness: 0,
    missingFields: [
      'No Knowledge Panel found',
      'Google has not verified this entity',
      'Create entity presence on Wikidata first',
      'Build directory citations to strengthen entity presence',
      'Get mentioned in news articles',
    ],
    entityType: 'unknown', wikiDataId: null, wikipediaUrl: null,
    score_contribution: 0, cached: false, error: null,
  };
}

function buildEntityKey(name: string, city: string, country: string, entityType: string): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return [entityType, norm(name), norm(city), norm(country)].join('|');
}

async function cacheKPResult(userId: string | undefined, entityKey: string, result: KnowledgePanelResult) {
  if (!userId) return;
  await getSupabaseAdmin().from('knowledge_panel_cache').upsert(
    { user_id: userId, result: { ...result, entityKey }, cached_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

export async function detectKnowledgePanel(
  name: string,
  industry: string,
  city: string,
  country = 'US',
  entityType: 'person' | 'business' = 'business',
  userId?: string
): Promise<KnowledgePanelResult> {
  if (!process.env.SERPAPI_KEY) {
    return { ...getEmptyResult(), error: 'SerpAPI not configured' };
  }

  // Check 7-day cache. The cache row is keyed by user_id alone, so a cached
  // result MUST be validated against this scan's entity before use — a prior
  // scan for a different business (e.g. "ATX Family Dental") would otherwise
  // be returned verbatim for this scan (e.g. "Bright Smile Dental").
  const entityKey = buildEntityKey(name, city, country, entityType);
  if (userId) {
    const { data: cached } = await getSupabaseAdmin()
      .from('knowledge_panel_cache')
      .select('result, cached_at')
      .eq('user_id', userId)
      .gte('cached_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .single();
    const cachedResult = cached?.result as (KnowledgePanelResult & { entityKey?: string }) | undefined;
    if (cachedResult && cachedResult.entityKey === entityKey) {
      return { ...cachedResult, cached: true };
    }
    // Cache miss OR cached result belongs to a different business: fall
    // through to a fresh lookup. The fresh result overwrites the row below.
  }

  const query = entityType === 'person'
    ? `${name} ${industry} ${city}`
    : `${name} ${industry} ${city} ${country}`;

  try {
    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', process.env.SERPAPI_KEY!);
    url.searchParams.set('gl', country.toLowerCase().slice(0, 2));
    url.searchParams.set('hl', 'en');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ...getEmptyResult(), error: `SerpAPI error: ${res.status}` };

    const data = await res.json() as Record<string, unknown>;
    const kg = data.knowledge_graph as Record<string, unknown> | undefined;

    if (!kg) {
      const result = getEmptyResult();
      await cacheKPResult(userId, entityKey, result);
      return result;
    }

    // Confidence check — verify the KG title refers to THIS entity, not just
    // one shared generic word. A single-word match (e.g. "dental" matching
    // "ATX Family Dental" for a "Bright Smile Dental" scan) is not enough:
    // require at least half of the significant name tokens to appear in the
    // title. A false negative (no panel shown) is safer than showing another
    // business's panel.
    const kgTitle = (kg.title as string | undefined) ?? '';
    const nameParts = [...new Set(name.toLowerCase().split(/\s+/).filter(part => part.length > 3))];
    const titleLower = kgTitle.toLowerCase();
    const matchedParts = nameParts.filter(part => titleLower.includes(part));
    const titleMatch = nameParts.length > 0 && matchedParts.length / nameParts.length >= 0.5;
    if (!titleMatch && entityType === 'business') {
      return { ...getEmptyResult(), error: 'Knowledge Panel found but for different entity' };
    }

    const description = (kg.description as string | undefined) ?? null;
    const hasPhoto = !!(kg.image || (kg.header_images as unknown[] | undefined)?.[0]);
    const photoUrl = ((kg.image as Record<string, string> | undefined)?.image_url)
      ?? ((kg.header_images as Array<Record<string, string>> | undefined)?.[0]?.image)
      ?? null;
    const categories = [kg.type, ...((kg.sub_types as string[] | undefined) ?? [])].filter(Boolean) as string[];
    const socialLinks = Object.values((kg.profiles as Record<string, Record<string, string>> | undefined) ?? {})
      .map(p => p.link ?? '').filter(Boolean);
    const website = (kg.website as string | undefined) ?? null;
    const wikiDataId = (kg.wikidata_id as string | undefined) ?? null;
    const kgSource = kg.source as Record<string, string> | undefined;
    const wikipediaUrl = kgSource?.link?.includes('wikipedia') ? kgSource.link : null;
    // b02d: a Wikidata ID alone does NOT mean the panel is claimed —
    // it only means the entity has a Wikidata entry. Claimed requires
    // kg.claimed || kg.owner_verified (affects the 25/18/12 score tiers).
    const claimed = !!(kg.claimed || kg.owner_verified);

    let completeness = 0;
    const missingFields: string[] = [];
    if (kgTitle) completeness += 20; else missingFields.push('Name/Title missing');
    if (description) completeness += 20; else missingFields.push('Description not set');
    if (hasPhoto) completeness += 20; else missingFields.push('Professional photo missing');
    if (categories.length > 0) completeness += 15; else missingFields.push('Business category not set');
    if (socialLinks.length >= 2) completeness += 15; else missingFields.push('Social profiles not linked (need 2+)');
    if (website) completeness += 10; else missingFields.push('Website not linked to panel');

    let score_contribution: number;
    if (claimed && completeness >= 80) score_contribution = 25;
    else if (claimed && completeness >= 50) score_contribution = 18;
    else if (claimed && completeness > 0) score_contribution = 12;
    else if (!claimed && completeness > 0) score_contribution = 8;
    else score_contribution = 0;

    const result: KnowledgePanelResult = {
      exists: true, claimed, title: kgTitle || null, description, hasPhoto, photoUrl,
      categories, socialLinks, website, completeness, missingFields,
      entityType, wikiDataId, wikipediaUrl, score_contribution, cached: false, error: null,
    };

    await cacheKPResult(userId, entityKey, result);
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('KP detection error:', msg);
    return { ...getEmptyResult(), error: msg };
  }
}
