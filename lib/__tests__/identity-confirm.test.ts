import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assessIdentityConfirm, shouldOverrideToPersonal } from '../identityConfirm';

// Ticket 7: homepage identity-confirm. The homepage "Scan My Name" flow must
// show the same "Is this you?" step as the dashboard before any personal
// score is produced, and Professional mode must respect the Places
// tiebreaker (a firm routes to Local Pro, never a person-score).

describe('identity-confirm — assessIdentityConfirm', () => {
  it('LinkedIn found + URL → high confidence', () => {
    const a = assessIdentityConfirm({
      name: 'John Smith',
      linkedinUrl: 'https://linkedin.com/in/johnsmith',
      linkedin: { found: true, headline: 'Cardiologist' },
    });
    expect(a.confidence).toBe('high');
    expect(a.basis.join(' ')).toContain('LinkedIn profile found');
  });

  it('specialty + city → medium confidence', () => {
    const a = assessIdentityConfirm({ name: 'Jane Doe', specialty: 'Dentist', location: 'Chicago' });
    expect(a.confidence).toBe('medium');
    expect(a.basis).toContain('Specialty provided (Dentist)');
    expect(a.basis).toContain('City provided (Chicago)');
  });

  it('title alone → medium confidence', () => {
    const a = assessIdentityConfirm({ name: 'Sarah Chen', titlePrefix: 'Dr.' });
    expect(a.confidence).toBe('medium');
    expect(a.basis).toContain('Title provided (Dr.)');
  });

  it('bare two-word name → low confidence + common-name risk', () => {
    const a = assessIdentityConfirm({ name: 'John Smith' });
    expect(a.confidence).toBe('low');
    expect(a.bareCommonName).toBe(true);
    expect(a.basis.join(' ')).toContain('Common-name risk');
  });

  it('specialty present → not a bare common name', () => {
    const a = assessIdentityConfirm({ name: 'John Smith', specialty: 'Lawyer' });
    expect(a.bareCommonName).toBe(false);
  });

  it('LinkedIn looked up and not found → basis says so (not "look it up")', () => {
    const a = assessIdentityConfirm({
      name: 'John Smith',
      linkedinUrl: 'https://linkedin.com/in/johnsmith',
      linkedin: { found: false },
    });
    expect(a.basis).toContain('LinkedIn profile not found or not scrapable');
  });

  it('LinkedIn URL provided but not looked up → basis says look it up', () => {
    const a = assessIdentityConfirm({ name: 'John Smith', linkedinUrl: 'https://linkedin.com/in/johnsmith' });
    expect(a.basis).toContain('LinkedIn URL provided — look it up to confirm the match');
    expect(a.confidence).toBe('low');
  });
});

describe('identity-confirm — shouldOverrideToPersonal (Professional-mode override)', () => {
  it('Professional + LOCAL_PRO + no tiebreaker → override fires (Scan My Name promise)', () => {
    expect(
      shouldOverrideToPersonal({ personalMode: true, detectedIntent: 'LOCAL_PRO', placesTiebreakerBusiness: false }),
    ).toBe(true);
  });

  it('Professional + LOCAL_PRO + tiebreaker → NO override (firm routes to Local Pro)', () => {
    // "Power Rogers Chicago": Places found a business listing.
    expect(
      shouldOverrideToPersonal({ personalMode: true, detectedIntent: 'LOCAL_PRO', placesTiebreakerBusiness: true }),
    ).toBe(false);
  });

  it('already PERSONAL_PRO → no override needed', () => {
    expect(
      shouldOverrideToPersonal({ personalMode: true, detectedIntent: 'PERSONAL_PRO', placesTiebreakerBusiness: false }),
    ).toBe(false);
  });

  it('not Professional mode → never override', () => {
    expect(
      shouldOverrideToPersonal({ personalMode: false, detectedIntent: 'LOCAL_PRO', placesTiebreakerBusiness: false }),
    ).toBe(false);
  });

  it('Professional + UNKNOWN + no tiebreaker → override fires', () => {
    expect(
      shouldOverrideToPersonal({ personalMode: true, detectedIntent: 'UNKNOWN', placesTiebreakerBusiness: false }),
    ).toBe(true);
  });

  it('Professional + UNKNOWN + tiebreaker → NO override', () => {
    expect(
      shouldOverrideToPersonal({ personalMode: true, detectedIntent: 'UNKNOWN', placesTiebreakerBusiness: true }),
    ).toBe(false);
  });
});

describe('identity-confirm — wiring (source-level)', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  const detectQuery = readFileSync(join(process.cwd(), 'app/api/detect-query/route.ts'), 'utf8');
  const scanPersonal = readFileSync(join(process.cwd(), 'app/api/scan-personal/route.ts'), 'utf8');

  it('homepage: the ONLY scan-personal call sends requireConfirm + identityConfirmed', () => {
    const calls = page.split('/api/scan-personal').length - 1;
    expect(calls).toBe(1);
    expect(page).toContain('requireConfirm: true');
    expect(page).toContain('identityConfirmed: true');
  });

  it('homepage: unconfirmed personal intent opens the confirm panel, never the API', () => {
    expect(page).toContain("setPersonalConfirm({");
    // The PERSONAL_PRO branch must not fetch scan-personal directly.
    const branch = page.slice(
      page.indexOf('// Route personal pro to the identity-confirm step'),
      page.indexOf('// LOCAL_PRO / UNKNOWN — standard scan flow'),
    );
    expect(branch).not.toContain('/api/scan-personal');
    expect(branch).toContain('setPersonalConfirm');
  });

  it('homepage: Professional-mode override respects the tiebreaker flag', () => {
    expect(page).toContain('places_tiebreaker_business');
    expect(page).toContain('shouldOverrideToPersonal');
  });

  it('detect-query: tiebreaker flag is set and returned', () => {
    expect(detectQuery).toContain('tiebreakerRoutedToBusiness = true');
    expect(detectQuery).toContain('places_tiebreaker_business: tiebreakerRoutedToBusiness');
  });

  // The gate is now unconditional: the old `requireConfirm === true &&`
  // clause let any caller skip it by omitting the client flag.
  it('scan-personal: 428 gate requires confirmation on EVERY request', () => {
    expect(scanPersonal).toContain('if (identityConfirmed !== true) {');
    expect(scanPersonal).not.toContain('requireConfirm === true &&');
    expect(scanPersonal).toContain('identity_confirm_required');
  });
});
