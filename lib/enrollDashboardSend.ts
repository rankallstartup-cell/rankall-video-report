// lib/enrollDashboardSend.ts
// Outreach fix #2: unify the two outreach systems.
//
// After a dashboard send succeeds, enroll that prospect into the follow-up
// sequence so they get the remaining touches instead of one email and silence.
// The dashboard send itself counts as the Day-1 touch, so the next scheduled
// touch is the one strictly after Day 1 (Day 3 today), due 2 days after the send
// — the same spacing the sequence cron uses (next touch = send time + day gap).
//
// Hard rules:
// - Dedupe by email: NEVER double-enroll a prospect already in the sequence.
// - NEVER restart a prospect who already got Day 1 (e.g. via Apollo) at Day 1.
//   If their Day-1 row is still pending (not yet sent), the dashboard send
//   supersedes it: the pending Day-1 row is marked skipped and Day 3 is
//   scheduled. If Day 1 already sent, the existing sequence is left alone.
// - Guard: DNC / unsubscribed / paused-domain prospects are never enrolled.
//   (The sequence cron re-checks the full guard at each touch's send time.)
// - Enrollment must NEVER fail the send: every failure is caught, logged, and
//   reported as `skipped` with a reason. The caller additionally wraps the
//   call in try/catch as belt-and-braces.
//
// No migration: outreach_targets + outreach_sequence_log already exist.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkOutreachAllowed, type OutreachGuardResult } from './outreachGuard';
import { nextTouchAfter } from './outreachSequences';

const SENDER_DOMAIN = 'rankall.io';
const DAY_MS = 24 * 3600 * 1000;

export interface DashboardSendProspect {
  email: string;
  businessName: string;
  firstName?: string | null;
  industry?: string | null;
  city: string;
  scanId?: string | null;
  overallScore?: number | null;
  competitorName?: string | null;
  countryCode?: string | null;
}

export interface SequenceRow {
  id: string;
  sequence_day: number;
  status: string;
}

export type EnrollOutcome =
  | { outcome: 'enrolled'; targetId: string; sequenceDay: number }
  | { outcome: 'superseded_day1'; targetId: string; sequenceDay: number }
  | { outcome: 'already_in_sequence'; targetId: string; reason: string }
  | { outcome: 'skipped'; reason: string };

// Pure decision: given a prospect's existing sequence rows + target status,
// decide what enrollment should do. No I/O — fully unit-testable.
export function decideEnrollment(
  rows: SequenceRow[],
  targetStatus: string | null,
): { action: 'enroll' | 'supersede_day1' | 'skip'; reason: string } {
  const status = (targetStatus || '').toLowerCase();
  if (['replied', 'converted', 'unsubscribed', 'stopped'].includes(status)) {
    return { action: 'skip', reason: `target_status_${status}` };
  }
  const pending = rows.filter((r) => r.status === 'pending');
  const pendingDay1 = pending.filter((r) => r.sequence_day === 1);
  if (pendingDay1.length > 0) {
    return { action: 'supersede_day1', reason: 'pending_day1_superseded_by_dashboard_send' };
  }
  const pendingLater = pending.filter((r) => r.sequence_day > 1);
  if (pendingLater.length > 0) {
    return {
      action: 'skip',
      reason: `pending_day_${Math.min(...pendingLater.map((r) => r.sequence_day))}_already_scheduled`,
    };
  }
  if (rows.some((r) => r.status === 'sent')) {
    return { action: 'skip', reason: 'sequence_already_sent' };
  }
  if (rows.some((r) => r.status === 'stopped')) {
    return { action: 'skip', reason: 'sequence_stopped' };
  }
  // No rows at all, or only skipped/error rows (sequence never sent a touch):
  // the dashboard send stands as Day 1, so schedule the next touch.
  return { action: 'enroll', reason: 'fresh' };
}

export interface EnrollDeps {
  sb?: SupabaseClient;
  checkAllowed?: (email: string, domain: string) => Promise<OutreachGuardResult>;
  now?: Date;
}

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _admin;
}

export async function enrollDashboardSend(
  prospect: DashboardSendProspect,
  deps: EnrollDeps = {},
): Promise<EnrollOutcome> {
  const sb = deps.sb ?? admin();
  const checkAllowed = deps.checkAllowed ?? checkOutreachAllowed;
  const now = deps.now ?? new Date();
  try {
    const email = (prospect.email || '').toLowerCase().trim();
    if (!email) return { outcome: 'skipped', reason: 'no_email' };

    // Guard: DNC / paused domain / daily limit — a blocked prospect is never enrolled.
    // (The sequence cron re-checks the full guard again at each touch's send time.)
    const guard = await checkAllowed(email, SENDER_DOMAIN);
    if (!guard.allowed) {
      return { outcome: 'skipped', reason: `guard_blocked: ${guard.reason ?? 'unknown'}` };
    }

    // Unsubscribes are a separate table the guard does not check — check it here.
    const { data: unsub } = await sb
      .from('outreach_unsubscribes')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (unsub) return { outcome: 'skipped', reason: 'unsubscribed' };

    // Find or create the outreach_targets row the sequence cron reads.
    // (The dashboard flow never creates one — targets live in browser
    // localStorage until now — so dashboard prospects usually have no row.)
    let targetId: string | null = null;
    let targetStatus: string | null = null;
    const { data: existing } = await sb
      .from('outreach_targets')
      .select('id, status')
      .eq('email', email)
      .maybeSingle();
    if (existing?.id) {
      targetId = existing.id as string;
      targetStatus = (existing.status as string) ?? null;
      // A prior guard block left this row 'blocked'; the send just succeeded,
      // so the block no longer applies. Best-effort — a failure here must not
      // stop enrollment (sequence rows are the real dedupe).
      if (targetStatus === 'blocked') {
        try {
          await sb.from('outreach_targets').update({ status: 'pending' }).eq('id', targetId);
          targetStatus = 'pending';
        } catch (e) {
          console.error('[enrollDashboardSend] status unblock failed (continuing):', e);
        }
      }
    } else {
      const city = prospect.city || '';
      const { error: insertErr } = await sb.from('outreach_targets').insert({
        business_name: prospect.businessName,
        owner_name: prospect.firstName || prospect.businessName,
        email,
        city,
        country_code: prospect.countryCode || 'US',
        industry: prospect.industry || null,
        scan_id: prospect.scanId || null,
        rankall_score: prospect.overallScore ?? null,
        competitor_name: prospect.competitorName || null,
        video_url: prospect.scanId ? `https://rankall.io/video/${prospect.scanId}` : null,
        // Same construction as the Apollo webhook; fix #1 owns the /r/<id> link.
        report_url: `https://rankall.io/?q=${encodeURIComponent(`${prospect.businessName} ${city}`)}`,
        status: 'pending',
      });
      if (insertErr) {
        // Race: a concurrent send may have created the row first. Re-read.
        const { data: raced } = await sb
          .from('outreach_targets')
          .select('id, status')
          .eq('email', email)
          .maybeSingle();
        if (!raced?.id) {
          throw new Error(`outreach_targets insert failed: ${insertErr.message ?? 'unknown'}`);
        }
        targetId = raced.id as string;
        targetStatus = (raced.status as string) ?? null;
      } else {
        const { data: created } = await sb
          .from('outreach_targets')
          .select('id, status')
          .eq('email', email)
          .maybeSingle();
        if (!created?.id) {
          throw new Error('outreach_targets insert succeeded but row not found on re-read');
        }
        targetId = created.id as string;
        targetStatus = (created.status as string) ?? null;
      }
    }

    // Dedupe against the prospect's existing sequence rows.
    const { data: rows } = await sb
      .from('outreach_sequence_log')
      .select('id, sequence_day, status')
      .eq('target_id', targetId);
    const decision = decideEnrollment((rows ?? []) as SequenceRow[], targetStatus);

    if (decision.action === 'skip') {
      return { outcome: 'already_in_sequence', targetId, reason: decision.reason };
    }

    const next = nextTouchAfter(1);
    if (!next) return { outcome: 'skipped', reason: 'no_next_touch' };
    const scheduledFor = new Date(now.getTime() + (next.day - 1) * DAY_MS).toISOString();

    if (decision.action === 'supersede_day1') {
      // The dashboard send replaces the unsent Day-1 touch: cancel it so the
      // prospect does not get two Day-1 emails, then schedule the next touch.
      const pendingDay1 = ((rows ?? []) as SequenceRow[]).filter(
        (r) => r.status === 'pending' && r.sequence_day === 1,
      );
      for (const row of pendingDay1) {
        await sb
          .from('outreach_sequence_log')
          .update({ status: 'skipped', error: 'superseded_by_dashboard_send' })
          .eq('id', row.id);
      }
      // Defensive: if a Day-3 row is already pending (shouldn't happen — the
      // cron only schedules one touch ahead), don't insert a duplicate.
      const pendingNext = ((rows ?? []) as SequenceRow[]).some(
        (r) => r.status === 'pending' && r.sequence_day === next.day,
      );
      if (pendingNext) {
        return { outcome: 'superseded_day1', targetId, sequenceDay: next.day };
      }
    }

    const { error: seqErr } = await sb.from('outreach_sequence_log').insert({
      target_id: targetId,
      sequence_day: next.day,
      status: 'pending',
      scheduled_for: scheduledFor,
    });
    if (seqErr) throw new Error(`outreach_sequence_log insert failed: ${seqErr.message ?? 'unknown'}`);

    return {
      outcome: decision.action === 'supersede_day1' ? 'superseded_day1' : 'enrolled',
      targetId,
      sequenceDay: next.day,
    };
  } catch (err) {
    // Enrollment must never fail the send: log and report skipped.
    console.error('[enrollDashboardSend] enrollment failed (send stands):', err);
    return { outcome: 'skipped', reason: `enrollment_error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
