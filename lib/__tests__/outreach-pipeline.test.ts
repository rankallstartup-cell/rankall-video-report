// lib/__tests__/outreach-pipeline.test.ts
// Outreach #5: nightly prospect pipeline. Tests the pure helpers plus the
// orchestrator against an in-memory PipelineDb — no network, no real DB.

import { describe, it, expect } from 'vitest';
import {
  getNightlyMax,
  canAttempt,
  candidateSkipReason,
  parseIntelligenceNotes,
  decideEnrollment,
  classifyRunScanResponse,
  runNightlyPipeline,
  dryRunNightlyPipeline,
  type PipelineDb,
  type OutreachTargetRow,
  type IntelligenceRow,
  type PipelineCandidate,
  type ScanProspectResult,
} from '@/lib/outreachPipeline';
import { cronAuthFailure } from '@/lib/cronAuth';

// --- In-memory PipelineDb ---------------------------------------------------

function makeFakeDb(seed: {
  targets?: OutreachTargetRow[];
  intelligence?: IntelligenceRow[];
  sequenceTargetIds?: string[];
  dnc?: string[];
  priorLogs?: Array<{ run_date: string; outcome: string }>;
}): PipelineDb & {
  targets: OutreachTargetRow[];
  sequence: Array<{ target_id: string }>;
  logs: Array<Record<string, unknown>>;
} {
  const targets: OutreachTargetRow[] = [...(seed.targets ?? [])];
  const intelligence: IntelligenceRow[] = [...(seed.intelligence ?? [])];
  const sequence = (seed.sequenceTargetIds ?? []).map((target_id) => ({ target_id }));
  const dnc = (seed.dnc ?? []).map((e) => e.toLowerCase());
  const logs: Array<Record<string, unknown>> = [...(seed.priorLogs ?? [])];
  let nextId = 1000;
  const nid = () => `t-${nextId++}`;
  return {
    targets,
    sequence,
    logs,
    async countAttempts(runDate) {
      return logs.filter(
        (l) => l.run_date === runDate && ['scanned', 'failed', 'scanned_enroll_failed'].includes(l.outcome as string),
      ).length;
    },
    async listUnscannedTargets(limit) {
      return targets
        .filter((t) => !t.scan_id && ['pending', 'queued'].includes(t.status ?? ''))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
        .slice(0, limit);
    },
    async listScannedUnenrolledTargets(limit) {
      return targets
        .filter((t) => !!t.scan_id && ['pending', 'queued'].includes(t.status ?? ''))
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
        .slice(0, limit);
    },
    async listNewIntelligence(limit) {
      return intelligence.filter((i) => i.status === 'new').slice(0, limit);
    },
    async findTargetByEmail(email) {
      return targets.find((t) => (t.email ?? '').toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findTargetByNameCity(name, city) {
      return (
        targets.find(
          (t) => (t.business_name ?? '').toLowerCase() === name.toLowerCase() && (t.city ?? '').toLowerCase() === city.toLowerCase(),
        ) ?? null
      );
    },
    async isOnDoNotContact(email) {
      return dnc.includes(email.toLowerCase());
    },
    async targetHasSequence(targetId) {
      return sequence.some((s) => s.target_id === targetId);
    },
    async emailHasSequence(email) {
      const ids = targets.filter((t) => (t.email ?? '').toLowerCase() === email.toLowerCase()).map((t) => t.id);
      return sequence.some((s) => ids.includes(s.target_id));
    },
    async insertTarget(row) {
      const id = nid();
      targets.push({ id, ...row } as OutreachTargetRow);
      return { id };
    },
    async updateTarget(id, patch) {
      const t = targets.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    },
    async insertSequenceRow(row) {
      sequence.push({ target_id: row.target_id as string });
      return true;
    },
    async insertLog(row) {
      logs.push(row);
    },
  };
}

const target = (over: Partial<OutreachTargetRow> & { id: string }): OutreachTargetRow => ({
  business_name: 'Acme Dental',
  owner_name: 'Alice',
  email: 'alice@acme.test',
  phone: null,
  city: 'Austin, TX',
  country_code: 'US',
  industry: 'Dentist',
  scan_id: null,
  rankall_score: null,
  competitor_name: null,
  status: 'pending',
  do_not_contact: false,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});

const okScan = (scanId = 'scan-1'): ScanProspectResult => ({
  ok: true, cached: false, scanId, score: 42, competitor: 'Rival Dental', error: null,
});

// --- Pure helpers ------------------------------------------------------------

describe('outreach pipeline helpers', () => {
  it('getNightlyMax defaults to 10 and clamps', () => {
    expect(getNightlyMax({})).toBe(10);
    expect(getNightlyMax({ OUTREACH_PIPELINE_NIGHTLY_MAX: '25' })).toBe(25);
    expect(getNightlyMax({ OUTREACH_PIPELINE_NIGHTLY_MAX: '999' })).toBe(50);
    expect(getNightlyMax({ OUTREACH_PIPELINE_NIGHTLY_MAX: '0' })).toBe(1);
    expect(getNightlyMax({ OUTREACH_PIPELINE_NIGHTLY_MAX: 'abc' })).toBe(10);
  });

  it('canAttempt respects the cap boundary', () => {
    expect(canAttempt(9, 10)).toBe(true);
    expect(canAttempt(10, 10)).toBe(false);
    expect(canAttempt(11, 10)).toBe(false);
  });

  it('candidateSkipReason flags DNC / missing fields', () => {
    const base = { email: 'a@b.test', industry: 'Dentist', city: 'Austin', doNotContact: false };
    expect(candidateSkipReason(base)).toBeNull();
    expect(candidateSkipReason({ ...base, doNotContact: true })).toBe('skipped_dnc');
    expect(candidateSkipReason({ ...base, email: null })).toBe('skipped_no_email');
    expect(candidateSkipReason({ ...base, industry: null })).toBe('skipped_no_industry');
    expect(candidateSkipReason({ ...base, city: null })).toBe('skipped_no_city');
  });

  it('parseIntelligenceNotes reads the JSON blob and survives garbage', () => {
    const parsed = parseIntelligenceNotes(JSON.stringify({
      industry: 'Dentist', location: 'Austin, TX', first_name: 'Alice', last_name: 'Smith', phone: '555-1', website: 'https://acme.test',
    }));
    expect(parsed).toEqual({ industry: 'Dentist', city: 'Austin, TX', ownerName: 'Alice Smith', phone: '555-1', website: 'https://acme.test' });
    expect(parseIntelligenceNotes('not json{{')).toEqual({ industry: null, city: null, ownerName: null, phone: null, website: null });
    expect(parseIntelligenceNotes(null)).toEqual({ industry: null, city: null, ownerName: null, phone: null, website: null });
  });

  it('decideEnrollment never double-enrols', () => {
    expect(decideEnrollment({ hasTargetSequence: false, hasEmailSequence: false }).enroll).toBe(true);
    expect(decideEnrollment({ hasTargetSequence: true, hasEmailSequence: false })).toEqual({ enroll: false, reason: 'skipped_already_enrolled' });
    expect(decideEnrollment({ hasTargetSequence: false, hasEmailSequence: true })).toEqual({ enroll: false, reason: 'skipped_duplicate_email' });
  });

  it('classifyRunScanResponse handles cached / fresh / failed', () => {
    expect(classifyRunScanResponse(true, { scanId: 's1', cached: true, overallScore: 10 })).toMatchObject({ ok: true, cached: true, scanId: 's1' });
    expect(classifyRunScanResponse(true, { scanId: 's2', overallScore: 20, competitor: { name: 'Rival' } })).toMatchObject({ ok: true, cached: false, scanId: 's2', competitor: 'Rival' });
    expect(classifyRunScanResponse(false, { error: 'boom' })).toMatchObject({ ok: false, error: 'boom' });
    expect(classifyRunScanResponse(true, { scanId: null, saveError: 'save failed' })).toMatchObject({ ok: false, error: 'save failed' });
  });

  it('unauthenticated cron call is rejected (cronAuthFailure)', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    try {
      const noAuth = cronAuthFailure(new Request('https://rankall.io/api/cron/outreach-pipeline'));
      expect(noAuth).not.toBeNull();
      expect(noAuth!.status).toBe(401);
      const withAuth = cronAuthFailure(
        new Request('https://rankall.io/api/cron/outreach-pipeline', { headers: { Authorization: 'Bearer test-secret' } }),
      );
      expect(withAuth).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});

// --- Orchestrator ------------------------------------------------------------

describe('runNightlyPipeline', () => {
  it('cap enforced: never exceeds max scan attempts', async () => {
    const db = makeFakeDb({
      targets: [1, 2, 3, 4, 5].map((i) => target({ id: `t-${i}`, email: `owner${i}@biz.test`, business_name: `Biz ${i}` })),
    });
    let scanCalls = 0;
    const result = await runNightlyPipeline({
      db,
      cap: 2,
      scanProspect: async () => { scanCalls++; return okScan(`scan-${scanCalls}`); },
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(scanCalls).toBe(2);
    expect(result.scanned).toBe(2);
    expect(result.capReached).toBe(true);
    expect(result.attemptsToday).toBe(2);
  });

  it('refuses to run when the cap is already reached', async () => {
    const db = makeFakeDb({
      targets: [target({ id: 't-1' })],
      priorLogs: [{ run_date: '2026-10-17', outcome: 'scanned' }],
    });
    let scanCalls = 0;
    const result = await runNightlyPipeline({
      db,
      cap: 1,
      scanProspect: async () => { scanCalls++; return okScan(); },
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(scanCalls).toBe(0);
    expect(result.capReachedAtStart).toBe(true);
    expect(result.considered).toBe(0);
  });

  it('scanned prospect is never re-scanned (enroll-only)', async () => {
    const db = makeFakeDb({ targets: [target({ id: 't-1', scan_id: 'scan-existing', status: 'queued' })] });
    let scanCalls = 0;
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async () => { scanCalls++; return okScan(); },
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(scanCalls).toBe(0);
    expect(result.enrolledOnly).toBe(1);
    expect(result.scanned).toBe(0);
    expect(db.sequence).toHaveLength(1);
  });

  it('already-enrolled prospect is never double-enrolled', async () => {
    const db = makeFakeDb({
      targets: [target({ id: 't-1' })],
      sequenceTargetIds: ['t-1'],
    });
    let scanCalls = 0;
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async () => { scanCalls++; return okScan(); },
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(scanCalls).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0].outcome).toBe('skipped_already_enrolled');
    expect(db.sequence).toHaveLength(1);
  });

  it('same email enrolled once: second target skipped as duplicate', async () => {
    const db = makeFakeDb({
      targets: [
        target({ id: 't-1', email: 'same@biz.test', business_name: 'Biz One' }),
        target({ id: 't-2', email: 'SAME@biz.test', business_name: 'Biz Two' }),
      ],
    });
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async (c: PipelineCandidate) => okScan(`scan-${c.targetId}`),
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(result.scanned).toBe(1);
    expect(result.results.map((r) => r.outcome)).toContain('skipped_duplicate_email');
    expect(db.sequence).toHaveLength(1);
  });

  it("one prospect's scan failure does not stop the batch", async () => {
    const db = makeFakeDb({
      targets: [
        target({ id: 't-1', business_name: 'Fails First' }),
        target({ id: 't-2', business_name: 'Succeeds Second', email: 'second@biz.test' }),
      ],
    });
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async (c: PipelineCandidate) =>
        c.targetId === 't-1'
          ? { ok: false, cached: false, scanId: null, score: null, competitor: null, error: 'platforms down' }
          : okScan('scan-2'),
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(result.failed).toBe(1);
    expect(result.scanned).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(db.sequence).toHaveLength(1);
  });

  it('DNC and missing-email prospects are skipped, not scanned', async () => {
    const db = makeFakeDb({
      targets: [
        target({ id: 't-1', business_name: 'DNC Biz', do_not_contact: true }),
        target({ id: 't-2', business_name: 'No Email Biz', email: null }),
        target({ id: 't-3', business_name: 'Good Biz', email: 'good@biz.test' }),
      ],
    });
    let scanCalls = 0;
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async () => { scanCalls++; return okScan(); },
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(scanCalls).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.scanned).toBe(1);
  });

  it('promotes outreach_intelligence rows into the queue', async () => {
    const intel: IntelligenceRow = {
      id: 'i-1', business_name: 'Intel Dental', email: 'intel@biz.test',
      country_code: 'US', status: 'new',
      notes: JSON.stringify({ industry: 'Dentist', location: 'Dallas, TX', first_name: 'Ivy' }),
    };
    const db = makeFakeDb({ intelligence: [intel] });
    const result = await runNightlyPipeline({
      db,
      cap: 10,
      scanProspect: async () => okScan('scan-intel'),
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(result.scanned).toBe(1);
    expect(result.results[0].outcome).toBe('scanned');
    // Promoted target row exists with the parsed industry/city.
    const promoted = db.targets.find((t) => t.business_name === 'Intel Dental');
    expect(promoted).toBeDefined();
    expect(promoted!.industry).toBe('Dentist');
    expect(promoted!.city).toBe('Dallas, TX');
    expect(promoted!.scan_id).toBe('scan-intel');
  });

  it('cached scan does not consume the cap', async () => {
    const db = makeFakeDb({
      targets: [
        target({ id: 't-1', business_name: 'Cached Biz' }),
        target({ id: 't-2', business_name: 'Fresh Biz', email: 'fresh@biz.test' }),
      ],
    });
    const result = await runNightlyPipeline({
      db,
      cap: 1,
      scanProspect: async (c: PipelineCandidate) =>
        c.targetId === 't-1'
          ? { ok: true, cached: true, scanId: 'scan-cached', score: 30, competitor: null, error: null }
          : okScan('scan-fresh'),
      now: new Date('2026-10-17T02:00:00Z'),
    });
    expect(result.cached).toBe(1);
    expect(result.scanned).toBe(1);
    expect(result.attemptsToday).toBe(1);
  });

  it('dry run reports without writing anything', async () => {
    const db = makeFakeDb({
      targets: [target({ id: 't-1' })],
      intelligence: [{ id: 'i-1', business_name: 'Intel Biz', email: 'intel@biz.test', country_code: 'US', status: 'new', notes: null }],
    });
    const dry = await dryRunNightlyPipeline(db, { cap: 10, now: new Date('2026-10-17T02:00:00Z') });
    expect(dry.dryRun).toBe(true);
    expect(dry.wouldScan).toHaveLength(1);
    expect(dry.intelligencePending).toBe(1);
    // No writes: no new targets, no sequence rows, no logs.
    expect(db.targets).toHaveLength(1);
    expect(db.sequence).toHaveLength(0);
    expect(db.logs).toHaveLength(0);
  });
});
