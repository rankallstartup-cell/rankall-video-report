import { describe, it, expect, vi, beforeEach } from 'vitest';

// b01v: the spend-analysis route fed the model a fabricated competitor
// score (own score + 18) presented as data: "Competitor Score: ~68/100".
// The prompt must say "not measured" when no competitor score is measured.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ insert: () => Promise.resolve({ error: null }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { POST } from '../intelligence/spend-analysis/route';

let capturedPrompt = '';
beforeEach(() => {
  capturedPrompt = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('anthropic.com')) {
      const body = JSON.parse(init!.body as string);
      capturedPrompt = body.messages[0].content;
      return {
        ok: true,
        json: async () => ({
          content: [{ text: '{"categories":[],"reallocation":{},"bestHundred":{}}' }],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }));
});

function makeReq(scanData: Record<string, unknown>) {
  return new Request('https://rankall.io/api/intelligence/spend-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleAds: 100, metaAds: 0, seoAgency: 0,
      reviewManagement: 0, directories: 0, otherMarketing: 0,
      scanData,
    }),
  });
}

describe('spend-analysis — b01v competitor score', () => {
  it('says "not measured" for the competitor score — never score + 18', async () => {
    const res = await POST(makeReq({
      score: 50, industry: 'Dentist', city: 'Austin',
      competitor: 'Comp Dental', trustSignals: null,
    }));
    expect(res.status).toBe(200);
    expect(capturedPrompt).toContain('Competitor: Comp Dental');
    expect(capturedPrompt).toContain('Competitor score: not measured');
    expect(capturedPrompt).not.toContain('Competitor Score:');
    expect(capturedPrompt).not.toContain('~68');
    expect(capturedPrompt).not.toContain('68/100');
  });

  it('with no competitor, says none detected and mentions no score', async () => {
    const res = await POST(makeReq({
      score: 50, industry: 'Dentist', city: 'Austin',
      competitor: null, trustSignals: null,
    }));
    expect(res.status).toBe(200);
    expect(capturedPrompt).toContain('No top competitor detected yet.');
    expect(capturedPrompt).not.toContain('Competitor score:');
  });
});
