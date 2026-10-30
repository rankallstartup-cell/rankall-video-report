// Judge Mode helper tests: demos + how-it-was-made evidence mapping.
// Pure functions — no network, no store.
import { describe, expect, it } from 'vitest';
import {
  JUDGE_DEMOS,
  buildHowItWasMade,
  getJudgeDemo,
  preferTrackedName,
  type CompletedJobEvidence,
} from '../video/judgeMode';

const DANTE = 'ee25a2363ef941a1b5b0f7b1172e57d1';

function sparkJob(): CompletedJobEvidence {
  return {
    scriptSource: 'spark',
    avatarId: DANTE,
    stages: [
      { stage: 'script', status: 'ok', detail: '' },
      { stage: 'director', status: 'ok', detail: '13 numbers checked, 0 errors' },
      { stage: 'heygen-avatar', status: 'ok', detail: 'render completed after resume' },
    ],
  };
}

describe('judge demos', () => {
  it('lists exactly 3 demos with unique scanIds and durable video paths', () => {
    expect(JUDGE_DEMOS).toHaveLength(3);
    const ids = new Set(JUDGE_DEMOS.map((d) => d.scanId));
    expect(ids.size).toBe(3);
    for (const d of JUDGE_DEMOS) {
      expect(d.videoPath.startsWith('/judge-videos/')).toBe(true);
      expect(d.videoPath.endsWith('.mp4')).toBe(true);
    }
  });

  it('labels every demo as a previously completed real run with a date', () => {
    for (const d of JUDGE_DEMOS) {
      expect(d.runLabel).toContain('Previously completed real run');
    }
    expect(getJudgeDemo('cd149a50-d824-46ee-aab3-27fd465a225c')?.runLabel).toContain('Oct 8, 2026');
  });

  it('returns null for unknown scans', () => {
    expect(getJudgeDemo('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('preferTrackedName', () => {
  it('uses the tracked name only when the helper fell back to the raw input', () => {
    expect(preferTrackedName('dentist in folsom ca', 'dentist in folsom ca', 'Dentists of Folsom')).toBe(
      'Dentists of Folsom',
    );
  });

  it('leaves good helper names untouched', () => {
    expect(preferTrackedName('Tech Ridge Dental', 'Tech Ridge Dental in Austin, TX', 'Tech Ridge Dental')).toBe(
      'Tech Ridge Dental',
    );
    expect(
      preferTrackedName('Kinsler Family Dentistry - Julie D. Kinsler, DDS & Team', 'Kinsler Family Dentistry in Frankfort, IN', 'Kinsler Family Dentistry'),
    ).toBe('Kinsler Family Dentistry - Julie D. Kinsler, DDS & Team');
  });

  it('leaves the helper name when there is no tracked name', () => {
    expect(preferTrackedName('dentist in folsom ca', 'dentist in folsom ca', null)).toBe(
      'dentist in folsom ca',
    );
  });
});

describe('buildHowItWasMade', () => {
  it('returns null without a completed job', () => {
    expect(buildHowItWasMade(null, true)).toBeNull();
  });

  it('leads with Meta only when the scan actually includes Meta AI', () => {
    const withMeta = buildHowItWasMade(sparkJob(), true)!;
    expect(withMeta[0].name).toContain('Meta AI');
    expect(withMeta[0].name).toContain('12th');
    const withoutMeta = buildHowItWasMade(sparkJob(), false)!;
    expect(withoutMeta.some((s) => s.name.includes('Meta AI'))).toBe(false);
  });

  it('names Spark for spark scripts and flags the fallback honestly', () => {
    const spark = buildHowItWasMade(sparkJob(), true)!;
    expect(spark.some((s) => s.name.includes('Muse Spark wrote'))).toBe(true);
    const fallback = buildHowItWasMade(
      { scriptSource: 'rule-based-fallback', avatarId: DANTE, stages: sparkJob().stages },
      false,
    )!;
    expect(fallback.some((s) => s.name.includes('rule-based fallback'))).toBe(true);
  });

  it('passes the stored director detail through, verbatim', () => {
    const steps = buildHowItWasMade(sparkJob(), true)!;
    const director = steps.find((s) => s.name.includes('Director'));
    expect(director?.detail).toContain('13 numbers checked, 0 errors');
  });

  it('names Dante only for the Dante look id', () => {
    const dante = buildHowItWasMade(sparkJob(), true)!;
    expect(dante[dante.length - 1].detail).toContain('Dante');
    const other = buildHowItWasMade({ ...sparkJob(), avatarId: 'someone-else' }, true)!;
    expect(other[other.length - 1].detail).not.toContain('Dante');
  });
});
