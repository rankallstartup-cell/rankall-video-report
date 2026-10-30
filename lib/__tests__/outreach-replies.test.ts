/**
 * Tests for Outreach improvement #3 (ticket 14ypkw1b971): reply detection +
 * conversion tracking.
 *
 * Rules pinned here:
 * - A real human reply marks the target replied, stops the pending sequence,
 *   and records a reply event.
 * - Open/click NEVER marks replied (the Resend webhook only calls the reply
 *   handler for `email.received` — pinned by the source test below).
 * - Auto-responders / out-of-office mail NEVER marks replied.
 * - Malformed inbound payloads are rejected safely (no crash, no marks).
 * - A signup checkout with a matching email marks converted; unknown emails,
 *   already-converted, and unsubscribed targets are untouched.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isAutoReply,
  parseInboundReply,
  handleInboundReply,
  markOutreachConverted,
  OUTREACH_INBOX_ADDRESS,
} from '@/lib/outreachReplies';

// ── Minimal fake Supabase client: supports exactly the chains
// outreachReplies uses (select/eq/order/limit/maybeSingle/update/insert). ──

type Row = Record<string, any>;

class FakeDb {
  tables: Record<string, Row[]> = {
    outreach_targets: [],
    outreach_sequence_log: [],
    outreach_events: [],
  };
  calls: string[] = [];
  from(table: string) {
    return new FakeBuilder(this, table);
  }
}

class FakeBuilder {
  private filters: Array<(r: Row) => boolean> = [];
  private pendingUpdate: Row | null = null;
  private sortDesc = false;
  private limitN: number | null = null;
  constructor(private db: FakeDb, private table: string) {}
  select(_cols: string) { return this; }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  order(_col: string, opts?: { ascending?: boolean }) {
    if (opts?.ascending === false) this.sortDesc = true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  update(row: Row) {
    this.pendingUpdate = row;
    return this;
  }
  insert(row: Row) {
    const stored = { ...row, id: row.id ?? `id-${this.db.tables[this.table].length + 1}` };
    this.db.tables[this.table].push(stored);
    this.db.calls.push(`${this.table}.insert`);
    return Promise.resolve({ data: stored, error: null });
  }
  async maybeSingle() {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }
  async then(onF: any, onR?: any) {
    try {
      const result = await this.run();
      return onF ? onF(result) : result;
    } catch (e) {
      if (onR) return onR(e);
      throw e;
    }
  }
  private apply(): Row[] {
    let rows = this.db.tables[this.table].filter((r) => this.filters.every((f) => f(r)));
    if (this.sortDesc) rows = [...rows].reverse();
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }
  private async run() {
    if (this.pendingUpdate) {
      const rows = this.apply();
      for (const r of rows) Object.assign(r, this.pendingUpdate);
      this.db.calls.push(`${this.table}.update`);
      return { data: rows, error: null };
    }
    return { data: this.apply(), error: null };
  }
}

function seedDb() {
  const db = new FakeDb();
  db.tables.outreach_targets.push({
    id: 't1', email: 'owner@dentalpractice.com', status: 'contacted', created_at: '2026-10-01T00:00:00Z',
  });
  db.tables.outreach_sequence_log.push(
    { id: 's1', target_id: 't1', sequence_day: 3, status: 'pending', scheduled_for: '2026-10-17T09:00:00Z' },
    { id: 's2', target_id: 't1', sequence_day: 5, status: 'sent', scheduled_for: '2026-10-15T09:00:00Z' },
  );
  return db;
}

const HUMAN_REPLY = {
  from: 'Dr. Smith <owner@dentalpractice.com>',
  to: [OUTREACH_INBOX_ADDRESS],
  subject: 'Re: Your AI visibility report',
  headers: [{ name: 'Auto-Submitted', value: 'no' }],
  text: 'Hi, this looks interesting. Can we talk next week?',
};

describe('isAutoReply', () => {
  it('does NOT flag a normal human reply', () => {
    expect(isAutoReply({ headers: [{ name: 'Auto-Submitted', value: 'no' }], subject: 'Re: Your report', from: 'owner@dentalpractice.com' })).toBe(false);
    expect(isAutoReply({ subject: 'Sounds good, let us talk', from: 'person@company.com' })).toBe(false);
  });
  it('flags Auto-Submitted headers (except "no")', () => {
    expect(isAutoReply({ headers: [{ name: 'Auto-Submitted', value: 'auto-replied' }], subject: 'x', from: 'a@b.com' })).toBe(true);
    expect(isAutoReply({ headers: { 'Auto-Submitted': 'auto-generated' }, subject: 'x', from: 'a@b.com' })).toBe(true);
  });
  it('flags Precedence auto_reply/bulk/junk', () => {
    expect(isAutoReply({ headers: [{ name: 'Precedence', value: 'auto_reply' }], subject: 'x', from: 'a@b.com' })).toBe(true);
    expect(isAutoReply({ headers: [{ name: 'Precedence', value: 'bulk' }], subject: 'x', from: 'a@b.com' })).toBe(true);
  });
  it('flags out-of-office / automatic subjects', () => {
    for (const s of ['Out of Office', 'Automatic reply: I am away', 'Auto-Reply: Vacation', 'Delivery Status Notification (Failure)', 'Undeliverable: Your message']) {
      expect(isAutoReply({ subject: s, from: 'person@company.com' })).toBe(true);
    }
  });
  it('flags mailer-daemon / noreply senders', () => {
    expect(isAutoReply({ subject: 'hello', from: 'mailer-daemon@googlemail.com' })).toBe(true);
    expect(isAutoReply({ subject: 'hello', from: 'noreply@company.com' })).toBe(true);
    expect(isAutoReply({ subject: 'hello', from: 'postmaster@mail.com' })).toBe(true);
  });
});

describe('parseInboundReply', () => {
  it('parses string + object address forms', () => {
    expect(parseInboundReply(HUMAN_REPLY)?.fromEmail).toBe('owner@dentalpractice.com');
    expect(parseInboundReply({ from: { address: 'Owner@DentalPractice.com' }, to: 'outreach@rankall.io', subject: 'hi' })?.fromEmail).toBe('owner@dentalpractice.com');
  });
  it('returns null for malformed payloads', () => {
    expect(parseInboundReply(null)).toBeNull();
    expect(parseInboundReply({})).toBeNull();
    expect(parseInboundReply({ from: 'not-an-email' })).toBeNull();
    expect(parseInboundReply({ from: null })).toBeNull();
  });
});

describe('handleInboundReply', () => {
  it('marks a real reply: target replied + pending sequence stopped + event recorded', async () => {
    const db = seedDb();
    const res = await handleInboundReply(HUMAN_REPLY, db as any);
    expect(res).toEqual({ marked: true, targetId: 't1' });
    expect(db.tables.outreach_targets[0].status).toBe('replied');
    expect(db.tables.outreach_sequence_log.find((r) => r.id === 's1')!.status).toBe('stopped');
    expect(db.tables.outreach_sequence_log.find((r) => r.id === 's1')!.error).toBe('prospect_replied');
    // Already-sent touch is untouched.
    expect(db.tables.outreach_sequence_log.find((r) => r.id === 's2')!.status).toBe('sent');
    const evt = db.tables.outreach_events.find((r) => r.event_type === 'reply');
    expect(evt).toBeDefined();
    expect(evt!.email).toBe('owner@dentalpractice.com');
    expect(evt!.target_id).toBe('t1');
  });
  it('does NOT mark an auto-responder / out-of-office reply', async () => {
    const db = seedDb();
    const ooo = { ...HUMAN_REPLY, subject: 'Out of Office: I am on vacation until Monday', headers: [] };
    const res = await handleInboundReply(ooo, db as any);
    expect(res).toEqual({ marked: false, reason: 'auto_reply' });
    expect(db.tables.outreach_targets[0].status).toBe('contacted');
    expect(db.tables.outreach_events).toHaveLength(0);
  });
  it('does NOT mark mail sent to a different inbox', async () => {
    const db = seedDb();
    const res = await handleInboundReply({ ...HUMAN_REPLY, to: ['hello@rankall.io'] }, db as any);
    expect(res).toEqual({ marked: false, reason: 'not_outreach_inbox' });
    expect(db.tables.outreach_targets[0].status).toBe('contacted');
  });
  it('ignores replies from unknown senders (never guesses)', async () => {
    const db = seedDb();
    const res = await handleInboundReply({ ...HUMAN_REPLY, from: 'stranger@elsewhere.com' }, db as any);
    expect(res).toEqual({ marked: false, reason: 'unknown_sender' });
    expect(db.tables.outreach_targets[0].status).toBe('contacted');
  });
  it('rejects malformed payloads safely — no crash, no marks, no writes', async () => {
    const db = seedDb();
    for (const bad of [null, {}, { from: null }, { from: 'not-an-email' }, 'string', 42]) {
      const res = await handleInboundReply(bad, db as any);
      expect(res.marked).toBe(false);
    }
    expect(db.tables.outreach_targets[0].status).toBe('contacted');
    expect(db.tables.outreach_events).toHaveLength(0);
    expect(db.calls.filter((c) => c.includes('update'))).toHaveLength(0);
  });
  it('is idempotent: a second reply does nothing (sequence already stopped)', async () => {
    const db = seedDb();
    await handleInboundReply(HUMAN_REPLY, db as any);
    const res = await handleInboundReply(HUMAN_REPLY, db as any);
    expect(res).toEqual({ marked: false, reason: 'already_terminal' });
    expect(db.tables.outreach_events.filter((r) => r.event_type === 'reply')).toHaveLength(1);
  });
  it('does NOT mark an already-converted / unsubscribed target', async () => {
    const db = seedDb();
    db.tables.outreach_targets[0].status = 'converted';
    const res = await handleInboundReply(HUMAN_REPLY, db as any);
    expect(res).toEqual({ marked: false, reason: 'already_terminal' });
    expect(db.tables.outreach_targets[0].status).toBe('converted');
  });
});

describe('markOutreachConverted', () => {
  it('marks converted on a matching-email checkout + stops sequence + records event', async () => {
    const db = seedDb();
    const ok = await markOutreachConverted('OWNER@dentalpractice.com', 'stripe_checkout', db as any);
    expect(ok).toBe(true);
    expect(db.tables.outreach_targets[0].status).toBe('converted');
    expect(db.tables.outreach_sequence_log.find((r) => r.id === 's1')!.status).toBe('stopped');
    const evt = db.tables.outreach_events.find((r) => r.event_type === 'converted');
    expect(evt).toBeDefined();
    expect(evt!.metadata).toEqual({ source: 'stripe_checkout' });
  });
  it('upgrades replied → converted (a reply then a purchase is a conversion)', async () => {
    const db = seedDb();
    db.tables.outreach_targets[0].status = 'replied';
    expect(await markOutreachConverted('owner@dentalpractice.com', 'stripe_checkout', db as any)).toBe(true);
    expect(db.tables.outreach_targets[0].status).toBe('converted');
  });
  it('does NOT mark unknown emails, already-converted, or unsubscribed targets', async () => {
    const db = seedDb();
    expect(await markOutreachConverted('nobody@nowhere.com', 'stripe_checkout', db as any)).toBe(false);
    db.tables.outreach_targets[0].status = 'converted';
    expect(await markOutreachConverted('owner@dentalpractice.com', 'stripe_checkout', db as any)).toBe(false);
    db.tables.outreach_targets[0].status = 'unsubscribed';
    expect(await markOutreachConverted('owner@dentalpractice.com', 'stripe_checkout', db as any)).toBe(false);
    expect(db.tables.outreach_events).toHaveLength(0);
  });
  it('does NOT domain-match: a different person at the same company is not a conversion', async () => {
    const db = seedDb();
    expect(await markOutreachConverted('someone-else@dentalpractice.com', 'stripe_checkout', db as any)).toBe(false);
    expect(db.tables.outreach_targets[0].status).toBe('contacted');
  });
});

describe('resend webhook wiring (source pins)', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/webhooks/resend/route.ts'), 'utf8');
  it('calls the reply handler ONLY for email.received — opens/clicks never mark replied', () => {
    expect(src).toContain("case 'email.received'");
    expect(src).toContain('handleInboundReply(data)');
    // The handler must not appear in the opened/clicked branches: exactly
    // one call site, inside the email.received case.
    expect(src.split('await handleInboundReply(').length - 1).toBe(1);
  });
});
