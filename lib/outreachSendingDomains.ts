// lib/outreachSendingDomains.ts
// Outreach improvement #4: cold sending on dedicated sending domains.
//
// Cold outreach mail (dashboard send + automated sequence) used to send from
// the single hardcoded address `Rankall.io <outreach@rankall.io>`. A
// deliverability incident on cold mail then threatened the main brand domain
// that all product/transactional mail (auth, billing, lifecycle) depends on.
//
// This module makes the cold sending domain CONFIGURABLE and rotates sends
// across the configured domains, reusing the per-domain guard in
// lib/outreachGuard.ts (warming schedule + spam/bounce auto-pause) for every
// candidate domain. Product/transactional mail is untouched: it uses its own
// hardcoded `from` addresses and never imports this module.
//
// Configuration (env):
//   OUTREACH_SENDING_DOMAINS="mail1.example.com, mail2.example.com"
// Comma-separated list of domains that are verified in Resend and have
// SPF/DKIM/DMARC DNS set up. The From header for a send is
// `Rankall.io <outreach@<domain>>`.
//
// Behaviour:
// - No domains configured (env unset/empty/all-invalid) -> today's behaviour:
//   sends from `rankall.io` exactly as before. Safe no-op until Nandish
//   configures domains.
// - Domains configured -> sends rotate across them (deterministic rotation
//   per recipient, so one recipient always maps to the same starting domain).
//   A paused / over-limit domain is skipped in favour of a healthy one.
// - ALL configured domains blocked -> the send is BLOCKED with a clear
//   reason. It NEVER silently falls back to rankall.io — that would defeat
//   the whole fix.
// - Misconfigured list (e.g. typos) -> invalid entries are dropped with a
//   warning; if nothing valid remains, behaviour is the same as
//   unconfigured (rankall.io) + a warning. Never a crash.
//
// Server-side only. The guard's health rows (`outreach_domain_health`) are
// keyed by domain, so each cold domain warms and pauses independently. The
// Resend webhook already attributes bounces/complaints from the event's
// `from` address, so per-domain pause keeps working with no changes.

import type { OutreachGuardResult } from '@/lib/outreachGuard';

// The pre-#4 behaviour: cold mail from the main brand domain.
export const LEGACY_COLD_DOMAIN = 'rankall.io';
// Local part + display name for every cold From address.
export const COLD_SENDER_LOCAL_PART = 'outreach';
export const COLD_SENDER_DISPLAY_NAME = 'Rankall.io';

export const COLD_SENDING_DOMAINS_ENV_VAR = 'OUTREACH_SENDING_DOMAINS';

// Minimal domain validation: letters/digits/hyphens/dots, at least one dot,
// no @, no scheme, no port, no spaces. This is a config sanity check, not
// a DNS lookup — a typo'd but well-formed domain still fails loudly at
// Resend send time (and is never silently retried from rankall.io).
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** Parse the configured cold sending domains from env (or a supplied env object, for tests). */
export function getConfiguredColdDomains(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const raw = env[COLD_SENDING_DOMAINS_ENV_VAR];
  if (!raw) return [];
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const entry of raw.split(',')) {
    const domain = entry.trim().toLowerCase();
    if (!domain) continue;
    if (!DOMAIN_RE.test(domain)) {
      console.warn(
        `[outreachSendingDomains] ignoring invalid entry in ${COLD_SENDING_DOMAINS_ENV_VAR}: ${JSON.stringify(entry)}`,
      );
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  if (raw.trim() !== '' && domains.length === 0) {
    console.warn(
      `[outreachSendingDomains] ${COLD_SENDING_DOMAINS_ENV_VAR} is set but contains no valid domains — falling back to ${LEGACY_COLD_DOMAIN} (today's behaviour)`,
    );
  }
  return domains;
}

/** Build the From header for a cold send from `domain`. */
export function buildColdFromAddress(domain: string): string {
  return `${COLD_SENDER_DISPLAY_NAME} <${COLD_SENDER_LOCAL_PART}@${domain}>`;
}

// djb2 — small deterministic hash, stable across processes (unlike
// String.prototype hashing, which is not specified). Used only to pick a
// starting domain for a recipient; distribution, not security.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Order candidate domains for a recipient: rotate the list so the starting
 * domain depends on the recipient. Same recipient -> same order every time
 * (stable threading + even spread across domains). Pure function.
 */
export function orderDomainsForRecipient(domains: string[], recipientEmail: string): string[] {
  if (domains.length <= 1) return [...domains];
  const start = hashString((recipientEmail || '').toLowerCase().trim()) % domains.length;
  return [...domains.slice(start), ...domains.slice(0, start)];
}

export type ColdDomainCheck = (domain: string) => Promise<OutreachGuardResult>;

export type ColdDomainSelection =
  | {
      allowed: true;
      domain: string;
      from: string;
      guard: OutreachGuardResult;
    }
  | {
      allowed: false;
      reason: string;
      /** Recipient is on the do-not-contact list (recipient-level, not per-domain). */
      dnc: boolean;
      /** Every candidate domain was paused (spam complaint / bounce rate). */
      allPaused: boolean;
    };

function isPausedReason(reason: string | undefined): boolean {
  return !!reason && /paused/i.test(reason);
}

function isDncReason(reason: string | undefined): boolean {
  return !!reason && /do-not-contact/i.test(reason);
}

/**
 * Pick the sending domain for one cold send.
 *
 * Tries each candidate domain through the guard (which enforces DNC, the
 * per-domain warming schedule, and spam/bounce auto-pause) until one
 * allows the send. First allowed domain wins.
 *
 * - `configuredDomains` defaults to the env-parsed list. Pass an explicit
 *   list in tests; pass [] / omit to use env.
 * - No domains configured -> tries only LEGACY_COLD_DOMAIN (today's
 *   behaviour).
 * - DNC stops immediately (it is recipient-level — no other domain would
 *   allow it either).
 * - If every candidate is blocked, returns allowed:false and NEVER falls
 *   back to rankall.io: a silent fallback would defeat the fix.
 */
export async function selectColdSendingDomain(
  recipientEmail: string,
  checkAllowed: ColdDomainCheck,
  configuredDomains?: string[],
): Promise<ColdDomainSelection> {
  const configured = configuredDomains ?? getConfiguredColdDomains();
  const candidates =
    configured.length > 0
      ? orderDomainsForRecipient(configured, recipientEmail)
      : [LEGACY_COLD_DOMAIN];

  const failures: string[] = [];
  let sawPaused = false;
  let sawOther = false;

  for (const domain of candidates) {
    const guard = await checkAllowed(domain);
    if (guard.allowed) {
      return { allowed: true, domain, from: buildColdFromAddress(domain), guard };
    }
    if (isDncReason(guard.reason)) {
      return { allowed: false, reason: guard.reason ?? 'On do-not-contact list', dnc: true, allPaused: false };
    }
    failures.push(`${domain}: ${guard.reason ?? 'blocked'}`);
    if (isPausedReason(guard.reason)) sawPaused = true;
    else sawOther = true;
  }

  const allPaused = sawPaused && !sawOther;
  return {
    allowed: false,
    reason:
      candidates.length === 1
        ? (failures[0] ?? 'Sending blocked')
        : `All cold sending domains blocked — ${failures.join('; ')}`,
    dnc: false,
    allPaused,
  };
}
