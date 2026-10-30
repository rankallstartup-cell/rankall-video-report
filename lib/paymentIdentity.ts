// lib/paymentIdentity.ts — a stable "same payer" key for the one-trial-per-
// card and one-refund-per-card rules. SERVER-ONLY (node:crypto).
//
// Card payments carry card.fingerprint (Apple Pay / Google Pay wallet cards
// too). Link and other non-card methods have NO card fingerprint, so those
// payments used to skip both checks entirely — unlimited trials / refunds
// by paying with Link. Fallback order: card fingerprint → Link account email
// → billing-details email. The Stripe CUSTOMER email is deliberately not a
// fallback: we create the customer with the account email, so it is a new
// key for every new account and would protect nothing. Emails are stored
// only as a SHA-256 hash with an `email:` prefix, in the same column as
// fingerprints. No key at all → the caller must deny the self-serve benefit
// (end the trial now / route the refund to support).
import { createHash } from 'crypto';

export function emailIdentityKey(email: string | null | undefined): string | null {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!e || !e.includes('@')) return null;
  return `email:${createHash('sha256').update(e).digest('hex')}`;
}

type PmLike = {
  card?: { fingerprint?: string | null } | null;
  link?: { email?: string | null } | null;
  billing_details?: { email?: string | null } | null;
} | null | undefined;

export function paymentMethodIdentityKey(pm: PmLike): string | null {
  const fp = pm?.card?.fingerprint;
  if (typeof fp === 'string' && fp) return fp;
  return emailIdentityKey(pm?.link?.email) ?? emailIdentityKey(pm?.billing_details?.email);
}

type ChargeLike = {
  payment_method_details?: { card?: { fingerprint?: string | null } | null } | null;
  billing_details?: { email?: string | null } | null;
} | null | undefined;

/** Identity for a refund claim: card fingerprint → billing-details email.
 *  null → the refund goes to support instead of self-serve. */
export function chargeIdentityKey(charge: ChargeLike): string | null {
  const fp = charge?.payment_method_details?.card?.fingerprint;
  if (typeof fp === 'string' && fp) return fp;
  return emailIdentityKey(charge?.billing_details?.email);
}
