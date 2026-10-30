// A5 — chat_sessions / chat_leads logging. The helpers NEVER throw: a
// missing table (migration not run), an unreachable DB, or a throwing
// admin client all degrade to one server-side warn line, and the chat /
// lead flow continues. The route tests prove the flow survives; these
// tests prove the helpers insert the right rows when the DB works, and
// swallow failures when it doesn't.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logChatSession, logChatLead } from '@/lib/alinaLogging';
import { getSupabaseAdmin } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;

function fakeDb(insertResult: { error: unknown }): { from: ReturnType<typeof vi.fn> } {
  const insert = vi.fn(async () => insertResult);
  return { from: vi.fn(() => ({ insert })) };
}

const LEAD = {
  name: 'Dana',
  email: 'dana@example.com',
  business: 'Bright Smile',
  summary: 'Wants a demo',
  reason: 'demo' as const,
};

describe('logChatSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('inserts session id, page, tools used, outcome — no message content, no IP', async () => {
    const db = fakeDb({ error: null });
    mockedAdmin.mockReturnValue(db);
    await logChatSession({ sessionId: 's-1', page: '/pricing', toolsUsed: ['get_pricing'], outcome: 'no_outcome' });
    expect(db.from).toHaveBeenCalledWith('chat_sessions');
    const row = (db.from as ReturnType<typeof vi.fn>).mock.results[0].value.insert.mock.calls[0][0];
    expect(row).toEqual({ session_id: 's-1', page: '/pricing', tools_used: ['get_pricing'], outcome: 'no_outcome' });
    expect(JSON.stringify(row)).not.toContain('Hello');
  });

  it('coerces an unknown outcome to no_outcome', async () => {
    const db = fakeDb({ error: null });
    mockedAdmin.mockReturnValue(db);
    await logChatSession({ sessionId: 's-1', page: '/', toolsUsed: [], outcome: 'bogus' as never });
    const row = (db.from as ReturnType<typeof vi.fn>).mock.results[0].value.insert.mock.calls[0][0];
    expect(row.outcome).toBe('no_outcome');
  });

  it('resolves (never throws) when the insert errors — table missing', async () => {
    const db = fakeDb({ error: { message: 'Could not find the table', code: 'PGRST205' } });
    mockedAdmin.mockReturnValue(db);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logChatSession({ sessionId: 's-1', page: '/', toolsUsed: [], outcome: 'no_outcome' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('chat_sessions logging skipped');
    // Supabase errors are plain objects — the line must carry the real
    // message, not "[object Object]".
    expect(warn.mock.calls[0][0]).toContain('Could not find the table');
    expect(warn.mock.calls[0][0]).not.toContain('[object Object]');
    warn.mockRestore();
  });

  it('resolves (never throws) when getSupabaseAdmin throws', async () => {
    mockedAdmin.mockImplementation(() => { throw new Error('env missing'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logChatSession({ sessionId: 's-1', page: '/', toolsUsed: [], outcome: 'no_outcome' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('logChatLead', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('inserts the lead row with the capture outcome', async () => {
    const db = fakeDb({ error: null });
    mockedAdmin.mockReturnValue(db);
    await logChatLead({ sessionId: 's-1', lead: LEAD, captured: true });
    expect(db.from).toHaveBeenCalledWith('chat_leads');
    const row = (db.from as ReturnType<typeof vi.fn>).mock.results[0].value.insert.mock.calls[0][0];
    expect(row).toEqual({
      session_id: 's-1', name: 'Dana', email: 'dana@example.com',
      business: 'Bright Smile', summary: 'Wants a demo', reason: 'demo', captured: true,
    });
  });

  it('resolves (never throws) when the insert errors', async () => {
    const db = fakeDb({ error: { message: 'table missing', code: '42P01' } });
    mockedAdmin.mockReturnValue(db);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logChatLead({ sessionId: 's-1', lead: LEAD, captured: false })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('chat_leads logging skipped');
    warn.mockRestore();
  });
});
