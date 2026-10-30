// lib/emailDedupe.ts
// ax74: lifecycle-email dedupe on email_sequence_log, which has a UNIQUE
// index on (user_id, trigger_event). The old callers INSERTed a bare event
// name ('monthly_roi', 'score_decay_warning', …) AFTER sending: every repeat
// of a per-scan / per-month email hit the unique index, supabase returned
// { error } (it does not throw, so the try/catch never fired), the dedupe row
// was never written for that instance, and the email re-sent on every run.
//
// Now: the trigger_event carries the per-instance discriminator
// (`decay:<scan_id>`, `monthly_roi:2026-10`, …), the row is CLAIMED first with
// upsert(onConflict, ignoreDuplicates) and its error is checked, and the email
// is sent only when this call created the row (insert-then-send). A failed
// send releases the claim so the next run can retry.

import type { SupabaseClient } from '@supabase/supabase-js';

/** `event` alone for once-per-user emails; `event:<discriminator>` otherwise. */
export function emailDedupeKey(event: string, discriminator?: string | number | null): string {
  const d = discriminator == null ? '' : String(discriminator).trim();
  return d ? `${event}:${d}` : event;
}

/** Calendar-month discriminator, UTC: '2026-10'. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** ISO-8601 week discriminator, UTC: '2026-W42'. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type ClaimResult = 'claimed' | 'duplicate' | 'error';

/**
 * Claim the right to send one email instance. Returns 'claimed' only when
 * this call created the log row; 'duplicate' when it already existed;
 * 'error' when the write failed (callers must NOT send — sending without a
 * recorded claim is exactly how duplicates happened).
 */
export async function claimEmailSend(
  sb: SupabaseClient,
  row: { userId: string; email: string; triggerEvent: string; scanId?: string | null },
): Promise<ClaimResult> {
  try {
    const { data, error } = await sb
      .from('email_sequence_log')
      .upsert(
        {
          user_id: row.userId,
          email: row.email,
          trigger_event: row.triggerEvent,
          scan_id: row.scanId ?? null,
          sent_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,trigger_event', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      console.error('[emailDedupe] claim failed:', row.triggerEvent, error.message);
      return 'error';
    }
    return Array.isArray(data) && data.length > 0 ? 'claimed' : 'duplicate';
  } catch (e) {
    console.error('[emailDedupe] claim threw:', row.triggerEvent, e);
    return 'error';
  }
}

/** Undo a claim after a failed send, so the next run retries it. */
export async function releaseEmailClaim(sb: SupabaseClient, userId: string, triggerEvent: string): Promise<void> {
  try {
    const { error } = await sb.from('email_sequence_log').delete()
      .eq('user_id', userId).eq('trigger_event', triggerEvent);
    if (error) console.error('[emailDedupe] release failed:', triggerEvent, error.message);
  } catch (e) {
    console.error('[emailDedupe] release threw:', triggerEvent, e);
  }
}
