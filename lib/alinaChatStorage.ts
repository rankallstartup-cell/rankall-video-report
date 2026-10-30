// A9: sessionStorage persistence for the Alina chat. Pure + storage-
// injected so it is unit-testable without a DOM.
//
// Persisted: chat messages (role/content/blocks) + sessionId — nothing
// else. No password/payment fields exist in the chat, and nothing
// credential-shaped is ever written here. sessionStorage (per-tab,
// cleared when the tab closes), NOT localStorage.
// Shape-validated on load: any malformed entry is dropped, never
// trusted. Restored messages are capped (the route's sanitize caps
// bound what reaches the model anyway).
import type { ChatBlock } from '@/lib/alinaTools';

export const ALINA_CHAT_KEY = 'rankall_alina_chat';
const MAX_STORED_MESSAGES = 50;

export type StoredChatMessage = { role: 'user' | 'assistant'; content: string; blocks?: ChatBlock[] };
export type StoredChatState = { version: 1; sessionId: string; messages: StoredChatMessage[] };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isStoredMessage(m: unknown): m is StoredChatMessage {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return (o.role === 'user' || o.role === 'assistant') && typeof o.content === 'string';
}

export function loadChatState(storage: StorageLike | null | undefined): StoredChatState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ALINA_CHAT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (o.version !== 1 || typeof o.sessionId !== 'string' || !o.sessionId) return null;
    if (!Array.isArray(o.messages)) return null;
    const messages = o.messages.filter(isStoredMessage).slice(-MAX_STORED_MESSAGES);
    if (!messages.length) return null;
    return { version: 1, sessionId: o.sessionId, messages };
  } catch {
    return null;
  }
}

export function saveChatState(storage: StorageLike | null | undefined, state: StoredChatState): void {
  if (!storage) return;
  try {
    const trimmed: StoredChatState = {
      version: 1,
      sessionId: state.sessionId,
      messages: state.messages.slice(-MAX_STORED_MESSAGES),
    };
    storage.setItem(ALINA_CHAT_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full / unavailable — the chat still works, it just is not
    // persisted. Never throw from persistence.
  }
}

export function clearChatState(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(ALINA_CHAT_KEY);
  } catch {
    // ignore
  }
}
