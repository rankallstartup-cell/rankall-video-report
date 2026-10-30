// A7 — scan tools: start_free_scan dispatches the real scan route with
// the visitor's own cookies + trusted IP; get_scan_summary / explain_score
// read the stored scan + platform rows; ownership is enforced (not-found
// and not-owned return the SAME message); partial scans name the missing
// platforms; the score is re-derived from the platform rows.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockScanPOST } = vi.hoisted(() => ({ mockScanPOST: vi.fn() }));
vi.mock('@/app/api/scan/route', () => ({ POST: mockScanPOST }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/planConfig', () => ({ isAdminUser: (email: string | null) => email === 'admin@rankall.io' }));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, limit: 15 })) }));
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock('@/lib/alinaLogging', () => ({ logChatSession: vi.fn(async () => {}), logChatLead: vi.fn(async () => {}) }));

import { executeAlinaTool } from '@/lib/alinaTools';
import { getSupabaseAdmin } from '@/lib/supabase';
import { POST } from '@/app/api/chat/route';
import { logChatSession } from '@/lib/alinaLogging';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedLogSession = logChatSession as unknown as ReturnType<typeof vi.fn>;

const SCAN_ID = 'e724e9f9-555f-492c-a633-7a553624f3fe';
const WEIGHTS: Array<[string, number]> = [
  ['ChatGPT', 25], ['Gemini', 18], ['Perplexity', 15], ['Claude', 10], ['Copilot', 9],
  ['Meta AI', 7], ['Mistral', 6], ['DeepSeek', 4], ['Kimi', 3], ['You.com', 2], ['Grok', 1],
];
function platformRows(overrides: Record<string, Partial<{ mentioned: boolean; mention_rate: number; error: string | null }>> = {}) {
  return WEIGHTS.map(([platform, weight]) => ({
    platform, weight,
    mentioned: overrides[platform]?.mentioned ?? false,
    mention_rate: overrides[platform]?.mention_rate ?? 0,
    // Grok did not respond in this fixture (matches the scan row's
    // failed_platforms: ['Grok']) unless the test overrides it.
    error: overrides[platform]?.error ?? (platform === 'Grok' ? 'timeout' : null),
  }));
}
function scanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SCAN_ID, user_id: null, input: 'Royal Lane Dental Center',
    overall_score: 2, mentioned_count: 1,
    competitor_name: 'Bright Smile Dental', competitor_score: null,
    recommendation_share: 9, failed_platforms: ['Grok'], scan_reliable: true,
    user_business_name: 'Royal Lane Dental Center', business_city: 'Dallas, TX',
    location: 'Dallas, TX', created_at: '2026-10-18T17:34:28Z',
    ...overrides,
  };
}
function fakeAdmin(row: unknown, rows: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'rankall_scans') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) };
      }
      if (table === 'rankall_platform_results') {
        return { select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}
const CTX = { headers: { cookie: 'sb-session=abc', 'x-vercel-ip-country': 'US' }, clientIp: '198.51.100.7' };
const ANON = { userId: null, email: null };

describe('get_scan_summary', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns the scan card from stored rows: score, mentioned, partial + missing platforms', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow(), platformRows({ ChatGPT: { mentioned: true, mention_rate: 0.08 } })));
    const r = await executeAlinaTool({ id: 't1', name: 'get_scan_summary', input: { scanId: SCAN_ID } }, ANON);
    expect(r.isError).toBe(false);
    const data = JSON.parse(r.content).data;
    expect(data).toMatchObject({
      scanId: SCAN_ID, businessName: 'Royal Lane Dental Center', score: 2,
      mentionedCount: 1, totalPlatforms: 12, respondedCount: 10, partial: true,
      missingPlatforms: ['Grok'],
      topCompetitors: [{ name: 'Bright Smile Dental', score: null }],
      reportUrl: `/report/${SCAN_ID}`,
    });
    expect(r.scanCard).toBeDefined();
    expect(data.platforms).toHaveLength(11);
    expect(data.platforms.find((p: { name: string }) => p.name === 'Grok').status).toBe('not_responded');
    expect(data.platforms.find((p: { name: string }) => p.name === 'ChatGPT').status).toBe('mentioned');
  });

  it('not-found, malformed id, and not-owned all return the SAME message', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin(null, []));
    for (const scanId of ['no-such-id', 'not-a-uuid', SCAN_ID]) {
      const r = await executeAlinaTool({ id: 't1', name: 'get_scan_summary', input: { scanId } }, ANON);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe('Scan not found.');
    }
    // Owned by someone else, caller is not the owner and not an admin.
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow({ user_id: 'owner-1' }), []));
    const other = await executeAlinaTool({ id: 't1', name: 'get_scan_summary', input: { scanId: SCAN_ID } }, { userId: 'someone-else', email: 'x@example.com' });
    expect(JSON.parse(other.content).error).toBe('Scan not found.');
    // Owner and admin can read it.
    const owner = await executeAlinaTool({ id: 't1', name: 'get_scan_summary', input: { scanId: SCAN_ID } }, { userId: 'owner-1', email: 'o@example.com' });
    expect(owner.isError).toBe(false);
    const admin = await executeAlinaTool({ id: 't1', name: 'get_scan_summary', input: { scanId: SCAN_ID } }, { userId: 'admin-id', email: 'admin@rankall.io' });
    expect(admin.isError).toBe(false);
  });
});

describe('explain_score', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('re-derives the score from the platform rows and reports stored vs recomputed', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow(), platformRows({ ChatGPT: { mentioned: true, mention_rate: 0.08 } })));
    const r = await executeAlinaTool({ id: 't1', name: 'explain_score', input: { scanId: SCAN_ID } }, ANON);
    const data = JSON.parse(r.content).data;
    // ChatGPT 25 × 0.08 = 2.0; responding weight 99 → round(2/99×100) = 2.
    expect(data).toMatchObject({ storedScore: 2, recomputedScore: 2, respondingWeight: 99, weightedSum: 2, match: true });
    expect(data.platforms.find((p: { name: string }) => p.name === 'ChatGPT').contribution).toBe(2);
    expect(data.formula).toContain('responding');
  });

  it('surfaces a stored-vs-recomputed mismatch instead of hiding it', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow({ overall_score: 90 }), platformRows({ ChatGPT: { mentioned: true, mention_rate: 0.08 } })));
    const r = await executeAlinaTool({ id: 't1', name: 'explain_score', input: { scanId: SCAN_ID } }, ANON);
    const data = JSON.parse(r.content).data;
    expect(data.storedScore).toBe(90);
    expect(data.recomputedScore).toBe(2);
    expect(data.match).toBe(false);
  });
});

describe('start_free_scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanPOST.mockImplementation(async (req: NextRequest) => {
      const body = await req.json();
      captured.reqBody = body;
      captured.forwardedFor = req.headers.get('x-forwarded-for');
      captured.cookie = req.headers.get('cookie');
      return NextResponse.json({
        success: true, scanId: SCAN_ID, overallScore: 2, mentionedCount: 1,
        partial: true, platformsCompleted: 10, platformsTotal: 11,
        failedPlatforms: ['Grok'], competitor: 'Bright Smile Dental',
      });
    });
  });
  const captured: { reqBody?: unknown; forwardedFor?: string | null; cookie?: string | null } = {};

  it('dispatches the real scan route with the visitor cookies + trusted IP, returns a ScanCard', async () => {
    const r = await executeAlinaTool(
      { id: 't1', name: 'start_free_scan', input: { businessName: 'Royal Lane Dental Center', city: 'Dallas, TX' } },
      ANON, CTX,
    );
    expect(r.isError).toBe(false);
    expect(captured.reqBody).toMatchObject({
      input: 'Royal Lane Dental Center, Dallas, TX',
      detectedCity: 'Dallas, TX',
    });
    expect((captured.reqBody as Record<string, unknown>).userId).toBeUndefined();
    expect(captured.forwardedFor).toBe('198.51.100.7');
    expect(captured.cookie).toBe('sb-session=abc');
    expect(r.scanCard).toMatchObject({
      scanId: SCAN_ID, score: 2, mentionedCount: 1, partial: true,
      missingPlatforms: ['Grok'], reportUrl: `/report/${SCAN_ID}`,
    });
  });

  it('category queries compose a category input', async () => {
    await executeAlinaTool(
      { id: 't1', name: 'start_free_scan', input: { category: 'dentist', city: 'Austin, TX' } },
      ANON, CTX,
    );
    expect(captured.reqBody).toMatchObject({ input: 'best dentist in Austin, TX' });
  });

  it('business_not_found is a typed failure telling the model to ask only for the correction', async () => {
    mockScanPOST.mockResolvedValueOnce(NextResponse.json(
      { success: false, error: 'business_not_found', message: 'We couldn\'t verify "Zqwxk, Nowhere" as a real business.' },
      { status: 404 },
    ));
    const r = await executeAlinaTool(
      { id: 't1', name: 'start_free_scan', input: { businessName: 'Zqwxk', city: 'Nowhere' } },
      ANON, CTX,
    );
    expect(r.isError).toBe(true);
    const content = JSON.parse(r.content);
    expect(content.error).toBe('business_not_found');
    expect(content.message).toContain('preserved');
    expect(content.message).toContain('exact name + city');
  });

  it('rate_limited maps the scan route 429 to retryAfterHours 24', async () => {
    mockScanPOST.mockResolvedValueOnce(NextResponse.json(
      { error: 'Free scan limit reached (3/day). Sign in for 50 scans/day.', remaining: 0, limit: 3 },
      { status: 429 },
    ));
    const r = await executeAlinaTool(
      { id: 't1', name: 'start_free_scan', input: { businessName: 'Royal Lane Dental Center', city: 'Dallas, TX' } },
      ANON, CTX,
    );
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content)).toMatchObject({ error: 'rate_limited', retryAfterHours: 24 });
  });

  it('validates input before dispatching (city required, category-or-name, http(s) URL)', async () => {
    for (const input of [
      { businessName: 'Royal Lane' },
      { city: 'Dallas, TX' },
      { businessName: 'Royal Lane', city: 'Dallas, TX', websiteUrl: 'javascript:alert(1)' },
    ]) {
      const r = await executeAlinaTool({ id: 't1', name: 'start_free_scan', input }, ANON, CTX);
      expect(r.isError).toBe(true);
    }
    expect(mockScanPOST).not.toHaveBeenCalled();
  });
});

describe('chat route scan turn', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockScanPOST.mockImplementation(async () => NextResponse.json({
      success: true, scanId: SCAN_ID, overallScore: 2, mentionedCount: 1,
      partial: true, platformsCompleted: 10, platformsTotal: 11,
      failedPlatforms: ['Grok'], competitor: 'Bright Smile Dental',
    }));
  });
  afterEach(() => { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; });

  it('start_free_scan round-trip attaches a ScanCard and logs scan_started', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'tool_use', id: 'tu1', name: 'start_free_scan', input: { businessName: 'Royal Lane Dental Center', city: 'Dallas, TX' } },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'text', text: 'Here is your scan.' },
      ] }), { status: 200 }));
    global.fetch = fetchMock as never;
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.9', cookie: 'sb-session=abc' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Scan Royal Lane Dental Center in Dallas, TX' }] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Here is your scan.');
    expect(body.blocks).toEqual([expect.objectContaining({ kind: 'scan', scan: expect.objectContaining({ scanId: SCAN_ID, score: 2 }) })]);
    expect(mockedLogSession).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['start_free_scan'], outcome: 'scan_started' }));
  });
});
