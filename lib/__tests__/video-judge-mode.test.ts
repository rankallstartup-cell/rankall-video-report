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
  it('lists exactly 11 demos with unique scanIds and durable video paths', () => {
    expect(JUDGE_DEMOS).toHaveLength(11);
    const ids = new Set(JUDGE_DEMOS.map((d) => d.scanId));
    expect(ids.size).toBe(11);
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

  it('covers the remaining tier-expansion demos (RT-109) after the RT-125 swap', () => {
    const expected: Array<[string, string, string]> = [
      ['a8bda6dc-51f0-44b6-af30-63b562856453', '/judge-videos/topo.mp4', 'Oct 28, 2026'],
      ['3923d3a8-5794-4913-9caf-fe36f25dadd8', '/judge-videos/sv-co.mp4', 'Oct 7, 2026'],
      ['26474355-ec64-4c70-bdb4-90bc27f0052f', '/judge-videos/acumatica.mp4', 'Oct 28, 2026'],
      ['8275ed3c-41c2-41e8-a202-544891eca315', '/judge-videos/marfa.mp4', 'Oct 28, 2026'],
      ['c617690f-d8d9-477d-9333-f59ef99b48dd', '/judge-videos/victorious.mp4', 'Oct 28, 2026'],
      ['5e252b03-1fdc-4928-822a-a4d4a94217aa', '/judge-videos/stumptown.mp4', 'Oct 28, 2026'],
    ];
    for (const [scanId, videoPath, date] of expected) {
      const demo = getJudgeDemo(scanId);
      expect(demo?.videoPath).toBe(videoPath);
      expect(demo?.runLabel).toContain(date);
    }
  });

  it('includes the score-2 Kinsler generic scan as a distinct eleventh demo (RT-78)', () => {
    const low = getJudgeDemo('2f5d9bbe-126d-41ca-81db-5568453fb610');
    expect(low?.videoPath).toBe('/judge-videos/kinsler-abigail-bella.mp4');
    expect(low?.runLabel).toContain('Oct 8, 2026');
    // The Oct 27 Kinsler 85 card is untouched: different scan, different file.
    expect(getJudgeDemo('c651634a-9ad0-4823-9f4e-3d42ab4ef3be')?.videoPath).toBe('/judge-videos/kinsler.mp4');
  });

  it('swaps the Paras demo for the Gantos demo (RT-125)', () => {
    // Paras is fully gone: no entry, no scan reference, no video reference.
    expect(getJudgeDemo('eb3ed289-7cfb-47a6-b0c4-7ef40667273b')).toBeNull();
    expect(JUDGE_DEMOS.some((d) => d.videoPath === '/judge-videos/paras.mp4')).toBe(false);
    const gantos = getJudgeDemo('41fc6cf3-1e08-4667-b427-74d47d59869a');
    expect(gantos?.videoPath).toBe('/judge-videos/gantos.mp4');
    expect(gantos?.runLabel).toContain('Aug 25, 2026');
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
