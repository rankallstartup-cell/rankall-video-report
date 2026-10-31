# Technical plan — Rankall video reports

**Summary:** How a real scan becomes a presenter video: the pipeline stages, the job store that survives interruptions, the honesty rules the video can never break, and the measured cost and limits.

## Pipeline, stage by stage

A visitor's scan produces aggregates only. From there, the pipeline runs in order:

1. **Scan aggregates.** The scan result is reduced to aggregates (scores, mention counts, competitor comparisons). Raw AI response text is dropped by an allowlist, even when nested.
2. **Script.** Muse Spark 1.3 writes the narration script from the aggregates, working within a 4,000-token budget for script work.
3. **Director review.** The director agent checks every number in the draft against the scan data. It rejects overclaims (for example, "zero referrals" or "hundreds" class claims) and weak hooks, and repairs them before rendering.
4. **Narration.** ElevenLabs narrates the approved script (Eric voice on the default path).
5. **Render.** HeyGen v3 renders the presenter video (Dante avatar on the default path), 720p, 16:9.
6. **Delivery page.** The page shows the video, the business's real numbers, one primary call to action (claim the full written report), and a labeled secondary link to the pre-existing business page where one exists.

```
Real scan → aggregates only → Spark script → director review
→ ElevenLabs narration → HeyGen v3 render → delivery page
```

## Job store, checkpoints, and honest failure

Video jobs live in a durable job store (the `video_jobs` table). Every job checkpoints after each stage: input, script, director, narration asset, render start, render complete.

- A later poll resumes from the last checkpoint. A started render is only re-polled, never re-started, so no work or spend is duplicated.
- A stall past 10 minutes with no progress fails honestly, naming the failed stage. The failure state clears the job's resume data so a failed job is never mistaken for a resumable one.
- If the job store is unavailable, the preview answers with an honest service-unavailable response. It never silently falls back to in-memory storage on the preview.
- The front door and jobs dashboard read job state from the same store, so what a visitor sees matches what the pipeline recorded.

## Script, director, and retries

- **Spark retry.** When Spark returns empty content, the job stays processing and a later poll retries Spark — empty content only, maximum 3 attempts total. Proven live on October 28: two empty responses, then a Spark script on the third attempt; the job completed in 401 seconds for $2.17 (job `job_1793126697397_88e08dc1`).
- **Kimi fix.** When the Kimi platform returns empty content because reasoning consumed the token budget, the retry escalates the token budget from 300 to 1,000. Verified live.
- **Flagged fallback.** When Spark returns no usable script after retries, the video uses a rule-based fallback script — flagged on the delivery view from the stored job record, not hidden. Judge cards themselves show run labels only; no per-card badge is claimed.
- **Retry discipline.** Retry logic was not weakened to make room for longer scripts. The pacing target (about 840 characters) shipped with retries exactly as proven.

## Presenters and voices

Only listed presenters are accepted, and each maps to one voice. Anything else is rejected before any job or spend:

| Presenter | Voice |
|---|---|
| Dante | Eric |
| Julian | Eric |
| Abigail | Bella |
| Saoirse | Bella |

A missing or unlisted presenter id is rejected; there is no silent default to a different presenter.

## Honesty layer

These rules hold for every video, with no exceptions:

- Scripts use aggregates only. Raw AI response text is dropped entirely, even nested.
- NULLs stay null, never backfilled. A platform that fails a scan is recorded as missing, never as zero.
- The director checks every scripted number against the scan data.
- Fallback scripts are flagged on the delivery view, not hidden.
- Pre-existing scans keep their original platform counts. New scans run 12 platforms; older demos keep 11 or fewer, with no Meta line added after the fact.
- No mock data in demo content. Every demo video is a real scanned business.

## The 12 platforms

ChatGPT, Gemini, Google AI, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, and Meta AI (12th, added during the window). The front door states the count plainly: new scans run 12 platforms.

## Measured cost and time

All figures below are measured on real runs. Nothing here is an estimate presented as a measurement.

| Measure | Value | Evidence |
|---|---|---|
| HeyGen v3 render, 45–60 s video | $1.70–$2.17 | Clean sequential runs through the retry proof |
| HeyGen v3 rate | About $0.038 per second | Reproduces every measured cost from video length |
| Full server-side video, wall time | 483 s (first complete run); 401 s (retry-proof run) | Job records; render time dominates |
| Screen walkthrough demo video | 2 min 17 s, 8,675,519 bytes | Committed file, plays inline |
| Judge demo videos | 40.0–46.9 s each | Committed files, verified at exact bytes |

Cost method: the render provider's API returns no per-video charge, only a wallet balance. Cost is therefore measured as the wallet balance before and after each job — and only for strictly sequential runs. Two warnings from real data:

- The Day 6 batch total ($10.40 for 8 videos) is real spend, but $10.40 ÷ 8 = $1.30 per video is an accounting artifact, not a unit cost: the batch ran with an auto-reload landing mid-batch and overlapping jobs. Never quote $1.30 as a per-video cost.
- The sub-$1 per video target is not met on v3 at useful length: at about $0.038 per second, $1 buys about 26 seconds of video, which cannot carry the pain, the real numbers, the director evidence, and the call to action. The honest position is about $2 per video; sub-$1 is post-submission work (a cheaper engine or a different format), not a submission claim.

## Limits and failure behavior

| Situation | Behavior |
|---|---|
| Render provider links expire (about 7 days) | Judge videos are committed files in the public repo, so judging artifacts do not expire |
| Short serverless time limit | Checkpoints and poll-driven resume; a render is never lost to the limit |
| Spark returns empty content | Retry, empty-content only, max 3 attempts; then flagged fallback |
| Platform returns empty content (token budget) | Retry with escalated token budget (300 → 1,000) |
| Platform fails a scan | Recorded as missing, never zero |
| Job store unavailable | Honest service-unavailable response, never silent in-memory fallback on the preview |
| Stall past 10 minutes, no progress | Honest failure naming the failed stage |
| Scan-starting action clicked by mistake | Not part of testing: destination checks use link inspection only, never a click that would start a real scan |

## Running it locally

Standard Next.js commands (`npm install`, `npm run dev`) with the provider configuration set as environment variables and the video-report feature flag enabled. The public repo carries the submission code, the judge videos, and these docs.

## Links

- Public repo: https://github.com/rankallstartup-cell/rankall-video-report
- Judge demos (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- Live front door (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- Demo video (plays inline): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4
