# Development plan — Rankall video reports

**Summary:** From a real AI-visibility scan to a personalized presenter video in one click — what was built during the hackathon window, in the order it was built, and what was deliberately cut or left out.

This plan covers the Meta Global AI Developer Hackathon entry: a personalized video report generated from a real scan of a business's visibility across AI platforms. The entry is a working product, not a video file alone — judges can open the live preview without logging in, pick a pre-scanned business, and watch its video play instantly.

## What existed before (not submission work)

The following existed before October 26 and are shown only as context. They are not claimed as hackathon work:

- The scan engine and platform scoring.
- Written reports and dashboards.
- Business pages. A business page appears only as a labeled secondary link on the delivery page ("this page already existed — the video is what's new"). No new business-page building happened during the window.

The early scaffold from before the window is likewise not presented as hackathon work. Everything below was built during the window.

## What was built, in order

### 1. Meta AI as the 12th scanned platform

Meta AI joined the scan as the 12th platform, live by default, via Meta's Model API (Muse Spark 1.3). New scans run 12 platforms. Scans from before Meta stay at their original count — nothing is backfilled. The October 8 Folsom demo still shows 7 of 11, with no Meta line, and that is correct, not an error.

### 2. Video pipeline core

The pipeline turns a real scan into a video: scan aggregates → script → director verification → narration → avatar render → delivery page. The script writer is Muse Spark 1.3. The director is an agent layer inside the pipeline: it chooses the wound angle (which loss to lead with), then reviews its own draft against the real scan data, rejecting weak hooks and overclaims before anything renders.

### 3. Delivery page, jobs dashboard, and front door

The delivery page shows the video, the business's real numbers, and one primary call to action: claim the full written report. A jobs dashboard lists video jobs and their states. A self-serve front door lets a visitor run a fresh scan and watch a video generate, with a Business / Person toggle over one shared scan pipeline. If a job fails, the page shows the failed stage and a retry — never a fake video.

### 4. Server-side hardening

The pipeline runs server-side so a browser close or a platform time limit cannot lose a render:

- A durable job store records every job and its checkpoints.
- A job checkpoints after every stage (input, script, director, narration asset, render start, render complete). A later poll resumes from the last checkpoint; a started render is only re-polled, never re-started.
- A stall past 10 minutes with no progress fails honestly with the failed stage.
- If the job store is unavailable, the preview answers with an honest service-unavailable response — it never silently falls back to in-memory storage.
- The live render path uses HeyGen v3 only, with ElevenLabs narration.
- A platform that fails during a scan is recorded as missing, never as zero.
- Cost capture reads the real wallet balance before and after each job, so the cost guard sees real spend.

### 5. Bounded script retries

When Spark returns empty content, the job stays processing and a later poll retries Spark — empty content only, maximum 3 attempts total — instead of falling back immediately. Proven live on October 28: two empty responses, then a Spark script on the third attempt; the job completed in 401 seconds for $2.17 (job `job_1793126697397_88e08dc1`). The retry logic was not weakened to make room for longer scripts.

### 6. Presenter and voice system

Presenters and voices are paired, and only listed presenters are accepted — anything else is rejected before any job or spend:

| Presenter | Voice |
|---|---|
| Dante | Eric |
| Julian | Eric |
| Abigail | Bella |
| Saoirse | Bella |

### 7. Judge Mode growth

Judge Mode is the no-login demo: pick a pre-scanned real business and watch its video play instantly. It grew in three steps:

- It opened with 3 demo cards.
- It then added 7 cards, one per remaining segment at the time, from real scans.
- It then added a low-scorer card: a generic-category scan that resolved to a real dental business, score 2, mentioned on 2 of 11 platforms (October 8, 2026). That card's video is 46.92 seconds, 15,484,181 bytes.
- Finally, the Personal demo card was replaced in place by a Gantos Dental Group card (see Decisions below). The page holds 11 cards today.

Every demo video is labeled with its real run date as a previously completed real run — never presented as freshly generated. Judge videos are committed files in the public repo, because the render provider's signed links expire after about 7 days.

### 8. Screen walkthrough demo video

The submitted demo video is a screen walkthrough with narration (2 minutes 17 seconds), not an avatar-only clip. It walks the front door, a fresh scan, a real video-report clip, the director and Meta beats, and a business-page segment labeled pre-existing. It is hosted on the public preview so it plays inline without logging in (8,675,519 bytes, video/mp4).

### 9. Script pacing target

The script prompt now targets about 840 characters (about 167 words) of total narration, measured from a real video: 50.44 seconds from 700 characters is about 14 characters per second, so 840 characters lands near 60 seconds. This is a code change only. No render was run to prove the new length, and none is claimed — a proof render needs a separate go-ahead.

### 10. Submission docs (this bundle)

These four documents — development plan, technical plan, test plan, and test scenarios — were written from real build and test evidence for judges to read alongside the demo video and writeup.

## Decisions and cuts

- **Faceless fallback cut.** A projection-based rule (estimate a video's cost from its script length; over $2, route to an image-per-scene video instead of an avatar) was designed and then cut for the submission. Avatar videos measure $1.70–$2.17, and the image-per-scene path's own cost was never measured, so no cheaper figure could be honestly claimed. The avatar path is used always. The idea can return after the submission.
- **Pacing target set.** The 840-character target above was set after the retry proof landed. The earlier design deliberately did not set it first, because longer scripts need more output tokens and Spark empties happen when reasoning eats the token budget.
- **Mistral account fix.** Mistral returned a rate-limit error on every scan for weeks. The cause was account allowance exhaustion, not code: the account was upgraded and its access rotated. A verification scan on October 27 mentioned 12 of 12 platforms with Mistral succeeding (scan `8d85ebea-9c97-4100-aa26-a98f026c611b`), and a second verification scan on October 30 also mentioned Mistral (scan `5a014aea-5f46-4685-87f7-1154eee6bc1f`). No code fix is claimed for an account limit.
- **Judge-card swap.** The Personal demo card's heading rendered the scan's tracked display name incorrectly, so the founder chose to replace it with a real company card instead of rewording it. The replacement is Gantos Dental Group (Naperville, dentist): score 2, mentioned on 0 of 11 platforms, run August 25, 2026 (scan `41fc6cf3-1e08-4667-b427-74d47d59869a`). The swap reused the video that already existed — no new scan, no new render, no spend. Consequence, stated plainly: with the Personal card gone, the 11 cards span 7 segments in substance (see the test plan's coverage note), and Gantos is the 5th dental card.
- **Open-weights review, designed but not wired.** A script-review pass on an open-weights model was designed as one real pipeline step. It is not connected to the live pipeline and is described here as designed, never as running. Wiring it needs provider access that was not in place during the window.
- **Demo video choice.** The screen walkthrough replaced the avatar-only demo as the submitted demo link, because it shows the real product (scan, video, numbers, claim) instead of only a presenter.
- **Product identification, prototype note only.** A short labeled note on the Judge Mode page describes a prototype: checking whether Meta AI identifies a business's own product correctly, misidentifies it, or substitutes a competitor's product, with ads and organic recommendations never mixed. A surface with no permitted method is labeled "pending", never scored. Full cross-platform tracking is post-submission work, not a submission claim.

## What was deliberately not built

- No second scoring system and no AI-overview system.
- No backfilling of new platforms onto old scans.
- No mock data in any demo content. Every demo video is a real scanned business.
- No pay-to-rank: scores come from real scans only.

## Team

- Representative: Nandish (founder, Rankall.io)
- Contributors: Nandish (founder, Representative) and Paras Pipalia — no other contributors.

## Links

- Public repo: https://github.com/rankallstartup-cell/rankall-video-report
- Judge demos (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- Live front door (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- Demo video (plays inline): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4
