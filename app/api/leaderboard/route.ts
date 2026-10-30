import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const industry = searchParams.get('industry') || '';
  const state    = searchParams.get('state')    || '';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let query = supabase
    .from('rankall_scans')
    .select('id, input, user_business_name, overall_score, mentioned_count, trust_signals, competitor_name, location, industry, created_at')
    .not('trust_signals', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (industry) {
    query = query.eq('industry', industry.toLowerCase());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by business name, keep the highest-AI-score entry per business
  // (tiebreak: higher Trust, then newest). The page is the AI Visibility
  // Leaderboard ranked by AI Score — the representative scan must be the
  // business's best AI Score, not its best Trust Score.
  const byBusiness = new Map<string, typeof data[number]>();

  for (const scan of data ?? []) {
    const name = (scan.user_business_name || scan.input || '').trim().toLowerCase();
    if (!name) continue;
    // Skip entries with no real business name — a raw search query fell through
    // as the name (e.g. "best dentist in austin"), which isn't a business.
    if (!scan.user_business_name && isRawQuery(scan.input || '')) continue;

    // Filter by state if provided
    if (state) {
      const loc = (scan.location || scan.input || '').toLowerCase();
      if (!matchesState(loc, state)) continue;
    }

    const existing = byBusiness.get(name);
    if (!existing || compareScans(scan, existing) < 0) {
      byBusiness.set(name, scan);
    }
  }

  // Rank by AI Score desc (tiebreak: Trust desc, then newest). Rows are
  // ANONYMIZED server-side: no customer business name, no scan id, no
  // competitor name ever leaves this route — the public leaderboard must
  // not expose one customer's identity to another (there is no opt-in for
  // public display). Grouping still uses real names internally (never
  // returned) to dedupe per business.
  const ranked = Array.from(byBusiness.values())
    .sort(compareScans)
    .slice(0, 10)
    .map((scan, i) => {
      return {
        rank: i + 1,
        businessName: `Business #${i + 1}`,
        // Location column only — never the raw scan input, which would show the
        // business name + city (e.g. "Nixta Taqueria Austin TX") as the city.
        city: extractCity(scan.location || scan.input || ''),
        overallScore: scan.overall_score ?? 0,
        trustScore: (scan.trust_signals as any)?.overall ?? 0,
        mentionedCount: scan.mentioned_count ?? 0,
        industry: scan.industry || 'general',
        updatedAt: scan.created_at,
      };
    });

  // b8at: updatedAt is the NEWEST SCAN actually in the ranking — not the
  // request time (the old code returned new Date(), which made every load
  // look like fresh data).
  const updatedAt = ranked.length > 0
    ? ranked.map((r) => r.updatedAt).filter(Boolean).sort().at(-1) ?? null
    : null;

  return NextResponse.json({ ranked, updatedAt });
}

function scoreOf(scan: { overall_score: number | null }): number {
  return scan.overall_score ?? 0;
}

function trustOf(scan: { trust_signals: unknown }): number {
  return (scan.trust_signals as any)?.overall ?? 0;
}

// Ranking order: AI Score desc, then Trust desc, then newest scan first.
function compareScans(
  a: { overall_score: number | null; trust_signals: unknown; created_at: string | null },
  b: { overall_score: number | null; trust_signals: unknown; created_at: string | null },
): number {
  if (scoreOf(b) !== scoreOf(a)) return scoreOf(b) - scoreOf(a);
  if (trustOf(b) !== trustOf(a)) return trustOf(b) - trustOf(a);
  return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

// A business "name" that starts with a search verb is really a raw query
// ("best dentist in austin"), not a business. Only applied when there's no
// user_business_name, so a real business like "Best Dental Care" is never hit.
function isRawQuery(name: string): boolean {
  return /^(best|top|find|near|search|get|looking|cheap|affordable)\b/i.test((name || '').trim());
}

const STATE_CODES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm',
  'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh',
  oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx',
  utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa',
  'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
};

// b8at: the old filter did loc.includes(stateName) — but locations store
// state CODES ("Austin TX"), so "Texas" matched nothing and the filter
// returned false-empty for every state. Match the full state name OR the
// state code as the LAST token of the location ("Austin TX" → tx).
// The code is matched as the last token only — a bare substring/word match
// would false-positive on codes that are English words ("in" = Indiana
// would match "best dentist in austin").
function matchesState(loc: string, state: string): boolean {
  const normalized = loc.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const s = state.toLowerCase();
  if (normalized.includes(s)) return true;
  const code = STATE_CODES[s];
  if (!code) return false;
  const tokens = normalized.split(' ');
  return tokens[tokens.length - 1] === code;
}

const US_STATE_NAMES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico',
  'new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania',
  'rhode island','south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
];

// Extract just the "City ST" (or state name) from a string that may be prefixed
// with a business name, e.g. "Chicago Dental Arts Chicago IL" → "Chicago IL",
// "Mr Rooter Plumbing Iowa" → "Iowa". Heuristic (no gazetteer): 1–2 words before
// a state code are kept as the city; 3+ means a business-name prefix, so only the
// last word (the real city) is kept.
function extractCity(text: string): string {
  if (!text || !text.trim()) return '';
  // b8at: a bare domain ("rankall.io") is not a city — return no city
  // instead of putting a domain in the City column.
  const trimmed = text.trim();
  if (!/\s/.test(trimmed) && trimmed.includes('.')) return '';
  const loc = trimmed.replace(/\s+/g, ' ').replace(/,/g, '');

  // 1) Trailing 2-letter state code: "…City ST".
  const codeMatch = loc.match(/^(.*?)\s+([A-Z]{2})$/);
  if (codeMatch) {
    const before = codeMatch[1].trim().split(' ').filter(Boolean);
    const city = before.length <= 2 ? before.join(' ') : before.slice(-1)[0];
    return `${city} ${codeMatch[2]}`.trim();
  }

  // 2) Trailing full state name: "…Iowa" → "Iowa".
  const lower = loc.toLowerCase();
  const stateName = US_STATE_NAMES.find(s => lower === s || lower.endsWith(' ' + s));
  if (stateName) return stateName.replace(/\b\w/g, c => c.toUpperCase());

  // 3) Fallback: last two words (drops most of a long business prefix).
  const words = loc.split(' ');
  return words.slice(-2).join(' ');
}
