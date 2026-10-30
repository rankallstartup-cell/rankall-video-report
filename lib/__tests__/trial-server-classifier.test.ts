import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isCategorySearchQuery, trialScanCountsAsLocation } from '../categoryQueryClassifier';

describe('server-side trial classifier (client isBusinessName is ignored)', () => {
  it('explicit customer-style searches are category scans', () => {
    for (const q of ['best dentist in Austin', 'Top plumbers austin tx', 'find a lawyer chicago', 'dentist near me', 'affordable roofers in Elgin IL']) {
      expect(isCategorySearchQuery(q)).toBe(true);
      expect(trialScanCountsAsLocation(q)).toBe(false);
    }
  });
  it('business names — and ambiguous inputs — count as a location', () => {
    for (const q of ['Bright Smiles Dental Austin', "Joe's Plumbing", 'dentist chicago', '東京歯科', 'Bestway Movers']) {
      expect(trialScanCountsAsLocation(q)).toBe(true);
    }
  });
  it('empty input is not a category query', () => {
    expect(isCategorySearchQuery('')).toBe(false);
    expect(isCategorySearchQuery(null)).toBe(false);
  });
});

describe('scan route wiring (source-level)', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');
  it('trial caps use the server classifier, not body.isBusinessName', () => {
    expect(src).toContain('isTrialLocationBlocked(supabaseAdmin, userId, input, trialLocationScan, trialStartedAt)');
    expect(src).toContain('if (userId && trialLocationScan) {\n          await recordTrialBusinessUsage');
    // A category-classified trial scan runs in category mode.
    expect(src).toContain('if (userIsTrialing && !trialLocationScan) isBusinessName = hasGibberishToken;');
  });
  it('uses the DB limiter with the trusted IP, not the in-memory first-XFF bucket', () => {
    expect(src).toContain("checkRateLimitDb('scan:user', userId");
    expect(src).toContain("checkRateLimitDb('scan:ip', ip");
    expect(src).toContain('const ip = clientIpFromHeaders(req.headers);');
    expect(src).not.toMatch(/checkRateLimit\(ip/);
    expect(src).not.toContain("req.headers.get('x-forwarded-for')?.split(',')[0]");
  });
  it('internal auth uses isCronRequest (fails closed) and inbox metering needs an internal call', () => {
    expect(src).toContain('const internalCall = isCronRequest(req);');
    expect(src).toContain("const inboxMetered = internalCall && !!userId && body.meter === 'ai_inbox';");
  });
});

describe('inbox/search calls /api/scan as the user', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/inbox/search/route.ts'), 'utf8');
  it('sends the internal bearer + session userId + ai_inbox meter', () => {
    expect(src).toContain('Authorization: `Bearer ${cronSecret}`');
    expect(src).toContain("body: JSON.stringify({ input: trimmed, userId, meter: 'ai_inbox' })");
  });
});

describe('round 3: wording cannot dodge the 1-location cap', () => {
  it('a specific business name with a category prefix / near me still counts as a location', () => {
    for (const q of [
      'best Smith Dental Austin',
      'Smith Dental near me',
      'best Smith Dental in Austin',
      'top Bright Smiles Dental',
      'best dentist Smith',
      'best dentist at Smith Dental',
      'best dentist in Bright Smiles Austin',
      "best Joe's Plumbing",
      'top Acme Plumbing LLC',
      'best plumbers & heating co austin',
    ]) {
      expect(isCategorySearchQuery(q), q).toBe(false);
      expect(trialScanCountsAsLocation(q), q).toBe(true);
    }
  });
  it('genuine category searches are still category scans', () => {
    for (const q of ['best dentist in Austin', 'plumbers near me', 'emergency plumber near me', 'best family dentist in Chicago, IL', 'top rated hvac contractors in Denver', 'affordable roofers in Elgin IL']) {
      expect(isCategorySearchQuery(q), q).toBe(true);
      expect(trialScanCountsAsLocation(q), q).toBe(false);
    }
  });
  it('a server/detect-query business signal can only make a scan count, never exempt it', () => {
    expect(trialScanCountsAsLocation('best dentist in Austin', { resolvesToBusiness: true })).toBe(true);
    expect(trialScanCountsAsLocation('Smith Dental near me', { resolvesToBusiness: false })).toBe(true);
  });
});
