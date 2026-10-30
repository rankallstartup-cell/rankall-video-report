import { describe, it, expect } from 'vitest';
import { isMedicalIndustryName, isLegalIndustryName, isKnownIndustry, signalsForCountry } from '../trustSignals';
import { buildDirectorySignals } from '../trust';

// ax88 residual: whole-word industry matching + ONE definition for the
// dashboard catalog (signalsForCountry) and report scoring
// (buildDirectorySignals).
describe('ax88 whole-word industry keywords', () => {
  it.each(['accident lawyer', 'plant nursery', 'legal counsel', 'student housing', 'dentsu agency', 'lawn care'])(
    '"%s" is NOT medical', (ind) => {
      expect(isMedicalIndustryName(ind)).toBe(false);
    },
  );

  it.each(['dentist', 'Dental clinic', 'chiropractor', 'optometrist', 'physiotherapy', 'physicaltherapy', 'pediatrician', 'psychologist', 'family doctor', 'specialist'])(
    '"%s" IS medical', (ind) => {
      expect(isMedicalIndustryName(ind)).toBe(true);
    },
  );

  it.each(['veterinarian', 'animal hospital', 'pet clinic', 'pharmacy', 'medspa', 'tree surgeon'])(
    '"%s" is not human healthcare', (ind) => {
      expect(isMedicalIndustryName(ind)).toBe(false);
    },
  );

  it('legal is whole-word too ("lawn care" is not legal, "legal counsel" is)', () => {
    expect(isLegalIndustryName('lawn care')).toBe(false);
    expect(isLegalIndustryName('legal counsel')).toBe(true);
    expect(isLegalIndustryName('accident lawyer')).toBe(true);
    expect(isLegalIndustryName('lawyer')).toBe(true);
  });

  it('"general"/empty industry is unknown', () => {
    expect(isKnownIndustry('general')).toBe(false);
    expect(isKnownIndustry('')).toBe(false);
    expect(isKnownIndustry(undefined)).toBe(false);
    expect(isKnownIndustry('plumber')).toBe(true);
  });
});

describe('ax88 Healthgrades: scoring and display agree for every industry', () => {
  const detected = (industry: string) =>
    buildDirectorySignals([], '', ['healthgrades.com'], { industry }).some(s => s.name === 'Healthgrades');
  const catalog = (industry: string) =>
    signalsForCountry('US', industry).some(s => s.id === 'healthgrades');

  it.each(['veterinarian', 'chiropractor', 'optometrist', 'physicaltherapy', 'physiotherapist', 'pharmacy', 'dentist', 'plumber', 'accident lawyer', 'plant nursery', 'general', ''])(
    'industry "%s": report == dashboard', (industry) => {
      expect(detected(industry)).toBe(catalog(industry));
    },
  );

  it('vets/pharmacies hidden, chiro/optometry/physio shown', () => {
    expect(detected('veterinarian')).toBe(false);
    expect(detected('pharmacy')).toBe(false);
    expect(detected('chiropractor')).toBe(true);
    expect(detected('optometrist')).toBe(true);
    expect(detected('physicaltherapy')).toBe(true);
    expect(detected('accident lawyer')).toBe(false);
  });
});
