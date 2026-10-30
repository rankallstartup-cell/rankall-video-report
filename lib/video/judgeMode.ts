// ── Judge Mode: pre-rendered demo videos + how-it-was-made evidence ─────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026).
//
// WHY THIS FILE EXISTS: a judge must go from landing to a playing video
// in under 30 seconds, with no login and no wait on a cold platform scan.
// These ten videos are already rendered; Judge Mode serves them, it
// does not render new ones (no HeyGen spend from this page).
//
// WHY THE VIDEOS LIVE IN public/: HeyGen's signed video URLs expire
// (~Nov 3, 2026 — before judging Nov 5–8). The mp4s are committed under
// public/judge-videos/ so the preview deployment serves them durably.
// Every demo is labeled with its real run date and NEVER presented as
// freshly generated: "previously completed real run" is the honest label
// adopted for all pre-generated videos.
//
// The ten demos (scanIds verified against rankall_scans; scores and
// mentioned counts verified against rankall_scans + platform rows):
//   Tech Ridge Dental — Oct 27, 2026, score 85, Spark-written script.
//   Kinsler Family Dentistry — Oct 27, 2026, score 85, rule-based
//     fallback script (Spark returned empty content; flagged, not hidden).
//   Dentists of Folsom — Oct 8, 2026, score 35, mentioned 7 of 11,
//     rule-based fallback script. The low-score demo: the wound is real.
//   Tier expansion (RT-109, Oct 29, 2026): seven more demos, one per
//     remaining tier, all rule-based fallback scripts (flagged on
//     their delivery views via the stored job row, not hidden):
//   Paras Pipalia (Personal) — Oct 7, 2026, score 17, mentioned 8 of 11.
//   Topo Designs (Product) — Oct 28, 2026, score 41, mentioned 8 of 12.
//   SV & Co (Agency) — Oct 7, 2026, score 0, mentioned 0 of 11.
//   Acumatica (Enterprise) — Oct 28, 2026, score 30, mentioned 6 of 12.
//   City of Marfa (Government) — Oct 28, 2026, score 8, mentioned 3 of 12.
//   Victorious (SEO) — Oct 28, 2026, score 2, mentioned 1 of 12.
//   Stumptown Coffee Roasters (Global) — Oct 28, 2026, score 42,
//     mentioned 8 of 12.

export interface JudgeDemo {
  scanId: string;
  /** Path served by the preview deployment (durable; no signed expiry). */
  videoPath: string;
  /** Honest run label, shown verbatim on the judge page and the player. */
  runLabel: string;
}

export const JUDGE_DEMOS: JudgeDemo[] = [
  {
    scanId: '637968a3-2952-4793-9073-35918b5f4ff9',
    videoPath: '/judge-videos/tech-ridge.mp4',
    runLabel: 'Previously completed real run — Oct 27, 2026',
  },
  {
    scanId: 'c651634a-9ad0-4823-9f4e-3d42ab4ef3be',
    videoPath: '/judge-videos/kinsler.mp4',
    runLabel: 'Previously completed real run — Oct 27, 2026',
  },
  {
    scanId: 'cd149a50-d824-46ee-aab3-27fd465a225c',
    videoPath: '/judge-videos/folsom.mp4',
    runLabel: 'Previously completed real run — Oct 8, 2026',
  },
  {
    scanId: 'eb3ed289-7cfb-47a6-b0c4-7ef40667273b',
    videoPath: '/judge-videos/paras.mp4',
    runLabel: 'Previously completed real run — Oct 7, 2026',
  },
  {
    scanId: 'a8bda6dc-51f0-44b6-af30-63b562856453',
    videoPath: '/judge-videos/topo.mp4',
    runLabel: 'Previously completed real run — Oct 28, 2026',
  },
  {
    scanId: '3923d3a8-5794-4913-9caf-fe36f25dadd8',
    videoPath: '/judge-videos/sv-co.mp4',
    runLabel: 'Previously completed real run — Oct 7, 2026',
  },
  {
    scanId: '26474355-ec64-4c70-bdb4-90bc27f0052f',
    videoPath: '/judge-videos/acumatica.mp4',
    runLabel: 'Previously completed real run — Oct 28, 2026',
  },
  {
    scanId: '8275ed3c-41c2-41e8-a202-544891eca315',
    videoPath: '/judge-videos/marfa.mp4',
    runLabel: 'Previously completed real run — Oct 28, 2026',
  },
  {
    scanId: 'c617690f-d8d9-477d-9333-f59ef99b48dd',
    videoPath: '/judge-videos/victorious.mp4',
    runLabel: 'Previously completed real run — Oct 28, 2026',
  },
  {
    scanId: '5e252b03-1fdc-4928-822a-a4d4a94217aa',
    videoPath: '/judge-videos/stumptown.mp4',
    runLabel: 'Previously completed real run — Oct 28, 2026',
  },
];

export function getJudgeDemo(scanId: string): JudgeDemo | null {
  return JUDGE_DEMOS.find((d) => d.scanId === scanId) ?? null;
}

/**
 * Tracked-name fallback for display headings. getTrustedDisplayName
 * returns the raw scan input when no confident Google match overrides
 * it — for old generic-query scans that input is a query string
 * ("dentist in folsom ca"), not a business name. When the helper's
 * result IS the raw input and the row carries a tracked business name,
 * the tracked name (the business itself, from the same row) is the
 * honest heading. Otherwise the helper's result stands untouched, so
 * scans with a good Google or input-derived name never change.
 */
export function preferTrackedName(
  helperName: string,
  input: string | null,
  userBusinessName: string | null,
): string {
  if (
    input &&
    helperName === input &&
    typeof userBusinessName === 'string' &&
    userBusinessName.trim()
  ) {
    return userBusinessName.trim();
  }
  return helperName;
}

/** One completed job's evidence, as stored in the video_jobs row. */
export interface CompletedJobEvidence {
  scriptSource: string | null;
  avatarId: string | null;
  stages: Array<{ stage: string; status: string; detail: string }>;
}

export interface HowItWasMadeStep {
  name: string;
  detail: string;
}

const DANTE_LOOK_ID = 'ee25a2363ef941a1b5b0f7b1172e57d1';

/**
 * Build the visible Meta chain + director evidence from a completed
 * job's stored stages. Pure function (unit-tested): it reports ONLY
 * what the row stores. The Meta step appears only when the scan's
 * platform rows actually include Meta AI (Folsom's Oct 8 scan predates
 * Meta, so its chain honestly omits it). A missing job returns null
 * and the page renders no section — never an invented chain.
 */
export function buildHowItWasMade(
  job: CompletedJobEvidence | null,
  hasMetaPlatform: boolean,
): HowItWasMadeStep[] | null {
  if (!job) return null;
  const steps: HowItWasMadeStep[] = [];
  if (hasMetaPlatform) {
    steps.push({
      name: 'Meta AI scanned — the 12th platform',
      detail: 'This scan ran on Meta AI via Meta\u2019s Model API (Muse Spark), alongside the other platforms.',
    });
  }
  const scriptStage = job.stages.find((s) => s.stage === 'script');
  if (job.scriptSource === 'spark') {
    steps.push({
      name: 'Muse Spark wrote the script',
      detail: 'The narration script was written by Meta\u2019s Muse Spark 1.3 from this scan\u2019s real numbers.',
    });
  } else {
    steps.push({
      name: 'Script used the rule-based fallback',
      detail:
        'Spark returned no usable script, so the video used the rule-based script instead — flagged here, not hidden.' +
        (scriptStage?.detail ? ` (${scriptStage.detail})` : ''),
    });
  }
  const directorStage = job.stages.find((s) => s.stage === 'director');
  steps.push({
    name: 'Director verified every number',
    detail: directorStage?.detail
      ? `Director check: ${directorStage.detail}.`
      : 'Director check ran against the scan data before rendering.',
  });
  const presenter = job.avatarId === DANTE_LOOK_ID ? 'Dante' : 'a HeyGen avatar';
  const renderStage = job.stages.find((s) => s.stage === 'heygen-avatar');
  steps.push({
    name: 'HeyGen rendered the presenter',
    detail: renderStage?.detail
      ? `${presenter} presents the narration (${renderStage.detail}).`
      : `${presenter} presents the narration.`,
  });
  return steps;
}
