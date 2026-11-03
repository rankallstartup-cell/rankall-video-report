# Submission writeup — SIGNED OFF Oct 31, 2026 (frozen for Nov 4 submission). Amended Oct 31: line 37 tiers → segments by founder decision (RT-133); all other lines as signed off Oct 31.

For the Cerebral Valley platform, Day 8 packaging. Demo video (walkthrough v3, 2:17) is founder-approved and contributors are locked (Nandish + Paras only). Public repo is pushed and the demo link is live below (lines 20 and 90). Signed off Oct 31, 2026 — frozen for Nov 4 submission.

## What it is

Rankall scans a business's visibility across AI platforms and tells it
whether AI recommends it or its competitors. For this hackathon we built
the next step: from a real scan, Rankall generates a **personalized
video report** — a presenter who tells that business, from its
own real numbers, where AI recommends it and where competitors are
taking its customers. One click claims the full written report.

## Try it (no login)

- **Judge demos** — pick a business, watch its video in under 30 seconds:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- **Live front door** — run a fresh scan and watch a video generate:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- **Demo video (screen walkthrough v3, 2:17, founder-approved Oct 27)** — https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4 (front door, fresh scan, real video-report clip, director + Meta beats, business-page segment labeled pre-existing).

Every demo video on the judge page is labeled with its real run date as a
previously completed real run — never presented as freshly generated.

## What was built Oct 26 – Nov 4 (in-window work — the submission)

- **Video pipeline**: scan aggregates → script → director verification →
  narration → avatar render → delivery page, with a durable job store and
  checkpoint/resume so a 60-second serverless limit never loses a render.
- **Meta AI as the 12th scanned platform**, live by default, via Meta's
  Model API (Muse Spark 1.3). New scans run 12 platforms; pre-Meta demos
  keep their original platform count (the Oct 8 Folsom demo shows 7 of
  11, with no Meta line — nothing backfilled).
- **Agentic director**: an agent layer inside the pipeline that reviews
  its own draft against the real scan JSON, rejects weak hooks and
  overclaims, and repairs them before rendering.
- **Judge Mode**: 11 pre-scanned real businesses across 7 segments with
  instantly playing videos, plus a visible Meta chain and on-page
  director report.
- **Delivery page + jobs dashboard + self-serve front door** (Business /
  Person toggle, one shared scan pipeline).
- **Bounded cross-invocation script retries**: when Spark returns empty
  content, the job stays processing and a later poll retries Spark (max
  3 attempts total), instead of falling back immediately. Proven live:
  two empties, then a Spark script on the third attempt.
- **Product identification — prototype note** (design note, not a
  tracking claim): Muse (Meta AI) identifies products, and Rankall checks
  whether it identifies YOUR product correctly, misidentifies it, or
  substitutes a competitor's product — ad vs organic never mixed. The
  Judge Mode page carries a short labeled note; the demo hero stays the
  low scorer. Full cross-platform tracking is post-Nov 4 work.

## Pre-existing (NOT hackathon work)

The scan engine, platform scoring, reports, dashboards, and business
pages existed before Oct 26 and appear only as context. The business
page is a labeled secondary link ("this page already existed — the video
is what's new"). No new business-page building happened in-window.

## How it works (architecture, in words)

A real scan produces aggregates only — raw AI response text is dropped
by an allowlist, even nested, and NULLs stay null, never backfilled.
Muse Spark 1.3 writes the script; the director agent checks every number
against the scan JSON and rejects overclaims; ElevenLabs (Eric voice)
narrates; HeyGen v3 (Dante avatar) renders; the delivery page shows the
video, the numbers, and one claim CTA. A job checkpoints after every
stage in Supabase (input, script, director, narration asset,
render-start, render-complete); a later poll resumes from the last
checkpoint; a started render is only re-polled, never re-started; a
stall past 10 minutes with no progress fails honestly with the failed
stage. When Spark returns no usable script, the video uses a flagged
rule-based fallback — flagged on the page, not hidden.

## Measured numbers only

- HeyGen v3 render: ~$2.02–2.13 per ~55s video (~$0.038–0.039/s),
  measured on real renders — above the <$1/video target; cost capture
  records real wallet-before/after spend per job.
- Full server-side video, wall time: 483s (first complete run),
  401s (script-fix re-test). HeyGen render time dominates.
- Day 6 batch: 8 videos, one per tier (Local, Personal, Product, Agency,
  Enterprise, Government, SEO, Global Brand Intelligence), $10.40 total
  (~$1.30/video average). All 8 used the flagged fallback (Spark empty
  on all 8) — the retry above is the fix, proven after the batch.

## Open gaps, disclosed honestly

- **Mistral**: RESOLVED Oct 27 — the weeks-long 429 was Free-plan exhaustion, not code. Account upgraded to Pro, key rotated, and the preview gate scan of Oct 27 20:59 CDT (scanId `8d85ebea-9c97-4100-aa26-a98f026c611b`) mentioned 12/12 platforms with Mistral AND Kimi both succeeding. No code fix is claimed for an account limit; the account fix is what closed the gate. Staging re-scan Oct 30 (scanId `5a014aea-5f46-4685-87f7-1154eee6bc1f`) also mentioned Mistral, closing RT-32.
- **Kimi**: fixed in-window — empty-content retries escalate the token
  budget 300 → 1000 (reasoning is ~1,500 characters); verified live.
- **Demo video**: screen walkthrough v3, 2:17, founder-approved Oct 27, https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4.

## Team

- Representative: Nandish (founder, Rankall.io)
- Contributors: Nandish (founder, Representative) and Paras Pipalia — no other contributors.

## Attribution

Built with Meta's Model API (Muse Spark), HeyGen, and ElevenLabs
(licensed account). Open-source licenses are noted in the public repo.
AI-assisted build is disclosed; every demo number comes from a real scan.
No live consumer Muse scanning or live cross-platform tracking is
claimed; surfaces with no permitted method are labeled "pending", never
scored.
