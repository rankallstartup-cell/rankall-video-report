import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { checkOutreachAllowed, recordEmailSent } from '@/lib/outreachGuard';
import { getConfiguredColdDomains, selectColdSendingDomain } from '@/lib/outreachSendingDomains';
import {
  touchForDay,
  nextTouchAfter,
  selectionWindow,
  isRetryableScheduledFor,
  day1VariantForIndex,
  withVariantSubject,
  sequenceColumnsSupported,
  tryClaimSequenceRow,
  CLAIM_STALE_AFTER_MS,
} from '@/lib/outreachSequences';
import { buildTouchEmail, type TouchTarget } from '@/lib/outreachEmail';
import { resolvePublicReportUrl } from '@/lib/publicShare';
import { OUTREACH_INBOX_ADDRESS } from '@/lib/outreachReplies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BATCH = 50;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

async function slack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); } catch { /* non-fatal */ }
}

// Drives the cold-outreach sequence: sends pending touches that are due, honours
// the outreach guard (DNC / domain limits / bounce), stops the sequence on click
// or unsubscribe, and schedules the next touch. Cold prospects only.
//
// Outreach #7 — sequence robustness:
// - Retry window is 7 days (was 24h): pending touches scheduled up to 7 days
//   ago are still sent. Older than 7 days stays untouched.
// - Atomic claim: each row is flipped pending -> 'sending' in a single UPDATE
//   that only succeeds if the row is still pending, so two concurrent runs or
//   a retry can never send the same touch twice. Stale 'sending' claims
//   (older than 30 min — the run that claimed them crashed) are reclaimed.
//   The Resend call also carries Idempotency-Key `outreach-seq-<row id>`, so
//   even a crash between send and mark-sent cannot produce a second email.
// - Day-1 A/B test: Day-1 touches alternate variant A (existing subject) /
//   B (alternate honest subject). Variant is stored on the row and on the
//   sent event, so open/click can be reported by variant.
// - If the #7 migration hasn't run yet (no variant/claimed_at columns), the
//   run degrades to the old behavior (no claims, no variants, default
//   subject) instead of crashing.
export async function GET(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  const sb = admin();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const window = selectionWindow(nowMs);
  const staleClaimCutoffIso = new Date(nowMs - CLAIM_STALE_AFTER_MS).toISOString();
  const retryCutoffMs = nowMs - 24 * 3600 * 1000; // for the `retried` counter only

  const columnsSupported = await sequenceColumnsSupported(sb);
  if (!columnsSupported) {
    console.warn('[outreach-sequence] variant/claimed_at columns missing (migration not run) — running in legacy mode: no claims, no variants, default Day-1 subject.');
  }

  // Recovery: stale 'sending' claims from a crashed run (claim older than
  // 30 min), still inside the 7-day retry window. Too-stale claims stay
  // untouched, exactly like too-stale pending rows.
  let recoveredRows: Array<Record<string, unknown>> = [];
  if (columnsSupported) {
    try {
      const { data, error } = await sb
        .from('outreach_sequence_log')
        .select('*')
        .eq('status', 'sending')
        .lt('claimed_at', staleClaimCutoffIso)
        .gte('scheduled_for', window.fromIso)
        .lte('scheduled_for', window.toIso)
        .order('scheduled_for', { ascending: true })
        .limit(BATCH);
      if (error) {
        console.warn('[outreach-sequence] recovery select failed, skipping recovery:', error.message);
      } else {
        recoveredRows = (data ?? []) as Array<Record<string, unknown>>;
      }
    } catch (err) {
      console.warn('[outreach-sequence] recovery select threw, skipping recovery:', err instanceof Error ? err.message : String(err));
    }
  }

  const { data: pending } = await sb
    .from('outreach_sequence_log')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', window.toIso)
    .gte('scheduled_for', window.fromIso)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH);

  // Day-1 variant counter: strict alternation across Day-1 sends, seeded by
  // the number of Day-1 touches already sent.
  let day1Counter = 0;
  if (columnsSupported) {
    try {
      const { count, error } = await sb
        .from('outreach_sequence_log')
        .select('id', { count: 'exact', head: true })
        .eq('sequence_day', 1)
        .eq('status', 'sent');
      if (!error && typeof count === 'number') day1Counter = count;
    } catch {
      console.warn('[outreach-sequence] Day-1 sent count failed, starting variant counter at 0.');
    }
  }

  let sent = 0, skippedDnc = 0, skippedLimit = 0, stopped = 0, errors = 0;
  let retried = 0, recovered = 0;
  const day1Variants: Record<string, number> = { A: 0, B: 0 };

  // Recovered (previously claimed) rows first — they are the oldest — then
  // freshly pending rows.
  const queue: Array<Record<string, any>> = [
    ...recoveredRows,
    ...((pending ?? []) as Array<Record<string, any>>),
  ];

  for (const row of queue) {
    // Defensive: never process a row outside the retry window, even if the
    // query filters drifted. Future-scheduled and >7-day-old rows stay untouched.
    if (!isRetryableScheduledFor(String(row.scheduled_for), nowMs)) continue;
    const isRetriedRow = Date.parse(String(row.scheduled_for)) < retryCutoffMs;

    // Atomic claim (skipped in legacy mode — old behavior: row stays pending
    // until it is marked sent/skipped/stopped/error).
    let assignedVariant: string | null = null;
    if (columnsSupported) {
      if (row.sequence_day === 1) {
        assignedVariant = (row.variant as string | null) ?? day1VariantForIndex(day1Counter++);
      }
      const isRecovery = row.status === 'sending';
      const claimed = await tryClaimSequenceRow(sb, String(row.id), {
        expectedStatus: isRecovery ? 'sending' : 'pending',
        ...(isRecovery ? { claimedBeforeIso: staleClaimCutoffIso } : {}),
        patch: {
          status: 'sending',
          claimed_at: nowIso,
          ...(assignedVariant ? { variant: assignedVariant } : {}),
        },
      });
      if (!claimed) continue; // another run owns this row — never send it
      if (isRecovery) recovered++;
      if (isRetriedRow) retried++;
      if (assignedVariant) day1Variants[assignedVariant] = (day1Variants[assignedVariant] ?? 0) + 1;
    } else if (isRetriedRow) {
      // Legacy mode: no claim, so count the retry here.
      retried++;
    }

    const variantToStore: string | null = assignedVariant ?? (row.variant as string | null) ?? null;
    const baseTouch = touchForDay(row.sequence_day);
    const touch = baseTouch ? withVariantSubject(baseTouch, variantToStore) : null;
    if (!touch) { await sb.from('outreach_sequence_log').update({ status: 'skipped', error: 'no_touch_for_day' }).eq('id', row.id); continue; }

    // Load the prospect.
    const { data: target } = await sb
      .from('outreach_targets')
      .select('id, business_name, owner_name, email, city, industry, rankall_score, competitor_name, scan_id, video_url, report_url, status')
      .eq('id', row.target_id)
      .single();
    if (!target?.email) { await sb.from('outreach_sequence_log').update({ status: 'skipped', error: 'no_target_email' }).eq('id', row.id); continue; }

    // STOP conditions: the prospect clicked any prior touch, replied, or converted.
    const { data: clickedRows } = await sb
      .from('outreach_sequence_log')
      .select('id')
      .eq('target_id', row.target_id)
      .not('clicked_at', 'is', null)
      .limit(1);
    const targetStatus = (target.status || '').toLowerCase();
    if ((clickedRows && clickedRows.length > 0) || ['replied', 'converted', 'unsubscribed', 'stopped'].includes(targetStatus)) {
      await sb.from('outreach_sequence_log').update({ status: 'stopped', error: 'sequence_stopped' }).eq('id', row.id);
      stopped++;
      continue;
    }

    // Guard: DNC list, per-domain warming/pause, daily send limit. #4: the
    // sending domain is picked from the configured cold domains (rankall.io
    // when none are configured). If every configured domain is blocked,
    // the send is blocked — never silently sent from rankall.io.
    const selection = await selectColdSendingDomain(
      target.email,
      (domain) => checkOutreachAllowed(target.email, domain),
      getConfiguredColdDomains(),
    );
    if (!selection.allowed) {
      // Leave DNC/paused rows stopped; leave rate-limited rows pending to retry tomorrow.
      if (selection.dnc || selection.allPaused) {
        await sb.from('outreach_sequence_log').update({ status: 'stopped', error: selection.reason }).eq('id', row.id);
        skippedDnc++;
      } else {
        skippedLimit++;
      }
      continue;
    }

    // Outreach fix #1: resolve the prospect's own free report page from the
    // scan + public-share eligibility at send time. Never trust the stored
    // report_url (legacy rows hold ?q= search URLs) and never fall back to
    // the homepage. A touch whose body needs {{report_url}} with no
    // eligible scan is skipped — never mail a fabricated report URL.
    // Day 1 has no {{report_url}} (it leads with the video), so it sends.
    const resolvedReportUrl = await resolvePublicReportUrl(target.scan_id, 'https://rankall.io');
    if (touch.body.includes('{{report_url}}') && !resolvedReportUrl) {
      await sb.from('outreach_sequence_log').update({ status: 'skipped', error: 'no_eligible_report' }).eq('id', row.id);
      continue;
    }

    // Build + send. Idempotency-Key = sequence row id: a crash between the
    // Resend accept and the mark-sent update cannot produce a second email.
    const { subject, html } = buildTouchEmail(touch, { ...target, report_url: resolvedReportUrl } as TouchTarget, row.id);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `outreach-seq-${row.id}`,
        },
        // reply_to: human replies go to the outreach inbox, where Resend
        // Inbound (email.received) picks them up for reply detection
        // (lib/outreachReplies.ts). Without it, replies still default to
        // the From address — this makes the routing explicit.
        body: JSON.stringify({ from: selection.from, to: target.email, reply_to: OUTREACH_INBOX_ADDRESS, subject, html }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        await sb.from('outreach_sequence_log').update({ status: 'error', error: `resend ${res.status}: ${errText.slice(0, 200)}` }).eq('id', row.id);
        errors++;
        continue;
      }
      await sb.from('outreach_sequence_log').update({
        status: 'sent',
        sent_at: nowIso,
        subject,
        domain_used: selection.domain,
        ...(variantToStore ? { variant: variantToStore } : {}),
      }).eq('id', row.id);
      await recordEmailSent(target.id, target.email, selection.domain, {
        sequence_day: row.sequence_day,
        variant: variantToStore,
        sequence_log_id: row.id,
      });
      await sb.from('outreach_targets').update({ status: 'contacted' }).eq('id', target.id).eq('status', 'pending');
      sent++;

      // Schedule the next touch (relative to now, spaced by the day gap).
      const next = nextTouchAfter(row.sequence_day);
      if (next) {
        const scheduledFor = new Date(now.getTime() + (next.day - row.sequence_day) * 24 * 3600 * 1000).toISOString();
        await sb.from('outreach_sequence_log').insert({ target_id: target.id, sequence_day: next.day, status: 'pending', scheduled_for: scheduledFor });
      }
    } catch (err) {
      await sb.from('outreach_sequence_log').update({ status: 'error', error: err instanceof Error ? err.message : String(err) }).eq('id', row.id);
      errors++;
    }
  }

  if (sent > 0) await slack(`📧 Outreach sequence: ${sent} sent · ${skippedDnc} DNC · ${skippedLimit} rate-limited · ${stopped} stopped · ${errors} errors`);

  return NextResponse.json({ ok: true, processed: queue.length, sent, skippedDnc, skippedLimit, stopped, errors, retried, recovered, day1Variants, legacyMode: !columnsSupported });
}
