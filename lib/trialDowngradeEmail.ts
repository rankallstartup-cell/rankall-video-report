// lib/trialDowngradeEmail.ts — which email a downgrade to Free should send
// (pure). The expire-trials cron's stale-trialing pass used to send the
// grace-period "we couldn't process your payment" email to EVERY trial that
// Stripe reported as canceled — including users who simply cancelled their
// trial (and were, correctly, never charged).
export type DowngradeReason = 'grace_expired' | 'trial_cancelled' | 'trial_payment_failed' | 'ended';

export function staleCanceledReason(stripeSub: Record<string, unknown> | null | undefined): DowngradeReason {
  const details = (stripeSub?.cancellation_details ?? null) as { reason?: string | null } | null;
  const reason = details?.reason ?? null;
  if (reason === 'payment_failed' || reason === 'payment_disputed') return 'trial_payment_failed';
  if (reason === 'cancellation_requested' || stripeSub?.cancel_at_period_end === true) return 'trial_cancelled';
  return 'ended';
}

export function downgradeEmail(reason: DowngradeReason): { subject: string; html: string } {
  switch (reason) {
    case 'grace_expired':
      return {
        subject: 'Your Rankall plan moved to Free',
        html: `<p>We couldn't process your payment after the 3-day grace period, so your plan has moved to Free. Your scans and data are still here — nothing was deleted.</p><p>Reactivate anytime to restore full access: <a href="https://www.rankall.io/pricing">See plans →</a></p>`,
      };
    case 'trial_cancelled':
      return {
        subject: 'Your Rankall trial has ended',
        html: `<p>Your free trial has ended. You cancelled before it converted, so you were not charged. Your account is now on the Free plan — your scans and data are still here.</p><p>Want the paid features back? <a href="https://www.rankall.io/pricing">See plans →</a></p>`,
      };
    case 'trial_payment_failed':
      return {
        subject: 'Your Rankall trial ended — payment did not go through',
        html: `<p>Your free trial ended, but the payment to start your paid plan did not go through, so the subscription was cancelled and your account is now on the Free plan. Your scans and data are still here.</p><p>You can subscribe again anytime: <a href="https://www.rankall.io/pricing">See plans →</a></p>`,
      };
    default:
      return {
        subject: 'Your Rankall subscription has ended',
        html: `<p>Your Rankall subscription has ended and your account is now on the Free plan. Your scans and data are still here — nothing was deleted.</p><p>Reactivate anytime: <a href="https://www.rankall.io/pricing">See plans →</a></p>`,
      };
  }
}
