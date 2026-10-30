// A10 — draft_fix_content (stored content / on-demand generation /
// signed-in-only saving) + get_verification_status (none / pending /
// done, ~7-day rule, no weekly language).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/fixes', () => ({ getFixesForScan: vi.fn() }));
vi.mock('@/lib/generateFix', () => ({ generateFixContent: vi.fn() }));
vi.mock('@/lib/planConfig', () => ({ isAdminUser: (email: string | null) => email === 'admin@rankall.io' }));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, limit: 15 })) }));
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock('@/lib/alinaLogging', () => ({ logChatSession: vi.fn(async () => {}), logChatLead: vi.fn(async () => {}) }));
vi.mock('@/lib/publicFormGuard', () => ({
  clientIp: vi.fn(() => '198.51.100.1'),
  allowByDbLimit: vi.fn(async () => true),
}));

import { executeAlinaTool } from '@/lib/alinaTools';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getFixesForScan } from '@/lib/fixes';
import { generateFixContent } from '@/lib/generateFix';
import { POST } from '@/app/api/chat/route';
import { logChatSession } from '@/lib/alinaLogging';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedReader = getFixesForScan as unknown as ReturnType<typeof vi.fn>;
const mockedGenerate = generateFixContent as unknown as ReturnType<typeof vi.fn>;
const mockedLogSession = logChatSession as unknown as ReturnType<typeof vi.fn>;

const SCAN_ID = 'e724e9f9-555f-492c-a633-7a553624f3fe';
const ANON = { userId: null, email: null };
const OWNER = { userId: 'owner-1', email: 'o@example.com' };
const DAY_MS = 24 * 60 * 60 * 1000;

const scanRow = {
  id: SCAN_ID, user_id: 'owner-1', input: 'Royal Lane Dental Center',
  overall_score: 2, mentioned_count: 1, competitor_name: null, competitor_score: null,
  recommendation_share: 9, failed_platforms: [], scan_reliable: true,
  user_business_name: 'Royal Lane Dental Center', business_city: 'Dallas, TX',
  location: 'Dallas, TX', created_at: '2026-10-18T17:34:28Z',
  industry: 'dentist', country_code: 'US',
};

function fixRow(overrides: Record<string, unknown>) {
  return {
    id: 'fix-1', scan_id: SCAN_ID, user_id: 'owner-1',
    fix_type: 'faq_schema', fix_title: 'FAQ Schema',
    status: 'pending_review', predicted_impact: 8, confidence: 80,
    difficulty: 'Easy', time_to_implement: '20-30 minutes',
    generated_content: 'Existing FAQ draft.', why_recommended: null,
    created_at: '2026-10-18T17:40:00Z',
    ...overrides,
  };
}

function fakeAdmin(opts: {
  outcomes?: unknown[]; outcomesError?: unknown;
  schedules?: unknown[]; schedulesError?: unknown;
  updateError?: unknown;
  scan?: Omit<typeof scanRow, 'user_id'> & { user_id: string | null };
} = {}) {
  const calls: Array<{ table: string; op: string }> = [];
  const chain = (result: { data: unknown; error: unknown }) => {
    const c: Record<string, unknown> = {
      select: () => c, eq: () => c, order: () => c,
      maybeSingle: async () => result,
      update: () => c,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return c;
  };
  return {
    calls,
    admin: {
      from: (table: string) => {
        if (table === 'rankall_scans') {
          return chain({ data: opts.scan ?? scanRow, error: null });
        }
        if (table === 'rankall_platform_results') {
          return chain({ data: [], error: null });
        }
        if (table === 'verified_outcomes') {
          return chain({ data: opts.outcomes ?? [], error: opts.outcomesError ?? null });
        }
        if (table === 'scheduled_rescans') {
          return chain({ data: opts.schedules ?? [], error: opts.schedulesError ?? null });
        }
        if (table === 'generated_fixes') {
          calls.push({ table, op: 'update' });
          return chain({ data: null, error: opts.updateError ?? null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe('draft_fix_content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAdmin.mockReturnValue(fakeAdmin().admin);
    mockedReader.mockResolvedValue([
      fixRow({}),
      fixRow({ id: 'fix-2', fix_type: 'bing_places', fix_title: 'Bing Places Optimization', generated_content: null }),
    ]);
    mockedGenerate.mockResolvedValue('Generated Bing draft.');
  });

  it('returns stored content; signed-in owner gets saved=true, anonymous gets saved=false + signup CTA', async () => {
    const owned = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'faq_schema' } }, OWNER);
    expect(owned.isError).toBe(false);
    expect(JSON.parse(owned.content).data).toMatchObject({ title: 'FAQ Schema', content: 'Existing FAQ draft.', saved: true, signupUrl: null });
    expect(mockedGenerate).not.toHaveBeenCalled();
    const anonScan = { ...scanRow, user_id: null };
    mockedAdmin.mockReturnValue(fakeAdmin().admin);
    // Ownerless scan: swap the scan row the fake admin returns.
    (mockedAdmin as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      from: (table: string) => {
        if (table === 'rankall_scans') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: anonScan, error: null }) }) }) };
        }
        if (table === 'rankall_platform_results') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });
    const anon = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'faq_schema' } }, ANON);
    expect(JSON.parse(anon.content).data).toMatchObject({ saved: false, signupUrl: '/signup', content: 'Existing FAQ draft.' });
  });

  it('generates on demand when the fix has no content; persists only for signed-in visitors', async () => {
    const owned = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'bing_places' } }, OWNER);
    expect(mockedGenerate).toHaveBeenCalledWith(expect.objectContaining({
      fixType: 'bing_places', businessName: 'Royal Lane Dental Center', industry: 'dentist', countryCode: 'US',
    }));
    expect(JSON.parse(owned.content).data).toMatchObject({ content: 'Generated Bing draft.', saved: true });
    // Anonymous: generated on-screen, NOT persisted (no update call).
    const fake = fakeAdmin();
    mockedAdmin.mockReturnValue(fake.admin);
    mockedReader.mockResolvedValue([fixRow({ id: 'fix-2', fix_type: 'bing_places', fix_title: 'Bing Places Optimization', generated_content: null })]);
    // Ownerless scan for the anonymous call.
    const anonAdmin = {
      from: (table: string) => {
        if (table === 'rankall_scans') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...scanRow, user_id: null }, error: null }) }) }) };
        }
        if (table === 'rankall_platform_results') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        if (table === 'generated_fixes') {
          fake.calls.push({ table, op: 'update' });
          return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    mockedAdmin.mockReturnValue(anonAdmin);
    const anon = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'bing_places' } }, ANON);
    expect(JSON.parse(anon.content).data).toMatchObject({ saved: false, signupUrl: '/signup' });
    expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('generation failure is a typed failure — never an invented draft', async () => {
    mockedGenerate.mockRejectedValue(new Error('AI service 401'));
    const r = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'bing_places' } }, OWNER);
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toContain('could not be generated');
    expect(JSON.parse(r.content)).not.toHaveProperty('data');
  });

  it('refuses fix types outside the fix plan and enforces ownership', async () => {
    const missing = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'made_up_fix' } }, OWNER);
    expect(JSON.parse(missing.content).error).toContain('get_fix_plan');
    expect(mockedGenerate).not.toHaveBeenCalled();
    const denied = await executeAlinaTool({ id: 't1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'faq_schema' } }, { userId: 'other', email: 'x@example.com' });
    expect(JSON.parse(denied.content).error).toBe('Scan not found.');
  });
});

describe('get_verification_status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReader.mockResolvedValue([]);
  });

  it('none when no fix was marked applied', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin({ outcomes: [] }).admin);
    const r = await executeAlinaTool({ id: 't1', name: 'get_verification_status', input: { scanId: SCAN_ID } }, OWNER);
    expect(JSON.parse(r.content).data).toMatchObject({ state: 'none', dueInDays: null, beforeScore: null, afterScore: null });
    expect(r.verification).toMatchObject({ state: 'none' });
  });

  it('pending with dueInDays from the open schedule row', async () => {
    const scheduledFor = new Date(Date.now() + 3 * DAY_MS + 60 * 60 * 1000).toISOString();
    mockedAdmin.mockReturnValue(fakeAdmin({
      outcomes: [{ fix_type: 'faq_schema', score_before: 2, score_after: null, is_verified: false, verified_at: null, created_at: new Date().toISOString() }],
      schedules: [{ scheduled_for: scheduledFor, completed_at: null, completed: false }],
    }).admin);
    const r = await executeAlinaTool({ id: 't1', name: 'get_verification_status', input: { scanId: SCAN_ID } }, OWNER);
    expect(JSON.parse(r.content).data).toMatchObject({ state: 'pending', dueInDays: 4, beforeScore: null, afterScore: null });
  });

  it('pending falls back to created_at + 7 days when the schedule table is missing', async () => {
    const created = new Date(Date.now() - 2 * DAY_MS).toISOString();
    mockedAdmin.mockReturnValue(fakeAdmin({
      outcomes: [{ fix_type: 'faq_schema', score_before: 2, score_after: null, is_verified: false, verified_at: null, created_at: created }],
      schedulesError: new Error('table missing'),
    }).admin);
    const r = await executeAlinaTool({ id: 't1', name: 'get_verification_status', input: { scanId: SCAN_ID } }, OWNER);
    expect(JSON.parse(r.content).data).toMatchObject({ state: 'pending', dueInDays: 5 });
  });

  it('done reports before/after scores from the verified outcome', async () => {
    mockedAdmin.mockReturnValue(fakeAdmin({
      outcomes: [
        { fix_type: 'faq_schema', score_before: 2, score_after: 31, is_verified: true, verified_at: new Date().toISOString(), created_at: new Date().toISOString() },
        { fix_type: 'jsonld', score_before: 2, score_after: null, is_verified: false, verified_at: null, created_at: new Date().toISOString() },
      ],
    }).admin);
    const r = await executeAlinaTool({ id: 't1', name: 'get_verification_status', input: { scanId: SCAN_ID } }, OWNER);
    expect(JSON.parse(r.content).data).toMatchObject({ state: 'done', beforeScore: 2, afterScore: 31 });
  });
});

describe('chat route A10 turn', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    // Anonymous caller: the scan must be ownerless to pass readScan.
    mockedAdmin.mockReturnValue(fakeAdmin({ scan: { ...scanRow, user_id: null } }).admin);
    mockedReader.mockResolvedValue([fixRow({})]);
  });
  afterEach(() => { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; });

  it('draft_fix_content round-trip attaches a DraftCard and logs fix_plan_shown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'tool_use', id: 'tu1', name: 'draft_fix_content', input: { scanId: SCAN_ID, fixType: 'faq_schema' } },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: [
        { type: 'text', text: 'Here is your draft.' },
      ] }), { status: 200 }));
    global.fetch = fetchMock as never;
    const res = await POST(new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Draft the FAQ Schema fix' }] }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Here is your draft.');
    expect(body.blocks).toEqual([expect.objectContaining({ kind: 'draft', draft: expect.objectContaining({ fixType: 'faq_schema', saved: false }) })]);
    expect(mockedLogSession).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['draft_fix_content'], outcome: 'fix_plan_shown' }));
  });
});
