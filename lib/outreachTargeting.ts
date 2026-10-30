// lib/outreachTargeting.ts
// Outreach improvement #9 — targeting quality: cross-run dedupe + quality filters.
//
// Two send decisions consult this module before any email goes out:
//   1. Dashboard send  (app/api/outreach/send-email/route.ts)
//   2. Sequence enrollment (app/api/webhooks/apollo/route.ts)
//
// MATCHING RULE (documented — this is the whole point of the module):
// A "recently emailed" match requires BOTH:
//   - normalized business names EQUAL (exact equality after normalization —
//     NO substring / fuzzy matching, so "Joe's Pizza" never blocks
//     "Joe's Pizza & Grill"), AND
//   - normalized cities EQUAL ("Austin, TX" == "Austin": the part before the
//     first comma is the city; state suffixes are ignored because the Apollo
//     webhook stores city as "city, state" while the dashboard stores "city").
// Normalization: NFKD, strip diacritics, lowercase, trim, collapse
// whitespace, punctuation -> space, strip trailing legal suffixes
// (llc/inc/corp/co/ltd/dba/llp/pc). So "Joe's Pizza" == "Joes Pizza" ==
// "Joe's Pizza LLC". An empty normalized name or city never matches.
//
// WHAT COUNTS AS "EMAILED":
// Only rows that prove an email actually went out:
//   - outreach_log rows with status = 'sent' (dashboard sends), and
//   - outreach_sequence_log rows with status = 'sent' joined to their
//     outreach_targets row for the business name + city (sequence sends).
// A business that was only SCANNED (or only enrolled, never sent) has no
// 'sent' row and is NOT blocked. Verification skips, DNC blocks, and other
// non-'sent' statuses never block either.
// outreach_targets is consulted through its sequence sends, NOT standalone:
// it carries no emailed timestamp, so a standalone name+city match against
// it would block businesses that were only ever enrolled/scanned.
//
// FAIL-OPEN: if any history lookup throws, the check returns
// { blocked: false, lookupFailed: true } and the send proceeds. A history
// outage must never block outreach entirely.
//
// No SerpAPI calls are made here — this module only reads send history.

import type { SupabaseClient } from '@supabase/supabase-js';

export const REMAIL_WINDOW_DAYS = 90;

export type RecentSendSource = 'dashboard' | 'sequence';

export interface RecentSendCheck {
  blocked: boolean;
  /** 'recently_emailed' when blocked; 'history_lookup_failed' when fail-open. */
  reason?: string;
  lastSentAt?: string;
  source?: RecentSendSource;
  /** True when the history lookup failed and the send was allowed anyway. */
  lookupFailed?: boolean;
}

const LEGAL_SUFFIXES = new Set(['llc', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'dba', 'llp', 'lp', 'pc', 'pllc']);

/** Normalize a business name for equality matching (see module header). */
export function normalizeBusinessName(name: string | null | undefined): string {
  if (!name) return '';
  const noDiacritics = (name as string).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Apostrophes are dropped, NOT turned into spaces: "Joe's" -> "joes"
  // so "Joe's Pizza" matches "Joes Pizza".
  const noApos = noDiacritics.replace(/['’]/g, '');
  const cleaned = noApos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const parts = cleaned.split(' ');
  while (parts.length > 1 && LEGAL_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  // A name that IS only a legal suffix ("LLC") is not a business name.
  if (parts.length === 1 && LEGAL_SUFFIXES.has(parts[0])) return '';
  return parts.join(' ');
}

/** Normalize a city for equality matching: part before the first comma. */
export function normalizeCity(city: string | null | undefined): string {
  if (!city) return '';
  const firstPart = (city as string).split(',')[0] ?? '';
  return firstPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeBusinessName(a);
  const nb = normalizeBusinessName(b);
  return na !== '' && na === nb;
}

export function citiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = normalizeCity(a);
  const cb = normalizeCity(b);
  return ca !== '' && ca === cb;
}

function cutoffIso(windowDays: number, now: Date): string {
  return new Date(now.getTime() - windowDays * 24 * 3600 * 1000).toISOString();
}

interface LogRow { business_name: string | null; city: string | null; sent_at: string | null }
interface SeqRow { target_id: string | null; sent_at: string | null }
interface TargetRow { id: string | null; business_name: string | null; city: string | null }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Was this business emailed in the last `windowDays` days?
 * Checks dashboard sends (outreach_log) + sequence sends (outreach_sequence_log
 * joined to outreach_targets). Fail-open on any lookup error.
 * When `city` is empty and `email` is provided, falls back to exact email
 * equality (email is an exact identifier — no over-match risk).
 */
export async function wasEmailedRecently(
  sb: SupabaseClient,
  businessName: string,
  city: string,
  opts?: { windowDays?: number; now?: Date; email?: string },
): Promise<RecentSendCheck> {
  const windowDays = opts?.windowDays ?? REMAIL_WINDOW_DAYS;
  const now = opts?.now ?? new Date();
  const cutoff = cutoffIso(windowDays, now);
  const nameOk = normalizeBusinessName(businessName) !== '';
  const cityOk = normalizeCity(city) !== '';
  const email = (opts?.email || '').toLowerCase().trim();

  // No usable identity at all: nothing to match against — fail open.
  if (!nameOk && !email) return { blocked: false };

  try {
    let latest: { sentAt: string; source: RecentSendSource } | null = null;
    const consider = (sentAt: string | null, source: RecentSendSource) => {
      if (!sentAt) return;
      if (sentAt < cutoff) return;
      if (!latest || sentAt > latest.sentAt) latest = { sentAt, source };
    };

    if (nameOk && cityOk) {
      // Dashboard sends.
      const { data: logRows, error: logErr } = await sb
        .from('outreach_log')
        .select('business_name, city, sent_at')
        .eq('status', 'sent')
        .gte('sent_at', cutoff);
      if (logErr) throw logErr;
      for (const r of (logRows ?? []) as LogRow[]) {
        if (namesMatch(r.business_name, businessName) && citiesMatch(r.city, city)) {
          consider(r.sent_at, 'dashboard');
        }
      }

      // Sequence sends (via their target rows).
      const { data: seqRows, error: seqErr } = await sb
        .from('outreach_sequence_log')
        .select('target_id, sent_at')
        .eq('status', 'sent')
        .gte('sent_at', cutoff);
      if (seqErr) throw seqErr;
      const targetIds = [...new Set(((seqRows ?? []) as SeqRow[]).map(r => r.target_id).filter((x): x is string => !!x))];
      const seqByTarget = new Map<string, string | null>();
      for (const r of (seqRows ?? []) as SeqRow[]) {
        if (r.target_id) seqByTarget.set(r.target_id, r.sent_at);
      }
      for (const ids of chunk(targetIds, 500)) {
        const { data: targets, error: tErr } = await sb
          .from('outreach_targets')
          .select('id, business_name, city')
          .in('id', ids);
        if (tErr) throw tErr;
        for (const t of (targets ?? []) as TargetRow[]) {
          if (t.id && namesMatch(t.business_name, businessName) && citiesMatch(t.city, city)) {
            consider(seqByTarget.get(t.id) ?? null, 'sequence');
          }
        }
      }
    } else if (email) {
      // No city: fall back to exact email equality.
      const { data: logRows, error: logErr } = await sb
        .from('outreach_log')
        .select('business_name, city, sent_at')
        .eq('status', 'sent')
        .eq('email', email)
        .gte('sent_at', cutoff);
      if (logErr) throw logErr;
      for (const r of (logRows ?? []) as LogRow[]) consider(r.sent_at, 'dashboard');

      const { data: targets, error: tErr } = await sb
        .from('outreach_targets')
        .select('id, business_name, city')
        .eq('email', email);
      if (tErr) throw tErr;
      const ids = ((targets ?? []) as TargetRow[]).map(t => t.id).filter((x): x is string => !!x);
      for (const idBatch of chunk(ids, 500)) {
        const { data: seqRows, error: seqErr } = await sb
          .from('outreach_sequence_log')
          .select('target_id, sent_at')
          .eq('status', 'sent')
          .gte('sent_at', cutoff)
          .in('target_id', idBatch);
        if (seqErr) throw seqErr;
        for (const r of (seqRows ?? []) as SeqRow[]) consider(r.sent_at, 'sequence');
      }
    }

    if (latest) {
      return { blocked: true, reason: 'recently_emailed', lastSentAt: (latest as { sentAt: string }).sentAt, source: (latest as { source: RecentSendSource }).source };
    }
    return { blocked: false };
  } catch (err) {
    // Fail OPEN: a history outage must never block outreach entirely.
    console.error('[outreachTargeting] history lookup failed — failing open:', err);
    return { blocked: false, reason: 'history_lookup_failed', lookupFailed: true };
  }
}

// ---------------------------------------------------------------------------
// Quality ranking + chain filter (used by find-targets; no DB access)
// ---------------------------------------------------------------------------

export interface QualityTarget {
  hasWebsite?: boolean | null;
  rating?: number | null;
  reviewCount?: number | null;
}

/**
 * Quality score 0–2: +1 for a website, +1 for at least one review.
 * Website-less targets are NOT dropped — they rank lower and stay available.
 */
export function qualityScoreFor(t: QualityTarget): number {
  let score = 0;
  if (t.hasWebsite) score += 1;
  if ((t.reviewCount ?? 0) > 0) score += 1;
  return score;
}

/** Stable sort: highest quality first, original order preserved within ties. */
export function rankTargetsByQuality<T extends QualityTarget>(targets: T[]): T[] {
  return [...targets]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => qualityScoreFor(b.t) - qualityScoreFor(a.t) || a.i - b.i)
    .map(({ t }) => t);
}

// Known national franchise brands (normalized names). Heuristic only —
// the multi-location signal below is the primary detector. Exact-name
// match (or name + " #<number>" location suffix) so "Subway Tile Store"
// is NOT flagged as the Subway sandwich chain.
const KNOWN_FRANCHISES = new Set([
  'mcdonalds', 'subway', 'starbucks', 'dominos', 'pizza hut', 'papa johns',
  'little caesars', 'burger king', 'wendys', 'taco bell', 'kfc',
  'chick fil a', 'dunkin', 'dairy queen', 'sonic', 'arbys', 'jimmy johns',
  'jersey mikes', 'firehouse subs', 'panera bread', 'chipotle', 'five guys',
  'the ups store', 'fedex office', 'great clips', 'supercuts',
  'anytime fitness', 'planet fitness', 'orangetheory', 'ace hardware',
  '7 eleven', 'circle k', 'marriott', 'hilton', 'holiday inn',
  'best western', 'la quinta', 'motel 6', 'super 8', 'days inn', 'ramada',
  'comfort inn', 'quality inn', 'red roof inn', 'h r block', 'liberty tax',
  'jackson hewitt', 'state farm', 'allstate', 'farmers insurance',
  'geico', 'progressive', 'nationwide', 'remax', 'keller williams',
  'century 21', 'coldwell banker', 'exp realty',
]);

function isKnownFranchiseName(normalizedName: string): boolean {
  if (KNOWN_FRANCHISES.has(normalizedName)) return true;
  // "mcdonalds 1234" — location-numbered franchise outlet.
  const m = normalizedName.match(/^(.*) #?\d+$/);
  if (m && KNOWN_FRANCHISES.has(m[1].trim())) return true;
  return false;
}

/**
 * Likely a chain/franchise?
 *  - distinctAddresses >= 2: the same normalized name appeared at 2+
 *    distinct addresses in this search (multi-location in one city).
 *  - or the name matches the known-franchise list.
 * A local business with 2 locations in one city IS flagged — that is the
 * documented multi-location signal, and the filter is opt-in (default OFF)
 * precisely because this heuristic can over-flag locals.
 */
export function isLikelyChain(normalizedName: string, distinctAddresses: number): boolean {
  if (!normalizedName) return false;
  if (distinctAddresses >= 2) return true;
  return isKnownFranchiseName(normalizedName);
}

/** Count distinct normalized addresses per normalized business name. */
export function distinctAddressCounts(
  rows: Array<{ businessName: string; address: string }>,
): Map<string, number> {
  const byName = new Map<string, Set<string>>();
  for (const r of rows) {
    const name = normalizeBusinessName(r.businessName);
    if (!name) continue;
    const addr = (r.address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!byName.has(name)) byName.set(name, new Set());
    if (addr) byName.get(name)!.add(addr);
  }
  const out = new Map<string, number>();
  for (const [name, addrs] of byName) out.set(name, addrs.size);
  return out;
}
