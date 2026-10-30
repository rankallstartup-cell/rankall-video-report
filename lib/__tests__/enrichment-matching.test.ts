import { describe, it, expect } from 'vitest';
import {
  isConfidentPlaceMatch,
  addressMatchesCity,
  getTrustedStoredGoogle,
  getTrustedDisplayName,
} from '../enrichment';

// Regression tests for the GBP mismatch: "Bright Smile Dental" (Dallas) must
// never match "Brite Smiles Dentistry" (Flower Mound) — different spelling,
// different city, different business.

describe('addressMatchesCity', () => {
  it('accepts an address in the queried city', () => {
    expect(
      addressMatchesCity('123 Main St, Dallas, TX 75001', 'Dallas'),
    ).toBe(true);
  });

  it('rejects an address in a different city', () => {
    expect(
      addressMatchesCity('4900 Long Prairie Rd #300, Flower Mound, TX 75028', 'Dallas'),
    ).toBe(false);
  });

  it('matches multi-word cities', () => {
    expect(
      addressMatchesCity('4900 Long Prairie Rd #300, Flower Mound, TX 75028', 'Flower Mound'),
    ).toBe(true);
  });

  it('treats St. / Saint as the same city', () => {
    expect(
      addressMatchesCity('100 Market St, Saint Louis, MO 63101', 'St. Louis'),
    ).toBe(true);
  });

  it('passes when no city was given (nothing to check against)', () => {
    expect(addressMatchesCity('100 Market St, Saint Louis, MO 63101', '')).toBe(true);
    expect(addressMatchesCity('100 Market St, Saint Louis, MO 63101', null)).toBe(true);
  });

  it('fails when the candidate has no address (cannot prove it is in the city)', () => {
    expect(addressMatchesCity(null, 'Dallas')).toBe(false);
    expect(addressMatchesCity('', 'Dallas')).toBe(false);
  });
});

describe('isConfidentPlaceMatch', () => {
  it('REJECTS the reported bug: Bright Smile Dental (Dallas) vs Brite Smiles Dentistry (Flower Mound)', () => {
    expect(
      isConfidentPlaceMatch(
        'Bright Smile Dental Dallas TX',
        'Dallas',
        'Brite Smiles Dentistry',
        '4900 Long Prairie Rd #300, Flower Mound, TX 75028',
      ),
    ).toBe(false);
  });

  it('ACCEPTS the real business: Bright Smile Dental in Dallas', () => {
    expect(
      isConfidentPlaceMatch(
        'Bright Smile Dental Dallas TX',
        'Dallas',
        'Bright Smile Dental',
        '500 Elm St, Dallas, TX 75201',
      ),
    ).toBe(true);
  });

  it('ACCEPTS an exact match', () => {
    expect(
      isConfidentPlaceMatch(
        'ATX Family Dental',
        'Austin',
        'ATX Family Dental',
        '1700 S 1st St, Austin, TX 78704',
      ),
    ).toBe(true);
  });

  it('REJECTS the same name in a different city', () => {
    expect(
      isConfidentPlaceMatch(
        'Bright Smile Dental',
        'Dallas',
        'Bright Smile Dental',
        '500 Elm St, Fort Worth, TX 76101',
      ),
    ).toBe(false);
  });

  it('REJECTS a same-city lookalike', () => {
    expect(
      isConfidentPlaceMatch(
        'Dallas Dental Arts',
        'Dallas',
        'Dallas Family Dental',
        '500 Elm St, Dallas, TX 75201',
      ),
    ).toBe(false);
  });

  it('REJECTS empty names', () => {
    expect(isConfidentPlaceMatch('', 'Dallas', 'Bright Smile Dental', '500 Elm St, Dallas, TX')).toBe(false);
    expect(isConfidentPlaceMatch('Bright Smile Dental', 'Dallas', '', '500 Elm St, Dallas, TX')).toBe(false);
    expect(isConfidentPlaceMatch('Bright Smile Dental', 'Dallas', null, '500 Elm St, Dallas, TX')).toBe(false);
  });
});

// Render-time re-validation for STORED Google data (stale poisoned reports):
// old scans stored the first fuzzy Places result with zero validation, so a
// report can carry another business's Google data. The report page must
// re-run the same confident-match check at render and treat a failure as
// no-match — never show the wrong business's data or name.
describe('getTrustedStoredGoogle', () => {
  const poisoned = {
    reviewCount: 312,
    rating: 4.7,
    claimed: true,
    address: '4900 Long Prairie Rd #300, Flower Mound, TX 75028, USA',
    phone: '+1 469-549-4800',
    website: null,
    hours: null,
    photos: 10,
    category: 'dentist',
    placeId: 'poisoned-place-id',
    name: 'Brite Smiles Dentistry',
    latitude: null,
    longitude: null,
  };
  const legit = {
    ...poisoned,
    address: '123 Main St, Dallas, TX 75201',
    phone: '+1 214-555-0100',
    name: 'Bright Smile Dental',
    placeId: 'legit-place-id',
  };

  it('REJECTS stored data for the wrong business (Bright Smile Dallas vs Brite Smiles Flower Mound)', () => {
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', poisoned)).toBeUndefined();
  });

  it('ACCEPTS stored data that matches the scan', () => {
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', legit)).toBe(legit);
  });

  it('returns undefined when there is no stored Google data', () => {
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', undefined)).toBeUndefined();
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', null)).toBeUndefined();
  });

  it('REJECTS stored data with no name (cannot prove it belongs to this business)', () => {
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', { ...legit, name: null })).toBeUndefined();
  });

  it('REJECTS stored data with no address when a city was given', () => {
    expect(getTrustedStoredGoogle('Bright Smile Dental Dallas TX', 'Dallas', { ...legit, address: null })).toBeUndefined();
  });
});

describe('getTrustedDisplayName', () => {
  const poisoned = {
    reviewCount: 312,
    rating: 4.7,
    claimed: true,
    address: '4900 Long Prairie Rd #300, Flower Mound, TX 75028, USA',
    phone: '+1 469-549-4800',
    website: null,
    hours: null,
    photos: 10,
    category: 'dentist',
    placeId: 'poisoned-place-id',
    name: 'Brite Smiles Dentistry',
    latitude: null,
    longitude: null,
  };
  const legit = { ...poisoned, address: '123 Main St, Dallas, TX 75201', name: 'Bright Smile Dental' };

  it('falls back to the scan input when the stored Google name is a mismatch', () => {
    expect(
      getTrustedDisplayName('Bright Smile Dental Dallas TX', 'Dallas', 'Brite Smiles Dentistry', poisoned),
    ).toBe('Bright Smile Dental Dallas TX');
  });

  it('keeps the stored name when the stored Google data matches', () => {
    expect(
      getTrustedDisplayName('Bright Smile Dental Dallas TX', 'Dallas', 'Bright Smile Dental', legit),
    ).toBe('Bright Smile Dental');
  });

  it('keeps the stored name when there is no stored Google data to distrust (e.g. Knowledge Panel title)', () => {
    expect(
      getTrustedDisplayName('Bright Smile Dental Dallas TX', 'Dallas', 'Bright Smile Dental', undefined),
    ).toBe('Bright Smile Dental');
  });

  it('falls back to input, then Business, when nothing else exists', () => {
    expect(getTrustedDisplayName('Bright Smile Dental Dallas TX', 'Dallas', null, undefined)).toBe(
      'Bright Smile Dental Dallas TX',
    );
    expect(getTrustedDisplayName(null, null, null, undefined)).toBe('Business');
  });
});
