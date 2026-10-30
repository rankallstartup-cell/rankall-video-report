// A9 — sessionStorage persistence: round-trips messages + sessionId,
// drops malformed entries, caps restored history, never throws.
import { describe, it, expect } from 'vitest';
import { loadChatState, saveChatState, clearChatState } from '@/lib/alinaChatStorage';

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    _store: store,
  };
}

describe('alinaChatStorage', () => {
  it('round-trips messages + sessionId and clears', () => {
    const storage = fakeStorage();
    saveChatState(storage, {
      version: 1,
      sessionId: 'sess-1',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there', blocks: [{ kind: 'pricing', tiers: [], trialNote: 't' } as never] },
      ],
    });
    const loaded = loadChatState(storage);
    expect(loaded?.sessionId).toBe('sess-1');
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[1].blocks?.[0]).toMatchObject({ kind: 'pricing' });
    clearChatState(storage);
    expect(loadChatState(storage)).toBeNull();
  });

  it('drops malformed entries and never throws', () => {
    expect(loadChatState(fakeStorage({ rankall_alina_chat: 'not json' }))).toBeNull();
    expect(loadChatState(fakeStorage({ rankall_alina_chat: JSON.stringify({ version: 2, sessionId: 'x', messages: [] }) }))).toBeNull();
    expect(loadChatState(fakeStorage({ rankall_alina_chat: JSON.stringify({ version: 1, sessionId: 'x', messages: [{ role: 'hacker', content: 'x' }] }) }))).toBeNull();
    expect(loadChatState(null)).toBeNull();
    expect(() => saveChatState(null, { version: 1, sessionId: 'x', messages: [] })).not.toThrow();
  });

  it('caps restored history at 50 messages', () => {
    const storage = fakeStorage();
    const messages = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: `m${i}` }));
    saveChatState(storage, { version: 1, sessionId: 's', messages });
    expect(loadChatState(storage)?.messages).toHaveLength(50);
    expect(loadChatState(storage)?.messages[0].content).toBe('m30');
  });

  it('never persists anything credential-shaped beyond messages + sessionId', () => {
    const storage = fakeStorage();
    saveChatState(storage, { version: 1, sessionId: 's', messages: [{ role: 'user', content: 'hi' }] });
    const raw = storage._store.get('rankall_alina_chat') ?? '';
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['messages', 'sessionId', 'version']);
  });
});
