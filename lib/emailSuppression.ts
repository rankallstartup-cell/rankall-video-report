// lib/emailSuppression.ts — CAN-SPAM suppression check for every
// non-transactional email. SERVER-ONLY (service-role key).
//
// /api/unsubscribe (the signed link in our emails) writes the address to
// `do_not_contact` (lib/outreachGuard.addToDoNotContact); bounces and spam
// complaints land there too. The older /api/outreach/unsubscribe writes
// `outreach_unsubscribes`. Before this helper only the outreach sender
// checked do_not_contact, so an unsubscribed user kept receiving weekly
// rescan / decay / ROI / milestone / win-back emails.
//
// Which sends MUST call shouldSkipEmail() first (= isEmailSuppressed() +
// the user's Settings toggle, see isPreferenceOptedOut below) — marketing +
// lifecycle:
//   rescan-weekly, cron/score-decay-warning, cron/monthly-roi,
//   cron/re-engagement, cron/referral-invite, milestone-email,
//   email-sequence, cron/winback-email, weekly report (lib/weeklyReport),
//   cron/personal-monitor (weekly + reputation alert), cron/agency-rescan
//   (agency summaries / alerts), trigger-rescans (competitor alerts),
//   scan route "fixes ready" email.
// Exempt — TRANSACTIONAL (a direct response to the user's own action or a
// billing / account notice the user must receive):
//   billing/webhook (receipts, payment failed), billing/refund,
//   cancel-subscription, user/pause-subscription confirmation,
//   cron/expire-trials (trial-ending / trial-ended billing notices),
//   welcome-email (account-created confirmation), send-report-email and
//   url-intelligence/email (sent because the user asked for that report),
//   auth emails (password reset / magic link — Supabase), contact/feedback
//   (to us), admin test sends. outreach/send-email has its own guard
//   (lib/outreachGuard.checkOutreachAllowed, which reads do_not_contact).
//
// Fails CLOSED: if the suppression list cannot be read, the email is
// treated as suppressed (a skipped lifecycle email is recoverable; mailing
// someone who unsubscribed is a compliance violation).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}

// PostgREST / Postgres "relation does not exist" — a table that was never
// created holds no suppressions (only for the legacy secondary list).
function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''));
}

/** Minimal client shape used here (lets tests pass a fake). */
export interface SuppressionReader {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: string[]): {
        limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
}

/**
 * True when `email` must NOT receive marketing / lifecycle email: it is on
 * the do_not_contact list (unsubscribe link, bounce, spam complaint) or the
 * legacy outreach_unsubscribes list. Fails closed on lookup errors and on an
 * empty / invalid address.
 */
export async function isEmailSuppressed(
  email: string | null | undefined,
  client?: SuppressionReader,
): Promise<boolean> {
  const raw = typeof email === 'string' ? email.trim() : '';
  if (!raw || !raw.includes('@')) return true;
  const variants = Array.from(new Set([raw.toLowerCase(), raw]));
  const sb = (client ?? (admin() as unknown as SuppressionReader));
  try {
    const dnc = await sb.from('do_not_contact').select('email').in('email', variants).limit(1);
    if (dnc.error) {
      console.error('[emailSuppression] do_not_contact lookup failed — suppressing (fail closed):', dnc.error);
      return true;
    }
    if (Array.isArray(dnc.data) && dnc.data.length > 0) return true;

    const legacy = await sb.from('outreach_unsubscribes').select('email').in('email', variants).limit(1);
    if (legacy.error) {
      if (isMissingTable(legacy.error)) return false;
      console.error('[emailSuppression] outreach_unsubscribes lookup failed — suppressing (fail closed):', legacy.error);
      return true;
    }
    return Array.isArray(legacy.data) && legacy.data.length > 0;
  } catch (err) {
    console.error('[emailSuppression] lookup threw — suppressing (fail closed):', err);
    return true;
  }
}

// ── Per-user email preferences (Settings → Email notifications) ──────────
// app/settings/page.tsx upserts a `user_preferences` row (user_id PK) with
// one boolean per category. Before this helper no sender read it, so the
// toggles did nothing. Only an EXPLICIT false opts out: a user who never
// opened Settings has no row and keeps the emails they had before.

export type EmailPreference =
  | 'weekly_report'
  | 'competitor_alerts'
  | 'milestone_emails'
  | 'fix_recommendations'
  | 'marketing_emails';

const EMAIL_PREFERENCES: readonly EmailPreference[] = [
  'weekly_report', 'competitor_alerts', 'milestone_emails', 'fix_recommendations', 'marketing_emails',
];

/** Minimal client shape used by isPreferenceOptedOut (lets tests pass a fake). */
export interface PreferenceReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

/**
 * True when the user turned `pref` OFF in Settings (row exists and the column
 * is explicitly false). No row / no user id / table not migrated → false.
 * Any other lookup error → true (fail closed, logged).
 */
export async function isPreferenceOptedOut(
  userId: string | null | undefined,
  pref: EmailPreference,
  client?: PreferenceReader,
): Promise<boolean> {
  if (!EMAIL_PREFERENCES.includes(pref)) return true;
  if (typeof userId !== 'string' || !userId.trim()) return false;
  const sb = (client ?? (admin() as unknown as PreferenceReader));
  try {
    const { data, error } = await sb.from('user_preferences').select(pref).eq('user_id', userId).maybeSingle();
    if (error) {
      if (isMissingTable(error)) return false;
      console.error(`[emailSuppression] user_preferences lookup failed for ${pref} — skipping (fail closed):`, error);
      return true;
    }
    if (!data) return false;
    return data[pref] === false;
  } catch (err) {
    console.error(`[emailSuppression] user_preferences lookup threw for ${pref} — skipping (fail closed):`, err);
    return true;
  }
}

/**
 * One-line gate for every non-transactional send: true when the address is
 * suppressed (unsubscribe / bounce / complaint) OR the user switched this
 * email category off in Settings.
 */
export async function shouldSkipEmail(
  target: { email: string | null | undefined; userId?: string | null },
  pref: EmailPreference,
  clients?: { suppression?: SuppressionReader; preferences?: PreferenceReader },
): Promise<boolean> {
  if (await isEmailSuppressed(target.email, clients?.suppression)) return true;
  return isPreferenceOptedOut(target.userId, pref, clients?.preferences);
}
