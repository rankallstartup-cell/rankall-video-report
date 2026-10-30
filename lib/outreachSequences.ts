// lib/outreachSequences.ts
// SINGLE source of truth for the COLD-OUTREACH multi-touch sequence (prospects
// from Apollo → outreach_targets). Driven by /api/cron/outreach-sequence.
//
// NOTE: this is separate from the existing-user nurture flow in
// /api/email-sequence + /api/trigger-sequence (which is keyed to signup date and
// a different audience). Do not merge the two — they target different people.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OutreachTouch {
  day: number;      // days after the prospect entered the sequence
  subject: string;  // {{vars}} rendered via renderTemplate
  body: string;     // plain-text body; the email builder wraps it in HTML
}

export const OUTREACH_SEQUENCE: OutreachTouch[] = [
  {
    day: 1,
    subject: 'I scanned {{business_name}} on ChatGPT — found something',
    body: `Hi {{owner_name}},

I ran {{business_name}} across 12 AI platforms (ChatGPT, Gemini, Perplexity and more) to see who they recommend for {{industry}} in {{city}}.

Your AI visibility score came back {{score}}/100.

I recorded a 1-minute audio walkthrough that walks through exactly what I found — and the one free fix that moves the needle most.

— Nandish, Rankall.io`,
  },
  {
    day: 3,
    subject: '{{business_name}}: AI sends your customers to {{competitor}}',
    body: `Hi {{owner_name}},

Following up on {{business_name}}'s AI report.

The core issue: when someone asks ChatGPT for "{{industry}} in {{city}}", {{competitor}} shows up — and you don't. That's real customers being routed elsewhere.

It's fixable, and Fix #1 is free. Your full report is here: {{report_url}}

— Nandish`,
  },
  {
    day: 5,
    subject: "The fix takes 20 min (and it's free)",
    body: `Hi {{owner_name}},

I know inbox clutter is real, so I'll keep this short.

The #1 thing holding {{business_name}} back on AI is structured data AI models trust. Adding it takes about 20 minutes and costs nothing.

Your report has the exact steps: {{report_url}}

— Nandish, Rankall.io`,
  },
  {
    day: 8,
    subject: '3 {{industry}} businesses fixed their AI score this week',
    body: `Hi {{owner_name}},

Three {{industry}} businesses in markets like {{city}} applied the fixes from their Rankall report this week — and started showing up in AI recommendations where a competitor used to own the answer.

The same playbook is waiting for {{business_name}}: {{report_url}}

— Nandish`,
  },
  {
    day: 14,
    subject: 'Should I remove you?',
    body: `Hi {{owner_name}},

I've reached out a few times about {{business_name}}'s AI visibility and haven't heard back — totally understandable if the timing's wrong.

I'll close your file after this. If you ever want the report, it'll be here: {{report_url}}

Just reply "keep me" and I'll leave it open.

— Nandish, Rankall.io`,
  },
];

// --- Outreach #7: sequence robustness (retry stale touches + A/B test Day-1 subjects) ---

// A touch whose scheduled time is older than this is too stale to send — it
// stays untouched (never retried, never marked). The boundary is INCLUSIVE:
// a touch scheduled exactly MAX_STALE_TOUCH_AGE_DAYS ago IS still retried.
// Single definition, used by the cron query and by isRetryableScheduledFor.
export const MAX_STALE_TOUCH_AGE_DAYS = 7;

// A 'sending' claim older than this is treated as crashed (the run that
// claimed it died before finishing) and may be reclaimed. Short enough that
// a crashed run recovers promptly, long enough that a slow-but-alive run is
// never stolen from. Re-sends are still safe: the Resend call carries an
// Idempotency-Key derived from the sequence row id.
export const CLAIM_STALE_AFTER_MS = 30 * 60 * 1000;

// Selection window for the sequence cron: touches scheduled within
// [now - MAX_STALE_TOUCH_AGE_DAYS, now]. Replaces the old 24h window.
export function selectionWindow(nowMs: number): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(nowMs - MAX_STALE_TOUCH_AGE_DAYS * 24 * 3600 * 1000).toISOString(),
    toIso: new Date(nowMs).toISOString(),
  };
}

// Pure predicate for the retry window, same rule as selectionWindow.
// Boundary: exactly MAX_STALE_TOUCH_AGE_DAYS old => retryable (inclusive).
export function isRetryableScheduledFor(scheduledForIso: string, nowMs: number): boolean {
  const t = Date.parse(scheduledForIso);
  if (Number.isNaN(t)) return false;
  return t <= nowMs && t >= nowMs - MAX_STALE_TOUCH_AGE_DAYS * 24 * 3600 * 1000;
}

// Day-1 A/B test: variant A is the EXISTING subject (control). Variant B is a
// second honest subject — no fake "Re:", no false urgency, no claim the email
// doesn't back up (it does contain the prospect's score/findings). Only Day-1
// subjects are ever varied; all other touches keep their fixed subject.
export interface Day1SubjectVariant { variant: 'A' | 'B'; subject: string; }

export const DAY1_SUBJECT_VARIANTS: Day1SubjectVariant[] = [
  { variant: 'A', subject: 'I scanned {{business_name}} on ChatGPT — found something' },
  { variant: 'B', subject: 'What AI tells customers about {{business_name}}' },
];

// Strict alternation across Day-1 sends: even index -> A, odd index -> B.
// The cron feeds this the count of already-sent Day-1 touches plus the number
// of Day-1 variants already assigned in the current batch.
export function day1VariantForIndex(index: number): 'A' | 'B' {
  return index % 2 === 0 ? 'A' : 'B';
}

// Override a touch's subject with its A/B variant. Day-1 only: for any other
// touch the input is returned unchanged, even if a variant is passed.
export function withVariantSubject(touch: OutreachTouch, variant: string | null | undefined): OutreachTouch {
  if (touch.day !== 1 || !variant) return touch;
  const match = DAY1_SUBJECT_VARIANTS.find(v => v.variant === variant);
  if (!match) return touch;
  return { ...touch, subject: match.subject };
}

export interface Day1VariantRow {
  variant: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export interface Day1VariantStats { sent: number; opened: number; clicked: number; openRate: number; clickRate: number; }

// Per-variant open/click stats for Day-1 sends, computed from sequence rows
// (opens/clicks are stamped on the row by /api/outreach/track). Rows with no
// variant (sent before the A/B test) group under 'unassigned' — never dropped.
export function summarizeDay1Variants(rows: Day1VariantRow[]): Record<string, Day1VariantStats> {
  const out: Record<string, { sent: number; opened: number; clicked: number }> = {};
  for (const r of rows) {
    const key = r.variant || 'unassigned';
    if (!out[key]) out[key] = { sent: 0, opened: 0, clicked: 0 };
    out[key].sent++;
    if (r.opened_at) out[key].opened++;
    if (r.clicked_at) out[key].clicked++;
  }
  const result: Record<string, Day1VariantStats> = {};
  for (const [key, v] of Object.entries(out)) {
    result[key] = {
      ...v,
      openRate: v.sent > 0 ? Math.round((v.opened / v.sent) * 10000) / 10000 : 0,
      clickRate: v.sent > 0 ? Math.round((v.clicked / v.sent) * 10000) / 10000 : 0,
    };
  }
  return result;
}

// --- DB helpers for the sequence cron (supabase client injected) ---

// True when the outreach_sequence_log table carries the #7 columns (variant +
// claimed_at). The cron probes once per run: when the migration hasn't been
// applied yet, the run degrades to the old behavior (no claims, no variants,
// default subject) instead of crashing.
export async function sequenceColumnsSupported(sb: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await sb.from('outreach_sequence_log').select('variant').limit(1);
    if (error) {
      const msg = String((error as { message?: string }).message ?? error);
      if (/column .* does not exist|PGRST204|Could not find/i.test(msg)) return false;
      // Any other error (network, etc.) is NOT a missing-column signal:
      // assume supported and let the real queries surface the problem.
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

// Atomically claim one sequence row for sending: a single UPDATE that flips
// status to 'sending' ONLY if the row is still in expectedStatus (and, for
// recovery, only if its claim is older than claimedBeforeIso). Returns true
// iff this caller won the claim. A lost claim (empty update) means another run
// owns the row — the caller must skip it, never send it.
export async function tryClaimSequenceRow(
  sb: SupabaseClient,
  rowId: string,
  opts: {
    expectedStatus: 'pending' | 'sending';
    claimedBeforeIso?: string;
    patch: { status: 'sending'; claimed_at: string; variant?: string | null };
  },
): Promise<boolean> {
  try {
    let q = sb.from('outreach_sequence_log').update(opts.patch).eq('id', rowId).eq('status', opts.expectedStatus);
    if (opts.claimedBeforeIso) {
      q = q.lt('claimed_at', opts.claimedBeforeIso);
    }
    const { data, error } = await q.select('id');
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
export function nextTouchAfter(day: number): OutreachTouch | null {
  return OUTREACH_SEQUENCE.find(t => t.day > day) ?? null;
}

export function touchForDay(day: number): OutreachTouch | null {
  return OUTREACH_SEQUENCE.find(t => t.day === day) ?? null;
}

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}
