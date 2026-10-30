// lib/queryVariations.ts
// Phase 18: DETERMINISTIC query variations. Fixed templates — the same input always
// produces the exact same 5 queries, so scans are reproducible run-to-run. This
// replaced a stochastic Haiku call that made every scan send different queries.
// Number of queries a normal local scan sends per platform (the length of
// generateQueryVariations' basket). Any externally-supplied basket is capped
// at this so a request can never multiply the platform fan-out.
export const QUERIES_PER_SCAN = 5;
export const MAX_QUERY_LENGTH = 200;

// One query string that may be sent to the AI platforms: a non-empty string
// of at most MAX_QUERY_LENGTH chars with no control characters.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
export function isValidQueryText(q: unknown, maxLength: number = MAX_QUERY_LENGTH): q is string {
  if (typeof q !== 'string') return false;
  const t = q.trim();
  return t.length > 0 && t.length <= maxLength && !CONTROL_CHARS.test(t);
}

// A locked query basket from a TRUSTED source (internal caller or a prior
// scan row). Returns null unless it is a non-empty array whose entries are
// ALL valid query strings; deduped and capped at QUERIES_PER_SCAN.
export function sanitizeQueryBasket(raw: unknown, max: number = QUERIES_PER_SCAN): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every(q => isValidQueryText(q))) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of raw as string[]) {
    const t = q.trim();
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : null;
}

// Free-text body fields that are spliced into platform queries (name,
// city, specialty…). Returns the name of the first field that is present
// but not a valid query fragment (non-string, too long, control chars), or
// null when all are fine. Absent / null / '' fields are allowed.
export function invalidQueryField(fields: Record<string, unknown>, maxLength: number = 100): string | null {
  for (const [name, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    if (!isValidQueryText(v, maxLength)) return name;
  }
  return null;
}

export function generateQueryVariations(input: string, city?: string): string[] {
  const raw = input.trim();
  const base = raw.replace(/^(best|top rated|top)\s+/i, '');

  const needsCity = city && !raw.toLowerCase().includes(city.toLowerCase());
  const q = needsCity ? `${base} ${city}` : base;
  const rawWithCity = needsCity ? `${raw} ${city}` : raw;

  return [
    rawWithCity,
    `top rated ${q}`,
    `best ${q} near me`,
    `${q} reviews`,
    `highest rated ${q}`,
  ];
}

// P0c: basket identity — short deterministic fingerprint of the query set.
// Sorted + lowercased so equality is order/format-insensitive. cyrb53-based,
// no node:crypto import so this file stays safe to bundle anywhere.
export function computeBasketHash(queries: string[]): string {
  const normalized = [...queries].map(q => q.trim().toLowerCase()).sort().join('|');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
