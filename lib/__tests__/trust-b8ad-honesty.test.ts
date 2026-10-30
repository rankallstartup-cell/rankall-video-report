import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAIPlatformSignals,
  buildTechnicalSignals,
  coreBusinessName,
} from '../trust';
import { detectTrustSignals } from '../trustServer';

// b8ad — /dashboard/trust honesty fixes. The page used to show a Passing
// 'Consistent description' beside a warning 'Platforms disagree' for the
// same responses, 'Mentioned by N of 11' with no response-rate context,
// two signals both rendering as 'Reddit Mentions', unsourced DA numerics,
// an unlabeled '50-review benchmark', a title check run against a Places
// name carrying its SEO tagline, a bare Trust Score with no formula, and
// '+N pts' badges that read as score contributions (they are fix-gain
// estimates). Logged-out visitors got the report shell with zeroed counts.

const BIZ = 'Brite Smiles Dentistry';

async function aiSignals(responses: (string | null)[]) {
  const report = await detectTrustSignals(
    {
      businessInput: BIZ,
      scanResults: responses.map((response, i) => ({
        platform: `Platform${i + 1}`,
        response,
        mentioned: response !== null,
      })),
      citationSources: [],
      enrichment: null,
    },
    'US',
  );
  const byName = (name: string) => report.aiPlatforms.find((s) => s.name === name)!;
  return {
    mentionRate: byName('Platform mention rate'),
    consensus: byName('Platform consensus'),
    consistent: byName('Consistent description'),
  };
}

describe('b8ad — Consistent description follows the same agreement as consensus', () => {
  it('shared opening words but low overall agreement is NOT consistent', async () => {
    // The two responses share their opening clause (old strict
    // common-words check passed: many shared words in the first 100
    // chars) but diverge afterwards — agreement ~43%, below the 50%
    // threshold. Old code: consensus warning + consistent GOOD
    // (contradiction). New: both follow agreement.
    const { consensus, consistent } = await aiSignals([
      'Brite Smiles Dentistry offers gentle cleanings and whitening treatments for families in Flower Mound with modern equipment and friendly staff and affordable pricing and convenient scheduling and same day appointments.',
      'Brite Smiles Dentistry offers gentle cleanings and whitening treatments for families in Flower Mound but specializes in extractions surgery implants crowns bridges dentures sedation pediatric orthodontics emergency care root canals.',
    ]);
    expect(consensus.status).toBe('warning');
    expect(consensus.value).toContain('disagree');
    expect(consistent.status).toBe('missing');
    expect(consistent.value).toContain('Inconsistent');
  });
});

describe('b8ad — mention rate names how many platforms responded', () => {
  it('value carries the responded count when provided', () => {
    const signals = buildAIPlatformSignals(
      [{ platform: 'ChatGPT', response: 'Brite Smiles Dentistry offers gentle cleanings.' }],
      BIZ,
      11,
      10,
    );
    const rate = signals.find((s) => s.name === 'Platform mention rate')!;
    expect(rate.value).toContain('Mentioned by 1 of 11');
    expect(rate.value).toContain('(10 responded)');
    expect(rate.value).toContain("Rankall's 80%");
    expect(rate.consequence).toContain('1 of 10 AI answers that responded');
  });

  it('omitting the responded count keeps the old shape (backwards compatible)', () => {
    const signals = buildAIPlatformSignals(
      [{ platform: 'ChatGPT', response: 'Brite Smiles Dentistry offers gentle cleanings.' }],
      BIZ,
      11,
    );
    const rate = signals.find((s) => s.name === 'Platform mention rate')!;
    expect(rate.value).not.toContain('responded');
  });
});

describe('b8ad — Reddit is two distinct checks, named distinctly', () => {
  it('directory checks citation presence; community checks mentions', async () => {
    const report = await detectTrustSignals(
      {
        businessInput: BIZ,
        scanResults: [],
        citationSources: [],
        enrichment: null,
      },
      'US',
    );
    expect(report.directory.find((s) => s.name === 'Reddit citation presence')).toBeDefined();
    expect(report.directory.find((s) => s.name === 'Reddit')).toBeUndefined();
    expect(report.community.find((s) => s.name === 'Reddit mentions')).toBeDefined();
  });
});

describe('b8ad — review-count threshold is attributed to Rankall, not a benchmark', () => {
  it('value names the check threshold', async () => {
    const report = await detectTrustSignals(
      {
        businessInput: BIZ,
        scanResults: [],
        citationSources: [],
        enrichment: { google: { rating: 4.9, reviewCount: 382, name: BIZ } },
      },
      'US',
    );
    const rc = report.reviews.find((s) => s.name === 'Review count')!;
    expect(rc.value).toContain("382 reviews (Google Places) — at or above Rankall's 50-review check threshold");
    expect(rc.value).not.toContain('benchmark');
  });
});

describe('b8ad — title check runs against the core business name', () => {
  it('coreBusinessName strips a Places SEO tagline, keeps real names', () => {
    expect(
      coreBusinessName('Royal Lane Dental Center - Best Dentist in Dallas | Clear Aligners and Veneers in Dallas'),
    ).toBe('Royal Lane Dental Center');
    expect(coreBusinessName('Brite Smiles Dentistry')).toBe('Brite Smiles Dentistry');
    expect(coreBusinessName('Smith | Jones')).toBe('Smith | Jones');
  });

  it('a bare core-name title passes with the core name, fails with the tagline name', () => {
    const html = (title: string) => `<html><head><title>${title}</title></head><body>Hi</body></html>`;
    const longName = 'Royal Lane Dental Center - Best Dentist in Dallas | Clear Aligners and Veneers in Dallas';
    const withTagline = buildTechnicalSignals(html('Royal Lane Dental Center'), 'https://example.com', longName, false, '', {})
      .find((s) => s.name === 'Title tag')!;
    expect(withTagline.status).toBe('warning');
    const withCore = buildTechnicalSignals(html('Royal Lane Dental Center'), 'https://example.com', coreBusinessName(longName), false, '', {})
      .find((s) => s.name === 'Title tag')!;
    expect(withCore.status).toBe('good');
  });

  it('trustServer wires the title check through coreBusinessName', () => {
    const src = readFileSync(join(process.cwd(), 'lib/trustServer.ts'), 'utf8');
    expect(src).toContain('coreBusinessName(');
    expect(src).toContain('respondedPlatforms');
  });
});

describe('b8ad — trust page: gate, provenance, formula, badge label', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/trust/page.tsx'), 'utf8');

  it('logged-out visitors get a sign-in gate, not the zeroed report shell', () => {
    expect(src).toContain('Sign in to view your trust report.');
    expect(src).toContain('/login?next=/dashboard/trust');
  });

  it('header names the business + the scanned input', () => {
    expect(src).toContain('Trust signals for');
    expect(src).toContain('getTrustedDisplayName');
    expect(src).toContain('user_business_name');
  });

  it('score formula is shown with the live counts', () => {
    expect(src).toContain('How it is calculated');
    expect(src).toContain('Signals never measured are excluded, not scored 0');
  });

  it('+pts badge is labelled as fix gain, not score earned', () => {
    expect(src).toContain('pts if fixed');
  });
});
