import { describe, it, expect } from 'vitest';
import {
  buildReportPayload, filterTrustSignalsForAnon, canViewReport,
  canServePublicShare, canServeBadge, isScanId, ANON_VISIBLE_TRUST_SIGNALS,
} from '../reportPayload';
import { trustFixGainPoints } from '../trust';

// b0fm + ax8b: the report payload is filtered server-side by viewer tier.

const sig = (name: string, status = 'missing', extra: Record<string, unknown> = {}) => ({
  name, status, value: `${name} value`, impact: 'high', fixAvailable: true,
  consequence: `${name} SECRET consequence`, pointsImpact: 5, ...extra,
});

const trustSignals = {
  technical: [sig('HTTPS', 'good'), sig('FAQ Schema', 'missing'), sig('LocalBusiness JSON-LD', 'warning'), sig('Title tag', 'missing')],
  directory: [sig('Yelp listing'), sig('BBB listing', 'not_checked')],
  reviews: [sig('Review count')],
  community: [sig('Reddit mentions')],
  aiPlatforms: [sig('Perplexity citations')],
  overall: 42,
};

const scanRow = {
  id: '11111111-2222-3333-4444-555555555555',
  user_id: null,
  input: 'Brite Smiles in Austin TX',
  user_business_name: 'Brite Smiles',
  intent_type: 'local',
  industry: 'Dentist',
  location: 'Austin TX',
  country_code: 'US',
  overall_score: 31,
  competitor_name: 'Comp Dental',
  mentioned_count: 2,
  citation_sources: ['yelp.com'],
  trust_signals: trustSignals,
  enrichment: { google: { name: 'Brite Smiles', address: '1 Main St, Austin, TX 78701' }, serpData: { yelpPresent: true }, reddit: { mentionCount: 0 }, dataforSeo: { localRank: 3 } },
  knowledge_panel_data: null,
  created_at: '2026-10-01T00:00:00Z',
  basket_hash: 'internal-hash',
  scoring_version: 2,
};

const resultRows = [
  { id: 'r1', platform: 'ChatGPT', weight: 0.2, score: 100, mentioned: true, mention_rate: 1, response_text: 'FULL ChatGPT answer naming Brite Smiles', error: null },
  { id: 'r2', platform: 'Gemini', weight: 0.15, score: 0, mentioned: false, mention_rate: 0, response_text: 'FULL Gemini answer naming Comp Dental', error: null },
  { id: 'r3', platform: 'Grok', weight: 0.05, score: 0, mentioned: false, mention_rate: null, response_text: null, error: 'timeout' },
];

const build = (viewerId: string | null, isPaidOrAdmin: boolean, row: Record<string, unknown> = scanRow) =>
  buildReportPayload({ scanRow: row, resultRows, resultsError: false, shareSlug: 'abc-1', viewerId, isPaidOrAdmin });

describe('report payload — logged-out (anon) viewer', () => {
  const p = build(null, false);
  const json = JSON.stringify(p);

  it('is the anon tier', () => {
    expect(p.viewer).toEqual({ tier: 'anon', isOwner: false });
  });

  it('never ships AI response text, but keeps responded/mentioned flags', () => {
    expect(json).not.toContain('FULL ChatGPT answer');
    expect(json).not.toContain('FULL Gemini answer');
    expect(p.results.map(r => [r.platform, r.mentioned, r.responded, r.response_text])).toEqual([
      ['ChatGPT', true, true, ''],
      ['Gemini', false, true, ''],
      ['Grok', false, false, ''],
    ]);
    expect(p.results[2].error).toBe('timeout');
  });

  it('ships only the first 3 trust signals, a locked count and the overall score', () => {
    const ts = p.scan.trust_signals as ReturnType<typeof filterTrustSignalsForAnon>;
    const shown = [...ts!.technical, ...ts!.directory, ...ts!.reviews, ...ts!.community, ...(ts!.aiPlatforms ?? [])];
    expect(shown.map(s => s.name)).toEqual(['HTTPS', 'FAQ Schema', 'LocalBusiness JSON-LD']);
    expect(shown).toHaveLength(ANON_VISIBLE_TRUST_SIGNALS);
    expect(ts!.lockedCount).toBe(6);
    expect(ts!.overall).toBe(42);
    // locked signal details never leave the server
    for (const locked of ['Title tag', 'Yelp listing', 'BBB listing', 'Review count', 'Reddit mentions', 'Perplexity citations']) {
      expect(json).not.toContain(`${locked} SECRET consequence`);
      expect(json).not.toContain(`${locked} value`);
    }
  });

  it('carries the two schema statuses the free comparison table shows', () => {
    const ts = p.scan.trust_signals as ReturnType<typeof filterTrustSignalsForAnon>;
    expect(ts!.summary).toEqual({ faqSchema: 'missing', localBusinessSchema: 'warning' });
  });

  it('precomputes trust gain points over the FULL signal set (same number as signed-in)', () => {
    const ts = p.scan.trust_signals as ReturnType<typeof filterTrustSignalsForAnon>;
    const all = [...trustSignals.technical, ...trustSignals.directory, ...trustSignals.reviews, ...trustSignals.community, ...trustSignals.aiPlatforms];
    expect(ts!.technical[1].gainPoints).toBe(trustFixGainPoints(trustSignals.technical[1], all));
    expect(ts!.technical[2].gainPoints).toBe(trustFixGainPoints(trustSignals.technical[2], all));
  });

  it('drops internal scan columns and unrendered enrichment sources', () => {
    expect(p.scan).not.toHaveProperty('user_id');
    expect(p.scan).not.toHaveProperty('basket_hash');
    expect(p.scan).not.toHaveProperty('scoring_version');
    expect(p.scan.enrichment).toEqual({ google: { name: 'Brite Smiles', address: '1 Main St, Austin, TX 78701' }, serpData: { yelpPresent: true }, reddit: { mentionCount: 0 } });
  });

  it('keeps the free-view fields: score, competitor name, counts', () => {
    expect(p.scan.overall_score).toBe(31);
    expect(p.scan.competitor_name).toBe('Comp Dental');
    expect(p.scan.mentioned_count).toBe(2);
    expect(p.shareSlug).toBe('abc-1');
  });
});

describe('report payload — signed-in free (member) viewer', () => {
  const p = build('viewer-1', false);
  it('gets every trust signal and the full responses (free with an account)', () => {
    expect(p.viewer.tier).toBe('member');
    expect(p.scan.trust_signals).toEqual(trustSignals);
    expect(p.results[0].response_text).toBe('FULL ChatGPT answer naming Brite Smiles');
  });
});

describe('report payload — paid owner', () => {
  const owned = { ...scanRow, user_id: 'owner-1' };
  const p = build('owner-1', true, owned);
  it('is paid + owner and gets the unfiltered report data', () => {
    expect(p.viewer).toEqual({ tier: 'paid', isOwner: true });
    expect(p.scan.trust_signals).toEqual(trustSignals);
    expect(p.results.map(r => r.response_text)).toEqual([
      'FULL ChatGPT answer naming Brite Smiles', 'FULL Gemini answer naming Comp Dental', '',
    ]);
    expect(p.scan).not.toHaveProperty('user_id');
  });
});

describe('access rules', () => {
  it('owned report: owner only; ownerless: anyone with the id', () => {
    expect(canViewReport('owner-1', 'owner-1')).toBe(true);
    expect(canViewReport('owner-1', 'someone-else')).toBe(false);
    expect(canViewReport('owner-1', null)).toBe(false);
    expect(canViewReport(null, null)).toBe(true);
  });

  it('public share page: ownerless, or owned + explicitly shared', () => {
    expect(canServePublicShare(null, undefined)).toBe(true);
    expect(canServePublicShare('owner-1', true)).toBe(true);
    expect(canServePublicShare('owner-1', false)).toBe(false);
    expect(canServePublicShare('owner-1', undefined)).toBe(false); // migration not applied -> private
  });

  it('badge: owned + shared, or the owner previewing; never ownerless', () => {
    expect(canServeBadge('owner-1', true, null)).toBe(true);
    expect(canServeBadge('owner-1', false, 'owner-1')).toBe(true);
    expect(canServeBadge('owner-1', false, 'other')).toBe(false);
    expect(canServeBadge('owner-1', undefined, null)).toBe(false);
    expect(canServeBadge(null, true, null)).toBe(false);
  });

  it('only uuid scan ids are looked up', () => {
    expect(isScanId('11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(isScanId('abc')).toBe(false);
    expect(isScanId("1' or 1=1")).toBe(false);
  });
});

describe('results load failure', () => {
  it('reports resultsError with no rows (never an empty "no responses" scan)', () => {
    const p = buildReportPayload({ scanRow, resultRows: null, resultsError: true, shareSlug: null, viewerId: null, isPaidOrAdmin: false });
    expect(p.resultsError).toBe(true);
    expect(p.results).toEqual([]);
  });
});
