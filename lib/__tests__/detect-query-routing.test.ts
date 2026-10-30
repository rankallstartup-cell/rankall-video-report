import { describe, it, expect } from 'vitest';
import { detectPersonalProIntent } from '../queries';

/**
 * Regression tests for the detect-query routing decision.
 *
 * The two_caps rule in detectPersonalProIntent flags ambiguous inputs like
 * "Power Rogers Chicago" as isPersonal=true. The detect-query route then
 * uses Google Places as a tiebreaker:
 *   - hasListing=true  → LOCAL_PRO (Haiku provides category only, never overrides intent)
 *   - hasListing=false  → PERSONAL_PRO
 *
 * These tests verify the preconditions: detectPersonalProIntent must return
 * two_caps for these inputs so the tiebreaker path fires. The intent-lock
 * (placesTypes non-null → LOCAL_PRO regardless of Haiku) is enforced in
 * detect-query/route.ts line ~156.
 */

describe('detect-query routing — two_caps tiebreaker preconditions', () => {
  // Ticket 7: "Power Rogers" is a law firm. It no longer depends on the
  // Places tiebreaker (which, when Places is down, fell through to a person
  // scan) — the detector classifies the surname pair as a firm up front.
  it('"Power Rogers Chicago" is a firm before any Places lookup', () => {
    const r = detectPersonalProIntent('Power Rogers Chicago');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('surname_pair');
  });

  it('"John Smith Chicago" triggers two_caps (Places tiebreaker path)', () => {
    const r = detectPersonalProIntent('John Smith Chicago');
    expect(r.isPersonal).toBe(true);
    expect(r.rule).toBe('two_caps');
  });

  it('title_prefix bypasses tiebreaker — routes PERSONAL_PRO immediately', () => {
    const r = detectPersonalProIntent('Dr Sarah Chen Austin');
    expect(r.isPersonal).toBe(true);
    expect(r.rule).toBe('title_prefix');
  });

  it('business_indicator bypasses tiebreaker — routes LOCAL_PRO immediately', () => {
    const r = detectPersonalProIntent('Clifford Law Offices Chicago');
    expect(r.isPersonal).toBe(false);
    expect(r.rule).toBe('business_indicator');
  });
});

describe('detect-query routing — intent lock logic', () => {
  // This mirrors the exact logic in detect-query/route.ts:
  // When placesTypes is non-null (Places confirmed a business listing),
  // intent is forced to LOCAL_PRO regardless of what Haiku returns.
  function resolveIntent(
    haikuIntent: string,
    placesTypes: string[] | null,
    validIntents: Set<string>,
  ): string {
    if (placesTypes) return 'LOCAL_PRO';
    return validIntents.has(haikuIntent) ? haikuIntent : 'LOCAL_PRO';
  }

  const VALID = new Set(['LOCAL_PRO', 'PERSONAL_PRO', 'PRODUCT_PRO', 'GLOBAL_BRAND', 'GOVERNMENT', 'UNKNOWN']);

  it('hasListing=true (placesTypes present) → LOCAL_PRO even if Haiku says PERSONAL_PRO', () => {
    expect(resolveIntent('PERSONAL_PRO', ['lawyer', 'point_of_interest'], VALID)).toBe('LOCAL_PRO');
  });

  it('hasListing=true → LOCAL_PRO even if Haiku says UNKNOWN', () => {
    expect(resolveIntent('UNKNOWN', ['restaurant'], VALID)).toBe('LOCAL_PRO');
  });

  it('hasListing=false (placesTypes null) → respects Haiku intent PERSONAL_PRO', () => {
    expect(resolveIntent('PERSONAL_PRO', null, VALID)).toBe('PERSONAL_PRO');
  });

  it('hasListing=false → respects Haiku intent LOCAL_PRO', () => {
    expect(resolveIntent('LOCAL_PRO', null, VALID)).toBe('LOCAL_PRO');
  });

  it('hasListing=false + invalid Haiku intent → defaults to LOCAL_PRO', () => {
    expect(resolveIntent('NONSENSE', null, VALID)).toBe('LOCAL_PRO');
  });
});
