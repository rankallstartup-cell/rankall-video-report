// Outreach #8: deliverability — catch-all opt-in + reply-to.
// Pins: catch-all skipped by default; explicit boolean `true` per send is
// the ONLY way to opt in (no global switch, no truthy-string opt-in);
// opt-in sends are marked low-priority + counted separately; reply-to is
// present on both cold send paths; the guard still runs before
// verification (DNC/unsubscribed still block even with the flag).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OUTREACH_REPLY_TO,
  resolveVerificationStatus,
  parseAllowCatchAll,
  verificationAllowsSend,
  isCatchAllOptInSend,
} from '@/lib/outreachDeliverability';

const SEND_EMAIL_SRC = readFileSync(join(process.cwd(), 'app/api/outreach/send-email/route.ts'), 'utf8');
const SEQUENCE_SRC = readFileSync(join(process.cwd(), 'app/api/cron/outreach-sequence/route.ts'), 'utf8');

describe('resolveVerificationStatus', () => {
  it('catch-all without the flag -> skipped (today\'s behaviour, unchanged)', () => {
    expect(resolveVerificationStatus({ catch_all: true, verification_status: 'valid' }, false))
      .toBe('skipped_catch_all');
  });
  it('catch-all with the explicit flag -> catch_all_allowed (send, low-priority)', () => {
    expect(resolveVerificationStatus({ catch_all: true, verification_status: 'valid' }, true))
      .toBe('catch_all_allowed');
  });
  it('catch-all is checked before verification_status (never valid/invalid on status alone)', () => {
    expect(resolveVerificationStatus({ catch_all: true, verification_status: 'invalid' }, false))
      .toBe('skipped_catch_all');
    expect(resolveVerificationStatus({ catch_all: true, verification_status: 'invalid' }, true))
      .toBe('catch_all_allowed');
  });
  it('non-catch-all maps verification_status as before', () => {
    expect(resolveVerificationStatus({ verification_status: 'valid' }, false)).toBe('valid');
    expect(resolveVerificationStatus({ verification_status: 'valid' }, true)).toBe('valid');
    expect(resolveVerificationStatus({ verification_status: 'invalid' }, false)).toBe('verification_failed');
    expect(resolveVerificationStatus({ verification_status: 'risky' }, false)).toBe('verification_risky');
    expect(resolveVerificationStatus({ verification_status: 'pending' }, false)).toBe('verification_pending');
  });
  it('flag does NOT rescue an invalid address (invalid + flag -> still failed, no send)', () => {
    expect(resolveVerificationStatus({ verification_status: 'invalid' }, true)).toBe('verification_failed');
  });
  it('unexpected verification_status still throws', () => {
    expect(() => resolveVerificationStatus({ verification_status: 'mystery' }, false)).toThrow();
  });
});

describe('parseAllowCatchAll', () => {
  it('only a literal boolean true opts in', () => {
    expect(parseAllowCatchAll(true)).toBe(true);
    expect(parseAllowCatchAll(false)).toBe(false);
    expect(parseAllowCatchAll(undefined)).toBe(false);
    expect(parseAllowCatchAll(null)).toBe(false);
    expect(parseAllowCatchAll('true')).toBe(false);
    expect(parseAllowCatchAll(1)).toBe(false);
    expect(parseAllowCatchAll('yes')).toBe(false);
  });
});

describe('verificationAllowsSend / isCatchAllOptInSend', () => {
  it('valid and catch_all_allowed send; everything else skips', () => {
    expect(verificationAllowsSend('valid')).toBe(true);
    expect(verificationAllowsSend('catch_all_allowed')).toBe(true);
    expect(verificationAllowsSend('skipped_catch_all')).toBe(false);
    expect(verificationAllowsSend('verification_failed')).toBe(false);
    expect(verificationAllowsSend('verification_risky')).toBe(false);
    expect(verificationAllowsSend('verification_pending')).toBe(false);
    expect(verificationAllowsSend('verification_error')).toBe(false);
  });
  it('only catch_all_allowed is a catch-all opt-in send', () => {
    expect(isCatchAllOptInSend('catch_all_allowed')).toBe(true);
    expect(isCatchAllOptInSend('valid')).toBe(false);
    expect(isCatchAllOptInSend('skipped_catch_all')).toBe(false);
  });
});

describe('reply-to on cold sends', () => {
  it('uses the monitored inbox', () => {
    expect(OUTREACH_REPLY_TO).toBe('outreach@rankall.io');
  });
  it('dashboard send-email sets reply_to', () => {
    // Behaviour correct; the routes pin the other identifier for the
    // same address (OUTREACH_INBOX_ADDRESS === OUTREACH_REPLY_TO,
    // both 'outreach@rankall.io').
    expect(SEND_EMAIL_SRC).toContain('reply_to: OUTREACH_INBOX_ADDRESS');
  });
  it('sequence cron sets reply_to', () => {
    expect(SEQUENCE_SRC).toContain('reply_to: OUTREACH_INBOX_ADDRESS');
  });
});

describe('send-email route wiring', () => {
  it('passes the parsed flag into verification (strict boolean opt-in)', () => {
    expect(SEND_EMAIL_SRC).toContain('parseAllowCatchAll(allowCatchAll)');
    expect(SEND_EMAIL_SRC).toContain('verifyEmail(to, allowCatchAllOptIn)');
  });
  it('skip decision uses verificationAllowsSend (opt-in sends are not skipped)', () => {
    expect(SEND_EMAIL_SRC).toContain('verificationAllowsSend(verificationResult.status)');
  });
  it('catch-all opt-ins are marked low-priority in the event metadata', () => {
    expect(SEND_EMAIL_SRC).toContain('catch_all_allowed: true');
    expect(SEND_EMAIL_SRC).toContain("priority: 'low'");
  });
  it('catch-all opt-ins are logged under their own verification_status (countable separately)', () => {
    expect(SEND_EMAIL_SRC).toContain("verification_status: catchAllAllowed ? 'catch_all_allowed' : 'valid'");
  });
  it('no global catch-all switch exists (no env var, no default-on)', () => {
    expect(SEND_EMAIL_SRC).not.toContain('ALLOW_CATCH_ALL');
    expect(SEND_EMAIL_SRC).not.toContain('allowCatchAll = true');
  });
  it('guard still runs BEFORE verification (DNC/unsubscribed block even with the flag)', () => {
    // Actual guard: selectColdSendingDomain passes a callback that
    // calls checkOutreachAllowed(to, domain) — senderDomain is only
    // assigned AFTER the guard (route.ts:258) — before verifyEmail.
    const guardIdx = SEND_EMAIL_SRC.indexOf('checkOutreachAllowed(to, domain)');
    const verifyIdx = SEND_EMAIL_SRC.indexOf('verifyEmail(to, allowCatchAllOptIn)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(verifyIdx);
  });
});
