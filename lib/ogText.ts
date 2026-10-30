// Sanitizer for the public /api/og/marketing card (ticket 12). The route
// renders arbitrary ?title=&subtitle= on a rankall.io-branded image, so
// anyone could mint a "Rankall says …" card with any text. Inputs are now:
//   - rejected (fallback used) when absurdly long — nobody legit sends 300+ chars,
//   - stripped of control chars, zero-width chars and bidi overrides
//     (U+202A\u2013202E, U+2066\u20132069 can visually reorder text),
//   - whitespace-collapsed, then truncated by code point with an ellipsis.
// Fully allow-listing page keys is not possible: blog post cards use the
// post title, which is dynamic.

export const OG_TITLE_MAX = 60;
export const OG_SUBTITLE_MAX = 130;
const OG_RAW_HARD_LIMIT = 300;

const STRIP = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function sanitizeOgText(raw: string | null | undefined, max: number, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > OG_RAW_HARD_LIMIT) return fallback;
  const cleaned = raw.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  const chars = Array.from(cleaned);
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() + '…' : cleaned;
}
