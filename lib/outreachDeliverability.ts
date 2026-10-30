// lib/outreachDeliverability.ts
// Outreach improvement #8: deliverability upgrades — catch-all opt-in + reply-to.
//
// Catch-all handling (the NEW work in this ticket):
// Today a catch-all address is skipped entirely (send-email route returns
// `skipped_catch_all`). That is safe but loses high-value leads. This module
// adds an OPT-IN, per-send path: the caller passes `allowCatchAll === true`
// (strict boolean — the string "true", 1, or any other truthy value does NOT
// opt in) and the send proceeds, marked low-priority in every log so
// catch-all sends can be counted separately and never poison deliverability
// stats. Default behaviour is UNCHANGED: without the explicit flag,
// catch-alls are skipped exactly as before. There is deliberately NO global
// "send to all catch-alls" switch.
//
// The guard still applies first: DNC / unsubscribed / paused-domain /
// daily-limit blocks happen before verification, and an `invalid`
// verification result still skips even with the flag set. The flag only
// overrides the catch-all skip — nothing else.
//
// Reply-to: both cold send paths (dashboard send + automated sequence) set
// `reply_to` to the monitored inbox `outreach@rankall.io`. This is the
// header only — reply DETECTION is fix #3's job (PR #64, unmerged) and is
// not built here.
//
// Domain rotation is fix #4's job (PR #65, unmerged) and is not built here:
// both cold paths still send from `rankall.io` until #4 lands.
//
// Server-side only. Pure functions — no DB, no fetch, no env.

export const OUTREACH_REPLY_TO = 'outreach@rankall.io';

export type VerificationStatus =
  | 'valid'
  | 'skipped_catch_all'
  | 'catch_all_allowed'
  | 'verification_failed'
  | 'verification_risky'
  | 'verification_pending'
  | 'verification_error';

/**
 * Map an Instantly verification response to our status.
 * Order mirrors the original route: catch-all is checked BEFORE
 * verification_status, so a catch-all address is never treated as
 * valid/invalid on the basis of verification_status alone.
 */
export function resolveVerificationStatus(
  data: { catch_all?: unknown; verification_status?: unknown },
  allowCatchAll: boolean,
): VerificationStatus {
  if (data.catch_all) {
    return allowCatchAll ? 'catch_all_allowed' : 'skipped_catch_all';
  }
  switch (data.verification_status) {
    case 'valid':
      return 'valid';
    case 'invalid':
      return 'verification_failed';
    case 'risky':
      return 'verification_risky';
    case 'pending':
      return 'verification_pending';
    default:
      throw new Error(`Instantly returned unexpected verification_status: "${String(data.verification_status)}"`);
  }
}

/** Only an explicit boolean `true` opts a send in. Anything else = off. */
export function parseAllowCatchAll(value: unknown): boolean {
  return value === true;
}

/** Whether this verification status may proceed to send. */
export function verificationAllowsSend(status: VerificationStatus): boolean {
  return status === 'valid' || status === 'catch_all_allowed';
}

/** Whether this send is a catch-all opt-in (send, but low-priority + counted separately). */
export function isCatchAllOptInSend(status: VerificationStatus): boolean {
  return status === 'catch_all_allowed';
}
