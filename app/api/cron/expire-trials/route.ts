import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/emailTemplates';
import { getPlanLabel } from '@/lib/planLabels';
import { normalizePlan } from '@/lib/planConfig';
import {
  TRIAL_WARNING_DAYS,
  TRIAL_GRACE_DAYS,
  trialDaysLeft,
  trialEndDateLabel,
  wasWarnedRecently,
  isPastGrace,
  trustedPaymentFailedAt,
} from '@/lib/trialEnd';
import { downgradeEmail, staleCanceledReason, type DowngradeReason } from '@/lib/trialDowngradeEmail';

export const dynamic = 'force-dynamic';

// GET /api/cron/expire-trials — trial-end lifecycle for STRIPE trials
// (card collected upfront, PR #46). This is NOT the b063 in-app-trials
// cron: in-app trials (stripe_subscription_id NULL) do not exist on
// staging, and this cron deliberately skips them.
//
// Three passes, all fail-safe (a failed lookup/email NEVER downgrades):
//   1. Reminder — Stripe trials ending within 3 days get the one-time
//      "trial ends soon, card on file will be charged" email (deduped via
//      app_metadata.trial_warning_sent_at). Belt-and-braces alongside
//      the webhook's trial_will_end handler, in case that event was missed.
//   2. Stale-trialing reconciliation — rows still 'trialing' past
//      trial_end (webhook missed) are reconciled against Stripe's truth:
//      active → row to active + conversion email; past_due/unpaid → row
//      to past_due + grace clock + grace email; canceled → downgrade.
//   3. Grace expiry — past_due/unpaid rows whose 3-day grace ran out are
//      verified against Stripe, then cancelled in Stripe and downgraded
//      to Free locally. Data is NEVER deleted; access is never cut
//      without the earlier notices.
//
// The grace clock and warning flag live on app_metadata (admin-only). A
// legacy user_metadata.payment_failed_at is ignored — users can rewrite
// user_metadata, and resetting it used to mean infinite grace.

const GRACE_MS = TRIAL_GRACE_DAYS * 24 * 60 * 60 * 1000;

async function stripeFetch(path: string, method: 'GET' | 'DELETE', params?: Record<string, string>) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(params ? { body: new URLSearchParams(params).toString() } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error('[expire-trials] Stripe fetch failed:', path, err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> automatically.
  // Fail CLOSED: an unset secret used to skip the check entirely, letting
  // anyone trigger downgrades/cancellations.
  // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
  if (!process.env.CRON_SECRET) console.error('[expire-trials] CRON_SECRET is not set — refusing to run');
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const warnUntilIso = new Date(now.getTime() + TRIAL_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const downgraded: string[] = [];
  const reminded: string[] = [];

  async function getUserMeta(userId: string) {
    try {
      const { data } = await sb.auth.admin.getUserById(userId);
      return {
        email: data?.user?.email || '',
        // Trusted flags only (app_metadata). user_metadata is never read.
        am: (data?.user?.app_metadata ?? {}) as Record<string, unknown>,
      };
    } catch {
      return { email: '', am: {} as Record<string, unknown> };
    }
  }

  async function planLabelFor(userId: string, fallbackPlan?: string | null) {
    try {
      const { data } = await sb.from('subscriptions').select('plan').eq('user_id', userId).maybeSingle();
      const plan = ((data as { plan?: string } | null)?.plan as string) ?? fallbackPlan ?? 'business';
      return getPlanLabel(normalizePlan(plan));
    } catch {
      return getPlanLabel(normalizePlan(fallbackPlan ?? 'business'));
    }
  }

  // Downgrade to Free after grace: cancel in Stripe first (so Stripe stops
  // retrying), then reconcile our own state. Returns false when the Stripe
  // cancel failed — the row is left alone and retried next run, never
  // downgraded on an unverified state.
  async function downgradeToFree(userId: string, stripeSubId: string | null, reason: DowngradeReason = 'grace_expired'): Promise<boolean> {
    if (stripeSubId) {
      // Tagged so the subscription.deleted webhook does not send a second
      // downgrade email (this function sends the one email).
      const cancelled = await stripeFetch(`subscriptions/${encodeURIComponent(stripeSubId)}`, 'DELETE', {
        'cancellation_details[comment]': 'grace_expired',
      });
      if (!cancelled) {
        console.error('[expire-trials] Stripe cancel failed, skipping downgrade for user:', userId);
        return false;
      }
    }
    try {
      const r1 = await sb
        .from('subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (r1.error) throw r1.error;
      // Clear BOTH metadata buckets (b062 follow-through — resolvers fall
      // back to metadata when no paid row exists).
      const cleared = { account_type: 'free', subscription_status: 'expired', plan_synced_at: new Date().toISOString() };
      const r2 = await sb.auth.admin.updateUserById(userId, {
        app_metadata: { ...cleared, payment_failed_at: null },
        user_metadata: cleared,
      });
      if (r2.error) throw r2.error;
      const r3 = await sb.from('profiles').upsert({ id: userId, account_type: 'free' }, { onConflict: 'id' });
      if (r3.error) throw r3.error;
    } catch (err) {
      console.error('[expire-trials] downgrade failed for user:', userId, err);
      return false;
    }
    const { email } = await getUserMeta(userId);
    if (email) {
      // The email matches WHY the plan ended (lib/trialDowngradeEmail).
      const { subject, html } = downgradeEmail(reason);
      await sendEmail({ to: email, subject, html });
    }
    return true;
  }

  // ── Pass 1 — reminder: Stripe trials ending within 3 days ──
  const { data: endingSoon } = await sb
    .from('subscriptions')
    .select('user_id, plan, trial_end')
    .eq('status', 'trialing')
    .not('stripe_subscription_id', 'is', null)
    .gt('trial_end', nowIso)
    .lte('trial_end', warnUntilIso);
  for (const row of (endingSoon ?? []) as Array<{ user_id: string; plan?: string; trial_end?: string }>) {
    try {
      const { email, am } = await getUserMeta(row.user_id);
      if (!email || wasWarnedRecently(am, now)) continue;
      const days = trialDaysLeft(row.trial_end, now);
      const label = await planLabelFor(row.user_id, row.plan);
      const subject =
        days <= 0 ? `Your ${label} trial ends today` : `Your ${label} trial ends in ${days} day${days === 1 ? '' : 's'}`;
      const sent = await sendEmail({
        to: email,
        subject,
        html: `<p>Your <strong>${label}</strong> free trial ends on ${trialEndDateLabel(row.trial_end)}. Your card on file will be charged when the trial ends — no action needed.</p><p>Want to stop? Cancel anytime before then and you pay nothing: <a href="https://www.rankall.io/dashboard/billing">Manage billing →</a></p>`,
      });
      if (!sent) continue; // don't mark warned when the email failed
      await sb.auth.admin.updateUserById(row.user_id, {
        app_metadata: { trial_warning_sent_at: nowIso },
      });
      reminded.push(row.user_id);
    } catch (err) {
      console.error('[expire-trials] reminder failed for user:', row.user_id, err);
    }
  }

  // ── Pass 2 — stale trialing: trial_end passed but row still 'trialing' ──
  const { data: stale } = await sb
    .from('subscriptions')
    .select('user_id, plan, stripe_subscription_id, trial_end')
    .eq('status', 'trialing')
    .not('stripe_subscription_id', 'is', null)
    .lt('trial_end', nowIso);
  for (const row of (stale ?? []) as Array<{ user_id: string; plan?: string; stripe_subscription_id?: string | null; trial_end?: string }>) {
    try {
      if (!row.stripe_subscription_id) continue;
      const stripeSub = await stripeFetch(`subscriptions/${row.stripe_subscription_id}`, 'GET');
      if (!stripeSub) continue; // unverified — never act on a failed lookup
      const stripeStatus = stripeSub.status as string;
      if (stripeStatus === 'active') {
        await sb.from('subscriptions').update({ status: 'active', updated_at: nowIso }).eq('user_id', row.user_id);
        const { email } = await getUserMeta(row.user_id);
        if (email) {
          const label = await planLabelFor(row.user_id, row.plan);
          await sendEmail({
            to: email,
            subject: `Your ${label} trial ended — you're now on the paid plan`,
            html: `<p>Your 7-day free trial has ended and your card on file was charged. You're now on the <strong>${label}</strong> plan with full access.</p><p>Changed your mind? You have a 14-day money-back guarantee — <a href="https://www.rankall.io/dashboard/billing">manage billing →</a></p>`,
          });
        }
      } else if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') {
        await sb.from('subscriptions').update({ status: stripeStatus, updated_at: nowIso }).eq('user_id', row.user_id);
        const { email, am } = await getUserMeta(row.user_id);
        // First time we learn of the failure: start the grace clock + warn.
        if (!trustedPaymentFailedAt(am)) {
          const { error: stampErr } = await sb.auth.admin.updateUserById(row.user_id, {
            app_metadata: { subscription_status: 'payment_failed', payment_failed_at: nowIso },
            user_metadata: { subscription_status: 'payment_failed' },
          });
          if (stampErr) throw stampErr;
          if (email) {
            const deadline = new Date(now.getTime() + GRACE_MS).toLocaleDateString(undefined, {
              month: 'long', day: 'numeric', year: 'numeric',
            });
            await sendEmail({
              to: email,
              subject: 'Payment failed — please update your card',
              html: `<p>We couldn't process your latest Rankall payment. Your access is still active for now.</p><p>Please <a href="https://www.rankall.io/dashboard/billing">update your payment method →</a> by ${deadline} (3 days). If payment still hasn't gone through by then, your plan will move to Free — your scans and data stay, you just lose paid access until you reactivate.</p>`,
            });
          }
        }
      } else if (stripeStatus === 'canceled') {
        // A user who cancelled their trial gets the trial-ended email, not
        // the "payment failed after grace" one (they were never charged).
        if (await downgradeToFree(row.user_id, null, staleCanceledReason(stripeSub))) downgraded.push(row.user_id);
      }
      // Any other Stripe status (e.g. still trialing — clock skew): leave
      // for the next run; never act on an ambiguous state.
    } catch (err) {
      console.error('[expire-trials] stale-trialing reconciliation failed for user:', row.user_id, err);
    }
  }

  // ── Pass 3 — grace expiry: past_due/unpaid past the 3-day grace ──
  const { data: overdue } = await sb
    .from('subscriptions')
    .select('user_id, stripe_subscription_id')
    .in('status', ['past_due', 'unpaid']);
  for (const row of (overdue ?? []) as Array<{ user_id: string; stripe_subscription_id?: string | null }>) {
    try {
      const { am } = await getUserMeta(row.user_id);
      const failedAt = trustedPaymentFailedAt(am);
      if (!failedAt) {
        // No trusted clock yet (legacy row, or only a user_metadata copy —
        // which is ignored): start the clock now on app_metadata. Never
        // downgrade a user who was never given a grace window, and never
        // let a user-written timestamp extend one.
        await sb.auth.admin.updateUserById(row.user_id, {
          app_metadata: { payment_failed_at: nowIso },
        });
        continue;
      }
      if (!isPastGrace(failedAt, now)) continue;
      // Grace ran out — verify against Stripe before acting.
      if (!row.stripe_subscription_id) continue;
      const stripeSub = await stripeFetch(`subscriptions/${row.stripe_subscription_id}`, 'GET');
      if (!stripeSub) continue; // unverified — never downgrade on a failed lookup
      const stripeStatus = stripeSub.status as string;
      if (stripeStatus === 'active' || stripeStatus === 'trialing') {
        // Payment recovered since we last saw it — heal our row, clear the
        // flag, keep access. No email: nothing changed for the user.
        await sb.from('subscriptions').update({ status: stripeStatus, updated_at: nowIso }).eq('user_id', row.user_id);
        await sb.auth.admin.updateUserById(row.user_id, {
          app_metadata: { subscription_status: stripeStatus, payment_failed_at: null },
          user_metadata: { subscription_status: stripeStatus },
        });
        continue;
      }
      if (stripeStatus === 'canceled') {
        if (await downgradeToFree(row.user_id, null)) downgraded.push(row.user_id);
        continue;
      }
      if (await downgradeToFree(row.user_id, row.stripe_subscription_id)) downgraded.push(row.user_id);
    } catch (err) {
      console.error('[expire-trials] grace-expiry failed for user:', row.user_id, err);
    }
  }

  return NextResponse.json({ reminded: reminded.length, downgraded: downgraded.length });
}
