'use client';

import Link from 'next/link';
import { trialDaysLeft } from '@/lib/trialEnd';

// Trial countdown banner — rendered by the dashboard layout on every
// dashboard page (incl. billing) while the user is trialing. Purely
// display: the plan itself is enforced from the subscriptions row, never
// from metadata.
//
// Copy is the card-upfront truth (PR #46): the card is already on file,
// it will be charged when the trial ends, no action needed. Adapted from
// the b063 banner, whose "make sure your payment method is on file" copy
// assumed the old no-card trial.
export default function TrialCountdownBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const days = trialDaysLeft(trialEndsAt);
  if (days < 0) return null;
  const endDate = new Date(trialEndsAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const label = days === 0 ? 'ends today' : days === 1 ? 'ends in 1 day' : `ends in ${days} days`;
  return (
    <div
      style={{
        background: '#FFFBEB',
        borderBottom: '1.5px solid #FDE68A',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontSize: 13,
        fontWeight: 600,
        color: '#92400E',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <span>
        ⏳ Your free trial {label} ({endDate}). Your card on file will be charged when it ends — no action needed.
      </span>
      <Link href="/dashboard/billing" style={{ color: '#92400E', fontWeight: 800, textDecoration: 'underline' }}>
        Manage billing →
      </Link>
    </div>
  );
}
