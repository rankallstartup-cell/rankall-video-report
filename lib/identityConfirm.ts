// Ticket 7: identity-confirm helpers for the homepage "Scan My Name" flow.
// Pure functions so they are unit-testable. The confidence rules mirror the
// dashboard personal-brand confirm step
// (app/dashboard/personal-brand/page.tsx assessIdentity) — keep the two in
// sync if either changes. The server never trusts these client-computed
// values (see the note in app/api/scan-personal/route.ts); they exist so the
// user sees WHY a match is shaky before any score is produced.

export type IdentityConfidence = 'high' | 'medium' | 'low';

export interface IdentityConfirmInput {
  name: string;
  titlePrefix?: string;
  specialty?: string;
  location?: string;
  linkedinUrl?: string;
  // null = not looked up yet; { found } = LinkedIn lookup result.
  linkedin?: { found: boolean; headline?: string } | null;
}

export interface IdentityAssessment {
  confidence: IdentityConfidence;
  basis: string[];
  bareCommonName: boolean;
}

export function assessIdentityConfirm(input: IdentityConfirmInput): IdentityAssessment {
  const basis: string[] = [];
  const hasTitle = !!(input.titlePrefix && input.titlePrefix.trim());
  const hasSpecialty = !!(input.specialty && input.specialty.trim());
  const hasCity = !!(input.location && input.location.trim());
  const hasLinkedinUrl = !!(input.linkedinUrl && input.linkedinUrl.trim());
  if (hasTitle) basis.push(`Title provided (${input.titlePrefix!.trim()})`);
  if (hasSpecialty) basis.push(`Specialty provided (${input.specialty!.trim()})`);
  if (hasCity) basis.push(`City provided (${input.location!.trim()})`);
  if (input.linkedin) {
    if (input.linkedin.found) {
      basis.push(`LinkedIn profile found${input.linkedin.headline ? `: ${input.linkedin.headline}` : ''}`);
    } else {
      basis.push('LinkedIn profile not found or not scrapable');
    }
  } else if (hasLinkedinUrl) {
    basis.push('LinkedIn URL provided — look it up to confirm the match');
  }
  const words = (input.name || '').trim().split(/\s+/).filter(Boolean);
  const bareCommonName =
    words.length === 2 && !hasTitle && !hasSpecialty && !hasCity && !hasLinkedinUrl;
  if (bareCommonName) {
    basis.push('Common-name risk: two-word name with no specialty, city, or LinkedIn to disambiguate');
  }
  let confidence: IdentityConfidence;
  if (input.linkedin?.found && hasLinkedinUrl) confidence = 'high';
  else if ((hasSpecialty && hasCity) || hasTitle) confidence = 'medium';
  else confidence = 'low';
  return { confidence, basis, bareCommonName };
}

// Professional-mode ("Scan My Name") override decision, used by the homepage
// startScan. Professional mode normally forces the personal path — but NEVER
// when the Places tiebreaker positively identified a business
// (e.g. "Power Rogers Chicago" has a Google Business listing). That signal
// arrives from /api/detect-query as places_tiebreaker_business. When the
// tiebreaker did not fire, "Scan My Name" still fires the personal path, so
// a slow/failed detect-query never breaks the Scan My Name promise.
export function shouldOverrideToPersonal(input: {
  personalMode: boolean;
  detectedIntent: string;
  placesTiebreakerBusiness: boolean;
}): boolean {
  return (
    input.personalMode &&
    input.detectedIntent !== 'PERSONAL_PRO' &&
    !input.placesTiebreakerBusiness
  );
}
