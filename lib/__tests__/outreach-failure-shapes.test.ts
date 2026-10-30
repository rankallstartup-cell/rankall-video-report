import { describe, it, expect } from 'vitest';
import {
  TARGET_SEARCH_FAILED_CODE,
  TARGET_SEARCH_FAILED_MESSAGE,
  toTargetSearchErrorResponse,
  noTargetsMessage,
  fetchMapsResults,
  isScanShareable,
  resolveCsvReportUrl,
} from '../outreachFailureShapes';

// Fix #10: SerpAPI errors surface as explicit errors, never silent [].
describe('fetchMapsResults', () => {
  const stubFetch = (impl: () => unknown) => impl as unknown as typeof fetch;

  it('throws on a SerpAPI non-OK response (never a silent [])', async () => {
    const fetchFn = stubFetch(async () => ({ ok: false, status: 500 }));
    await expect(fetchMapsResults('dentists in Austin', 'key', 'us', fetchFn)).rejects.toThrow();
  });

  it('throws on a SerpAPI 401/403 (bad key) instead of returning []', async () => {
    const fetchFn = stubFetch(async () => ({ ok: false, status: 401 }));
    await expect(fetchMapsResults('dentists in Austin', 'bad-key', 'us', fetchFn)).rejects.toThrow();
  });

  it('throws on a network error (SerpAPI down)', async () => {
    const fetchFn = stubFetch(async () => { throw new Error('fetch failed'); });
    await expect(fetchMapsResults('dentists in Austin', 'key', 'us', fetchFn)).rejects.toThrow();
  });

  it('maps local_results to targets on success', async () => {
    const fetchFn = stubFetch(async () => ({
      ok: true,
      json: async () => ({
        local_results: [
          { title: 'Acme Dental', address: '1 Main St', phone: '555-1', website: 'https://acme.example', rating: 4.8, reviews: 120, place_id: 'p1' },
          { title: 'No Site Dental', address: '2 Oak St', phone: '', rating: null, reviews: null, place_id: 'p2' },
        ],
      }),
    }));
    const targets = await fetchMapsResults('dentists in Austin', 'key', 'us', fetchFn);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ businessName: 'Acme Dental', hasWebsite: true, rating: 4.8, reviewCount: 120, placeId: 'p1' });
    expect(targets[1]).toMatchObject({ businessName: 'No Site Dental', hasWebsite: false, website: null });
  });

  it('returns [] (not an error) when SerpAPI succeeds with zero results — the page shows the no-targets message', async () => {
    const fetchFn = stubFetch(async () => ({ ok: true, json: async () => ({ local_results: [] }) }));
    await expect(fetchMapsResults('dentists in Nowhere', 'key', 'us', fetchFn)).resolves.toEqual([]);
  });
});

describe('target search error response', () => {
  it('is a 502 with a stable code and a generic message', () => {
    const { status, body } = toTargetSearchErrorResponse();
    expect(status).toBe(502);
    expect(body.error).toBe(TARGET_SEARCH_FAILED_CODE);
    expect(body.message).toBe(TARGET_SEARCH_FAILED_MESSAGE);
  });

  it('never leaks the API key or raw provider internals', () => {
    const { body } = toTargetSearchErrorResponse();
    const joined = `${body.error} ${body.message}`;
    expect(joined).not.toMatch(/api_key|serpapi\.com|401|403/i);
  });
});

describe('no-targets message', () => {
  it('names the industry + city and suggests a next step', () => {
    const msg = noTargetsMessage('dentists', 'Austin');
    expect(msg).toContain('dentists');
    expect(msg).toContain('Austin');
    expect(msg).toMatch(/different city or industry/i);
  });
});

describe('CSV report_url eligibility', () => {
  it('ownerless scan → shareable', () => {
    expect(isScanShareable(null, undefined)).toBe(true);
    expect(isScanShareable(undefined, false)).toBe(true);
  });

  it('owned + published scan → shareable', () => {
    expect(isScanShareable('user-1', true)).toBe(true);
  });

  it('owned + private scan → NOT shareable (missing is_public stays private)', () => {
    expect(isScanShareable('user-1', false)).toBe(false);
    expect(isScanShareable('user-1', undefined)).toBe(false);
    expect(isScanShareable('user-1', null)).toBe(false);
  });

  it('ownerless scan → /r/<id>', () => {
    expect(resolveCsvReportUrl('abc-123', true)).toBe('https://www.rankall.io/r/abc-123');
  });

  it('owned-private scan → empty report_url, never a private link', () => {
    expect(resolveCsvReportUrl('abc-123', false)).toBe('');
  });

  it('missing scan id → empty report_url', () => {
    expect(resolveCsvReportUrl(null, true)).toBe('');
    expect(resolveCsvReportUrl(undefined, true)).toBe('');
  });
});
