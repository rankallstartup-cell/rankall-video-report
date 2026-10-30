import { describe, it, expect } from 'vitest';
import { signalsForCountry } from '../../../lib/trustSignals';
import { buildDirectorySignals } from '../../../lib/trust';

// ax88: the catalog and detection disagreed about which industries
// get Healthgrades — the catalog listed only 5 industries (so a
// chiropractor's signal was hidden on the dashboard), while detection
// used a substring list that included vet/health/pharma (so the same
// scan showed it on the report page). One shared definition now.
describe('ax88 Healthgrades industry agrees everywhere', () => {
  it('catalog includes healthcare specialties, excludes vets/plumbers', () => {
    const hasHg = (industry: string) =>
      signalsForCountry('US', industry).some(s => s.id === 'healthgrades');
    expect(hasHg('chiropractor')).toBe(true);
    expect(hasHg('optometrist')).toBe(true);
    expect(hasHg('dermatologist')).toBe(true);
    expect(hasHg('dentist')).toBe(true);
    expect(hasHg('veterinarian')).toBe(false);
    expect(hasHg('plumber')).toBe(false);
    expect(hasHg('health food store')).toBe(false);
    // Country gate still works.
    expect(signalsForCountry('GB', 'dentist').some(s => s.id === 'healthgrades')).toBe(false);
  });

  it('detection matches the catalog', () => {
    const hasHg = (industry: string) =>
      buildDirectorySignals([], '', ['healthgrades.com'], { industry })
        .some(s => s.name === 'Healthgrades');
    expect(hasHg('chiropractor')).toBe(true);
    expect(hasHg('veterinarian')).toBe(false);
    expect(hasHg('plumber')).toBe(false);
  });
});
