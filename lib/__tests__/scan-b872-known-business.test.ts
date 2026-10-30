import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b872 — "Rescan now" for a previously scanned business failed
// forever with "couldn't verify as a real business": its Places
// match is a near-name in another city (rejected by the b87d
// confident match) and no AI platform currently names it, so
// both not-found legs fire. The gate is right for NEW inputs
// (anti-garbage, deliberate tradeoff in the route comments) —
// but a forceRescan by the owner of a prior scan of the same
// input is a KNOWN business and must proceed (the verification
// loop depends on rescanning tracked businesses).

const route = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');

describe('b872 — known businesses stay rescannable', () => {
  it('the exemption is scoped to forceRescan + the scan owner + the same input', () => {
    expect(route).toContain('if (forceRescan === true && userId)');
    expect(route).toContain(".eq('user_id', userId)");
    expect(route).toContain(".eq('input', input)");
    expect(route).toContain('knownBusiness = !!prior?.length');
  });

  it('both not-found legs respect the exemption; the gate itself is intact', () => {
    expect(route).toContain('if (!knownBusiness && isBusinessName &&');
    expect(route).toContain('if (!knownBusiness && isBusinessNotFound(input, mentionedCount');
    expect(route).toContain('businessNotFoundResponse(input)');
  });
});
