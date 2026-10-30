import { describe, it, expect, vi } from 'vitest';
import { emailDedupeKey, monthKey, isoWeekKey, claimEmailSend } from '../emailDedupe';
import { checkCronAuth } from '../cronAuth';

// ax74: the dedupe key carries the per-instance discriminator so it fits the
// (user_id, trigger_event) unique index; the claim checks the returned
// {error} and only 'claimed' may send.
describe('emailDedupeKey', () => {
  it('per-scan, per-month and once-ever keys', () => {
    expect(emailDedupeKey('decay', 'scan-123')).toBe('decay:scan-123');
    expect(emailDedupeKey('monthly_roi', monthKey(new Date(Date.UTC(2026, 9, 16))))).toBe('monthly_roi:2026-10');
    expect(emailDedupeKey('referral_invite')).toBe('referral_invite');
    expect(emailDedupeKey('day1_followup', null)).toBe('day1_followup');
    expect(emailDedupeKey('x', '  ')).toBe('x');
  });
  it('different instances never share a key', () => {
    expect(emailDedupeKey('decay', 'a')).not.toBe(emailDedupeKey('decay', 'b'));
    expect(monthKey(new Date(Date.UTC(2026, 0, 31)))).toBe('2026-01');
    expect(monthKey(new Date(Date.UTC(2026, 1, 1)))).toBe('2026-02');
  });
  it('ISO week keys', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 9, 16)))).toBe('2026-W42');
    expect(isoWeekKey(new Date(Date.UTC(2021, 0, 3)))).toBe('2020-W53');
  });
});

function fakeSb(result: { data: unknown; error: { message: string } | null } | 'throw') {
  const upsert = vi.fn(() => ({
    select: vi.fn(async () => {
      if (result === 'throw') throw new Error('boom');
      return result;
    }),
  }));
  return { sb: { from: vi.fn(() => ({ upsert })) } as never, upsert };
}

describe('claimEmailSend', () => {
  const row = { userId: 'u1', email: 'a@b.c', triggerEvent: 'decay:s1', scanId: 's1' };
  it('claimed only when the row was created', async () => {
    const { sb, upsert } = fakeSb({ data: [{ id: 'x' }], error: null });
    expect(await claimEmailSend(sb, row)).toBe('claimed');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', trigger_event: 'decay:s1', scan_id: 's1' }),
      { onConflict: 'user_id,trigger_event', ignoreDuplicates: true },
    );
  });
  it('duplicate when ignoreDuplicates skipped the row', async () => {
    const { sb } = fakeSb({ data: [], error: null });
    expect(await claimEmailSend(sb, row)).toBe('duplicate');
  });
  it('error (do not send) when supabase returns {error} or throws', async () => {
    expect(await claimEmailSend(fakeSb({ data: null, error: { message: 'unique violation' } }).sb, row)).toBe('error');
    expect(await claimEmailSend(fakeSb('throw').sb, row)).toBe('error');
  });
});

describe('checkCronAuth', () => {
  it('fails closed when CRON_SECRET is unset', () => {
    expect(checkCronAuth('Bearer undefined', undefined)).toBe('unconfigured');
    expect(checkCronAuth(null, '')).toBe('unconfigured');
  });
  it('accepts only the exact Bearer secret', () => {
    expect(checkCronAuth('Bearer s3cret', 's3cret')).toBe('ok');
    expect(checkCronAuth('s3cret', 's3cret')).toBe('unauthorized');
    expect(checkCronAuth(null, 's3cret')).toBe('unauthorized');
  });
});
