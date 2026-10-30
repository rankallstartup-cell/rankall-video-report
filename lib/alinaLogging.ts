// ── Alina logging (A5) ──────────────────────────────────────────────────────
// Best-effort inserts into chat_sessions / chat_leads (migration:
// supabase/migrations/20261019_alina_chat_logging.sql).
//
// DEGRADES HONESTLY: if the tables do not exist yet (migration not run),
// if the DB is unreachable, or if getSupabaseAdmin throws, the helpers
// log ONE server-side warn line and resolve — they NEVER throw, so a
// missing logging table can never break the chat or lead flow. The chat
// route awaits them (one cheap insert), but a failure is invisible to
// the visitor: their message / lead still goes through.
//
// Privacy: chat_sessions stores NO message content and NO IP — only the
// session id, page, tools used, and outcome.
import { getSupabaseAdmin } from './supabase';
import type { LeadInput } from './alinaTools';

export type ChatOutcome =
  | 'scan_started'
  | 'fix_plan_shown'
  | 'lead_captured'
  | 'no_outcome'
  | 'error';

const OUTCOMES: ChatOutcome[] = ['scan_started', 'fix_plan_shown', 'lead_captured', 'no_outcome', 'error'];

function skipped(table: string, err: unknown): void {
  // One line, no stack — a missing table is an expected pre-migration
  // state, not an incident. Supabase errors are plain objects, NOT
  // Errors — String() on them prints "[object Object]", which is useless
  // in the logs, so pull .message out explicitly.
  let detail: string;
  if (err instanceof Error) detail = err.message;
  else if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    detail = (err as { message: string }).message;
  } else {
    detail = String(err);
  }
  console.warn(`[alina] ${table} logging skipped: ${detail}`);
}

export async function logChatSession(input: {
  sessionId: string;
  page: string;
  toolsUsed: string[];
  outcome: ChatOutcome;
}): Promise<void> {
  const outcome = OUTCOMES.includes(input.outcome) ? input.outcome : 'no_outcome';
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from('chat_sessions').insert({
      session_id: String(input.sessionId ?? '').slice(0, 128),
      page: String(input.page ?? '').slice(0, 512),
      tools_used: (input.toolsUsed ?? []).map((t) => String(t).slice(0, 64)),
      outcome,
    });
    if (error) skipped('chat_sessions', error);
  } catch (err) {
    skipped('chat_sessions', err);
  }
}

export async function logChatLead(input: {
  sessionId: string;
  lead: LeadInput;
  captured: boolean;
}): Promise<void> {
  const { lead } = input;
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from('chat_leads').insert({
      session_id: String(input.sessionId ?? '').slice(0, 128) || null,
      name: lead.name,
      email: lead.email,
      business: lead.business ?? null,
      summary: lead.summary,
      reason: lead.reason,
      captured: input.captured,
    });
    if (error) skipped('chat_leads', error);
  } catch (err) {
    skipped('chat_leads', err);
  }
}
