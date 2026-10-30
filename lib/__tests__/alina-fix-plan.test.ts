// A8 — get_fix_plan: reads through lib/fixes.ts single reader, top 3 with
// canonical impact + effort + do-yourself / send-to-web-person grouping.
// Read-only (no apply, no direct generated_fixes access, no generated
// content or why_recommended in the output). Ownership enforced.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/fixes', () => ({ getFixesForScan: vi.fn() }));
vi.mock('@/lib/planConfig', () => ({ isAdminUser: (email: string | null) => email === 'admin@rankall.io' }));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, limit: 15 })) }));
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock('@/lib/alinaLogging', () => ({ logChatSession: vi.fn(async () => {}), logChatLead: vi.fn(async () => {}) }));

import { executeAlinaTool } from '@/lib/alinaTools';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getFixesForScan } from '@/lib/fixes';
import { canonicalFixImpact } from '@/lib/fixIntelligence';
import { POST } from '@/app/api/chat/route';
import { logChatSession } from '@/lib/alinaLogging';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedReader = getFixesForScan as unknown as ReturnType<typeof vi.fn>;
const mockedLogSession = logChatSession as unknown as ReturnType<typeof vi.fn>;

const SCAN_ID = 'e724e9f9-555f-492c-a633-7a553624f3fe';
const ANON = { userId: null, email: null };

function fixRow(overrides: Record<string, unknown>) {
  return {
    id: 'fix-1', scan_id: SCAN_ID, user_id: null,
    fix_type: 'gbp_optimizer', fix_title: 'Optimize your Google Business Profile',
    status: 'pending_review', predicted_impact: canonicalFixImpact('gbp_optimizer'),
    confidence: 80, difficulty: 'Easy', time_to_implement: '45-60 minutes',
    generated_content: 'SECRET CONTENT', why_recommended: 'SECRET WHY',
    created_at: '2026-10-18T17:40:00Z',
    ...overrides,
  };
}
// Reader returns impact-ranked (as the real reader does).
function fixRows() {
  return [
    fixRow({ id: 'fix-kp', fix_type: 'knowledge_panel', fix_title: 'Claim your Google Knowledge Panel', predicted_impact: canonicalFixImpact('knowledge_panel'), difficulty: 'Hard' }),
    fixRow({ id: 'fix-gbp', fix_type: 'gbp_optimizer', fix_title: 'Optimize your Google Business Profile', predicted_impact: canonicalFixImpact('gbp_optimizer'), difficulty: 'Easy' }),
    fixRow({ id: 'fix-cit', fix_type: 'citation_finder', fix_title: 'Fix your directory citations', predicted_impact: canonicalFixImpact('citation_finder'), difficulty: 'Medium' }),
    fixRow({ id: 'fix-rev', fix_type: 'review_response', fix_title: 'Respond to your recent reviews', predicted_impact: canonicalFixImpact('review_response'), difficulty: 'Easy' }),
    fixRow({ id: 'fix-red', fix_type: 'reddit_contribution', fix_title: 'Join the conversation on Reddit', predicted_impact: canonicalFixImpact('reddit_contribution'), difficulty: 'Medium', status: 'applied' }),
    fixRow({ id: 'fix-mys', fix_type: 'mystery_fix', fix_title: 'Mystery fix', predicted_impact: 5, difficulty: 'Medium' }),
  ];
}
function fakeAdmin(scan: unknown) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'rankall_scans') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scan, error: null }) }) }) };
      }
      if (table === 'rankall_platform_results') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}
const scanRow = {
  id: SCAN_ID, user_id: null, input: 'Royal Lane Dental Center',
  overall_score: 2, mentioned_count: 1, competitor_name: null, competitor_score: null,
  recommendation_share: 9, failed_platforms: [], scan_reliable: true,
  user_business_name: 'Royal Lane Dental Center', business_city: 'Dallas, TX',
  location: 'Dallas, TX', created_at: '2026-10-18T17:34:28Z',
};

describe('get_fix_plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow));
    mockedReader.mockResolvedValue(fixRows());
  });

  it('returns top 3 with canonical impact + effort + grouping, no locked content', async () => {
    const r = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID } }, ANON);
    expect(r.isError).toBe(false);
    const data = JSON.parse(r.content).data;
    expect(data.fixes).toHaveLength(3);
    expect(data.totalPending).toBe(5);
    expect(data.reportUrl).toBe(`/report/${SCAN_ID}`);
    // Canonical impacts pass through unchanged from the reader.
    expect(data.fixes[0]).toMatchObject({
      title: 'Claim your Google Knowledge Panel', fixType: 'knowledge_panel',
      impact: canonicalFixImpact('knowledge_panel'), effort: 'Hard', group: 'web',
    });
    expect(data.fixes[1]).toMatchObject({ fixType: 'gbp_optimizer', effort: 'Easy', group: 'diy' });
    expect(data.fixes[2]).toMatchObject({ fixType: 'citation_finder', effort: 'Medium', group: 'web' });
    // The applied row is excluded; the 4th pending (review_response) is
    // cut by the top-3 limit.
    expect(data.fixes.map((f: { fixType: string }) => f.fixType)).not.toContain('reddit_contribution');
    // No locked detail leaks: no generated content, no why_recommended.
    expect(r.content).not.toContain('SECRET');
    expect(JSON.stringify(data)).not.toContain('generated_content');
    expect(r.fixPlan).toBeDefined();
  });

  it('unknown impact stays null — never +0 (ax6v; real bing_places shape)', async () => {
    mockedReader.mockResolvedValue([fixRow({ id: 'fix-bing', fix_type: 'bing_places', fix_title: 'Bing Places Optimization', predicted_impact: null, difficulty: 'Easy' })]);
    const r = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID } }, ANON);
    expect(JSON.parse(r.content).data.fixes[0]).toMatchObject({ fixType: 'bing_places', impact: null });
    expect(r.content).not.toContain('+0');
  });

  it('caps limit at 3 and honours limit 1; unknown fix types group web', async () => {
    const big = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID, limit: 10 } }, ANON);
    expect(JSON.parse(big.content).data.fixes).toHaveLength(3);
    const one = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID, limit: 1 } }, ANON);
    expect(JSON.parse(one.content).data.fixes).toHaveLength(1);
    // mystery_fix (no metadata) groups web with its stored effort.
    mockedReader.mockResolvedValue([fixRow({ id: 'fix-mys', fix_type: 'mystery_fix', fix_title: 'Mystery fix', predicted_impact: 5, difficulty: 'Medium' })]);
    const mys = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID } }, ANON);
    expect(JSON.parse(mys.content).data.fixes[0]).toMatchObject({ group: 'web', effort: 'Medium' });
  });

  it('enforces ownership and is read-only (no direct generated_fixes access, no writes)', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin({ ...scanRow, user_id: 'owner-1' }));
    const denied = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID } }, { userId: 'other', email: 'x@example.com' });
    expect(JSON.parse(denied.content).error).toBe('Scan not found.');
    expect(mockedReader).not.toHaveBeenCalled();
    const allowed = await executeAlinaTool({ id: 't1', name: 'get_fix_plan', input: { scanId: SCAN_ID } }, { userId: 'owner-1', email: 'o@example.com' });
    expect(allowed.isError).toBe(false);
    const tables = (mockedAdmin.mock.results[0].value.from as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).not.toContain('generated_fixes');
    expect(new Set(tables).size).toBeGreaterThan(0);
  });
});

describe('chat route fix-plan turn', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockedAdmin.mockReturnValue(fakeAdmin(scanRow));
    mockedReader.mockResolvedValue(fixRows());
  });
  afterEach(() => { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; });

  it('get_fix_plan round-trip attaches a FixPlanCard and logs fix_plan_shown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'tool_use', id: 'tu1', name: 'get_fix_plan', input: { scanId: SCAN_ID } },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'text', text: 'Here is your fix plan.' },
      ] }), { status: 200 }));
    global.fetch = fetchMock as never;
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'What should I fix first?' }] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Here is your fix plan.');
    expect(body.blocks).toEqual([expect.objectContaining({
      kind: 'fix_plan',
      plan: expect.objectContaining({ scanId: SCAN_ID, fixes: expect.arrayContaining([expect.objectContaining({ fixType: 'knowledge_panel' })]) }),
    })]);
    expect(mockedLogSession).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['get_fix_plan'], outcome: 'fix_plan_shown' }));
  });
});
