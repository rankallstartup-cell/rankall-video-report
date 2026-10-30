import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// b009: the Apollo webhook's video-generation call sent only
// Content-Type — no Authorization — while generate-video-email requires
// `Bearer ${CRON_SECRET}` (401 otherwise). The video job never started
// from this path. The test drives the webhook end-to-end (Supabase +
// fetch stubbed) and asserts the video call carries the Bearer header.
const APOLLO_SECRET = 'apollo-test-secret';
const CRON_SECRET = 'cron-test-secret';

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
      insert: () => {
        if (table === 'outreach_targets') {
          return { select: () => ({ single: async () => ({ data: { id: 'target-1' } }) }) };
        }
        return Promise.resolve({});
      },
    }),
  }),
}));

import { POST } from '../webhooks/apollo/route';

function makeReq() {
  return new NextRequest('https://rankall.io/api/webhooks/apollo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-apollo-secret': APOLLO_SECRET,
    },
    body: JSON.stringify({
      name: 'Brite Smiles Dentistry',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      city: 'Flower Mound',
      state: 'TX',
      country: 'US',
      industry: 'Dentist',
      id: 'apollo-1',
    }),
  });
}

beforeEach(() => {
  fetchCalls.length = 0;
  process.env.APOLLO_WEBHOOK_SECRET = APOLLO_SECRET;
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.NEXT_PUBLIC_APP_URL = 'https://rankall.io';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (url.includes('/api/scan')) {
      return { ok: true, json: async () => ({ id: 'scan-1', score: 50, competitor_name: 'Comp' }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.APOLLO_WEBHOOK_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('Apollo webhook — b009 video-call auth', () => {
  it('sends Bearer CRON_SECRET on the video-generation call', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const videoCall = fetchCalls.find((c) => c.url.includes('/generate-video-email'));
    expect(videoCall).toBeDefined();
    const headers = videoCall!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${CRON_SECRET}`);
    expect(JSON.parse(videoCall!.init!.body as string)).toEqual({
      scan_id: 'scan-1',
      country_code: 'US',
    });
  });

  it('still rejects a bad Apollo secret', async () => {
    const req = new NextRequest('https://rankall.io/api/webhooks/apollo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-apollo-secret': 'wrong' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(fetchCalls.length).toBe(0);
  });
});

describe('fail-closed secrets (b0xx)', () => {
  it('apollo webhook rejects when APOLLO_WEBHOOK_SECRET is unset, even with no header', async () => {
    delete process.env.APOLLO_WEBHOOK_SECRET;
    const req = new NextRequest('https://rankall.io/api/webhooks/apollo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('apollo webhook rejects a wrong secret', async () => {
    process.env.APOLLO_WEBHOOK_SECRET = APOLLO_SECRET;
    const req = new NextRequest('https://rankall.io/api/webhooks/apollo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-apollo-secret': 'nope' }, body: JSON.stringify({ name: 'X' }),
    });
    expect((await POST(req)).status).toBe(401);
  });

  it('generate-video-email routes reject "Bearer undefined" when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    process.env.ELEVENLABS_API_KEY = 'x';
    const { POST: outreachVideo } = await import('../outreach/generate-video-email/route');
    const req = new NextRequest('https://rankall.io/api/outreach/generate-video-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer undefined' }, body: '{}',
    });
    expect((await outreachVideo(req)).status).toBe(401);
  });
});
