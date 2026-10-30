import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isEmailSuppressed, isPreferenceOptedOut, shouldSkipEmail, type SuppressionReader, type PreferenceReader } from '../emailSuppression';

type Row = { email: string };
function fakeClient(tables: Record<string, Row[] | { error: unknown }>): SuppressionReader {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in(_col: string, values: string[]) {
              return {
                async limit() {
                  const t = tables[table];
                  if (t && !Array.isArray(t)) return { data: null, error: t.error };
                  return { data: (t ?? []).filter(r => values.includes(r.email)), error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('isEmailSuppressed (C)', () => {
  it('suppresses an address on do_not_contact (what /api/unsubscribe writes), case-insensitively', async () => {
    const c = fakeClient({ do_not_contact: [{ email: 'user@example.com' }] });
    expect(await isEmailSuppressed('User@Example.com', c)).toBe(true);
  });
  it('suppresses an address on the legacy outreach_unsubscribes list', async () => {
    const c = fakeClient({ do_not_contact: [], outreach_unsubscribes: [{ email: 'old@example.com' }] });
    expect(await isEmailSuppressed('old@example.com', c)).toBe(true);
  });
  it('allows an address on neither list', async () => {
    expect(await isEmailSuppressed('ok@example.com', fakeClient({ do_not_contact: [], outreach_unsubscribes: [] }))).toBe(false);
  });
  it('fails closed when do_not_contact cannot be read, and on empty input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await isEmailSuppressed('ok@example.com', fakeClient({ do_not_contact: { error: { code: '500', message: 'down' } } }))).toBe(true);
    expect(await isEmailSuppressed('', fakeClient({}))).toBe(true);
    expect(await isEmailSuppressed(null, fakeClient({}))).toBe(true);
  });
  it('a missing legacy table holds no suppressions', async () => {
    const c = fakeClient({ do_not_contact: [], outreach_unsubscribes: { error: { code: 'PGRST205', message: 'Could not find the table' } } });
    expect(await isEmailSuppressed('ok@example.com', c)).toBe(false);
  });
});

describe('every marketing / lifecycle sender checks suppression + the Settings toggle (C)', () => {
  // isEmailSuppressed() → shouldSkipEmail() (suppression + user_preferences):
  // the Settings toggles were saved but never read by any sender.
  const senders: Array<[string, string[]]> = [
    ['app/api/rescan-weekly/route.ts', ['weekly_report']],
    ['app/api/cron/score-decay-warning/route.ts', ['competitor_alerts']],
    ['app/api/cron/monthly-roi/route.ts', ['weekly_report']],
    ['app/api/cron/re-engagement/route.ts', ['marketing_emails']],
    ['app/api/cron/referral-invite/route.ts', ['marketing_emails']],
    ['app/api/milestone-email/route.ts', ['milestone_emails']],
    ['app/api/email-sequence/route.ts', ['marketing_emails']],
    ['app/api/cron/winback-email/route.ts', ['marketing_emails']],
    ['lib/weeklyReport.ts', ['weekly_report']],
    ['app/api/cron/personal-monitor/route.ts', ['weekly_report', 'competitor_alerts']],
    ['app/api/cron/agency-rescan/route.ts', ['competitor_alerts', 'weekly_report']],
    ['app/api/trigger-rescans/route.ts', ['competitor_alerts']],
    ['app/api/scan/route.ts', ['fix_recommendations']],
  ];
  it.each(senders)('%s calls shouldSkipEmail before sending, with its preference', (f, prefs) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).toMatch(/shouldSkipEmail\(/);
    expect(src).not.toMatch(/\bisEmailSuppressed\(/);
    for (const pref of prefs) expect(src).toContain(`'${pref}'`);
    const check = src.indexOf('shouldSkipEmail(');
    // The actual send call (re-engagement wraps Resend in sendResend()).
    const marker = src.includes('await sendResend(') ? 'await sendResend(' : src.includes('api.resend.com/emails') ? 'api.resend.com/emails' : 'sendEmail(';
    const send = src.lastIndexOf(marker);
    expect(check).toBeLessThan(send);
  });
});

type PrefResult = { data: Record<string, unknown> | null; error: unknown } | 'throw';
function fakePrefs(result: PrefResult): PreferenceReader {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (result === 'throw') throw new Error('boom');
                  return result;
                },
              };
            },
          };
        },
      };
    },
  };
}
const clean = fakeClient({ do_not_contact: [], outreach_unsubscribes: [] });

describe('isPreferenceOptedOut / shouldSkipEmail (Settings email toggles)', () => {
  it('no user_preferences row → send (existing users keep their emails)', async () => {
    expect(await isPreferenceOptedOut('u1', 'weekly_report', fakePrefs({ data: null, error: null }))).toBe(false);
    expect(await shouldSkipEmail({ email: 'ok@example.com', userId: 'u1' }, 'weekly_report', { suppression: clean, preferences: fakePrefs({ data: null, error: null }) })).toBe(false);
  });
  it('column explicitly false → skip', async () => {
    const prefs = fakePrefs({ data: { competitor_alerts: false }, error: null });
    expect(await isPreferenceOptedOut('u1', 'competitor_alerts', prefs)).toBe(true);
    expect(await shouldSkipEmail({ email: 'ok@example.com', userId: 'u1' }, 'competitor_alerts', { suppression: clean, preferences: prefs })).toBe(true);
  });
  it('column true or null → send', async () => {
    expect(await isPreferenceOptedOut('u1', 'milestone_emails', fakePrefs({ data: { milestone_emails: true }, error: null }))).toBe(false);
    expect(await isPreferenceOptedOut('u1', 'milestone_emails', fakePrefs({ data: { milestone_emails: null }, error: null }))).toBe(false);
  });
  it('user_preferences table not migrated → send', async () => {
    const prefs = fakePrefs({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.user_preferences'" } });
    expect(await isPreferenceOptedOut('u1', 'weekly_report', prefs)).toBe(false);
    expect(await shouldSkipEmail({ email: 'ok@example.com', userId: 'u1' }, 'weekly_report', { suppression: clean, preferences: prefs })).toBe(false);
  });
  it('any other read error (or a throw) → skip, fail closed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prefs = fakePrefs({ data: null, error: { code: '500', message: 'down' } });
    expect(await isPreferenceOptedOut('u1', 'fix_recommendations', prefs)).toBe(true);
    expect(await shouldSkipEmail({ email: 'ok@example.com', userId: 'u1' }, 'fix_recommendations', { suppression: clean, preferences: prefs })).toBe(true);
    expect(await isPreferenceOptedOut('u1', 'fix_recommendations', fakePrefs('throw'))).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
  it('a suppressed address is skipped even when the toggle is on', async () => {
    const dnc = fakeClient({ do_not_contact: [{ email: 'gone@example.com' }] });
    expect(await shouldSkipEmail({ email: 'gone@example.com', userId: 'u1' }, 'weekly_report', { suppression: dnc, preferences: fakePrefs({ data: { weekly_report: true }, error: null }) })).toBe(true);
  });
});
