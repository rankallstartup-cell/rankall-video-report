![Rankall video reports — scan in, video report out](assets/hero.svg)

> **At a glance** · **Track:** Startups · **Built with Meta's Model API (Muse Spark 1.3)** · **Meta AI is the 12th platform Rankall scans** · **Results:** 9 of 11 judge businesses score under 45; ~$2.02–$2.13 per ~55s video; Spark-script retry proven live Oct 28.

A business scans its AI visibility on Rankall, and gets back a **personalized
video report** — a presenter who tells that business, from its own
real scan numbers, where AI recommends it and where competitors are taking
its customers. Then one click claims the full written report.

## Submission files (hackathon-specific)

- **Judge demos** — pick a business, watch its video in under 30 seconds:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- **Demo video (screen walkthrough v4, ~87s)** — https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v4.mp4 (avatar opening, fresh scan, video-report clip, Meta + Director evidence, pre-existing note).
- **Submission writeup + packet** (markdown and Rankall-themed HTML): [docs/submission-writeup.md](docs/submission-writeup.md) ([HTML](docs/submission-writeup.html)), [docs/submission-packet.md](docs/submission-packet.md) ([HTML](docs/submission-packet.html)).
- **Technical & validation package** — development plan, technical plan, test plan, and test scenarios: [docs/technical-validation-documentation.md](docs/technical-validation-documentation.md).
- **Hackathon code** — `app/hackathon/video-report/` (front door, Judge Mode, delivery page, jobs dashboard), `lib/video/` (pipeline, Spark script, director, providers), `public/judge-videos/` (the 11 demo videos), `assets/` (the charts below).

Everything else in this repo is the pre-existing Rankall app, included so the
submission runs. The split is explicit: scan engine, platform scoring,
reports, dashboards, and business pages predate the window; the video
pipeline, Judge Mode, delivery page, and Meta integration are the
in-window build.

## Try it (no login)

- **Live front door** — run a fresh scan and watch a video generate:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report

Every demo video on the judge page is labeled with its real run date as a
**previously completed real run** — never presented as freshly generated.

## The wound, as a chart

![Scores of the 11 judge-page businesses](assets/wound-scores.svg)

Most of these businesses score under 45 — that's the wound Rankall shows,
from their own real scans.

## What it costs, measured

![Measured cost per video](assets/cost-per-video.svg)

## What broke, and what fixed it

![Spark script retry, proven Oct 28](assets/spark-retry.svg)

## How it works

![Pipeline: real scan to delivery page](assets/pipeline.svg)

## What was built during the hackathon (Oct 26 – Nov 4, 2026)

- **Video pipeline** — scan aggregates → script → director verification →
  narration → avatar render → delivery page, with a durable job store and
  checkpoint/resume so a 60-second serverless limit never loses a render.
- **Meta AI as the 12th scanned platform**, live by default, via Meta's Model
  API (Muse Spark 1.3). New scans run 12 platforms; pre-Meta demos keep
  their original platform count (the Oct 8 Folsom demo shows 7 of 11,
  with no Meta line — nothing backfilled).
- **Agentic director** — an agent layer inside the pipeline that reviews its
  own draft against the real scan JSON, rejects weak hooks and overclaims,
  and repairs them before rendering.
- **Judge Mode** — 11 pre-scanned real businesses with instantly playing
  videos, a visible Meta chain, and an on-page director report. Cards lead
  with the low scorers; the two 85s sit last as proof.
- **Delivery page + jobs dashboard + self-serve front door** (Business /
  Person toggle, one shared scan pipeline).
- **Bounded cross-invocation script retries** — when Spark returns empty
  content, the job stays processing and a later poll retries Spark (max 3
  attempts total) instead of falling back immediately. Proven live Oct 28:
  two empties, then a Spark script on the third attempt.

## Pre-existing (NOT hackathon work)

The scan engine, platform scoring, reports, dashboards, and business pages
existed before Oct 26 and appear only as context — the business page as a
labeled secondary link on the delivery page. No new business-page building
happened during the window.

## Product identification — prototype (in-window design note)

Muse (Meta AI) doesn't just recommend businesses — it identifies
products. The prototype asks whether it identifies YOUR product correctly,
misidentifies it, or substitutes a competitor's product, in an ad or an
organic recommendation (never mixed). The seller's own feed/catalog comes
first; a surface with no permitted method yet is labeled "pending", never
scored, and no product data is invented. Full cross-platform tracking is
post-Nov 4 build-phase work, not a submission claim.

## Honesty layer (what the video will never do)

- Scripts use **aggregates only** — the allowlist drops raw AI response text
  entirely, even nested. NULLs stay null, never backfilled.
- The director checks every number in the script against the scan JSON and
  rejects "zero referrals" / "hundreds" class overclaims and weak hooks.
- When Spark returns no usable script, the video uses a **flagged
  rule-based fallback** — flagged on the page, not hidden.
- A platform that fails a scan is recorded as missing, never zero.
- No mock data anywhere in demo content. Test fixtures are labeled.

## The 12 platforms, and tier coverage

Platforms: ChatGPT, Gemini, Google AI, Copilot, Perplexity, Grok, Claude,
DeepSeek, Mistral, Kimi, Groq, Meta AI (12th, new in-window).

Day 6 batch: one video per tier across all 8 tiers (Local, Personal,
Product, Agency, Enterprise, Government, SEO, Global Brand Intelligence).
Judge page: 11 businesses across 7 segments (the Personal card left the
page; the batch video remains part of the batch record).

## Measured numbers (no estimates presented as measurements)

- HeyGen v3 render: **~$2.02–2.13 per ~55s video (~$0.038/s)**,
  measured on real renders — above the <$1/video target; cost capture
  records real wallet-before/after spend per job, so the guard sees real
  numbers. The technical plan's $1.70–$2.17 range covers clean sequential
  runs (45–60 s); $2.02–$2.13 is the ~52–56 s subset at the same rate.
  The <$1 target is not met on v3; no cheaper figure is claimed.
- Full server-side video, wall time: 483s (first complete run),
  401s (script-fix re-test). HeyGen render time dominates.
- Day 6 batch: 8 videos, one per tier, $10.40 total (~$1.30/video
  average). All 8 used the flagged fallback (Spark empty on all 8) —
  that batch ran before the bounded retry existed.
- Retry proof (Oct 28): two Spark empties, third attempt landed a Spark
  script; job complete in 401s, $2.17.

## Open gaps (disclosed honestly)

- **Mistral**: RESOLVED Oct 27 — the weeks-long 429 was Free-plan exhaustion, not code. Account upgraded to Pro, key rotated, and the preview gate scan of Oct 27 20:59 CDT (scanId `8d85ebea-9c97-4100-aa26-a98f026c611b`) mentioned 12/12 platforms with Mistral AND Kimi both succeeding. No code fix is claimed for an account limit.
- **Kimi**: fixed in-window — empty-content retries escalate the token
  budget 300 → 1000 (reasoning is ~1,500 characters); verified live.
- **Demo video**: screen walkthrough v4, ~87s; https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v4.mp4.

## Run it locally

Standard Next.js commands (`npm install`, `npm run dev`) with these
environment variables set: `MODEL_API_KEY` (Meta Model API),
`HEYGEN_API_KEY`, `ELEVENLABS_API_KEY`, Supabase URL + anon +
service-role keys, and `HACKATHON_VIDEO_REPORT_ENABLED=1`. No secrets are
committed to this repo.

## Team

- Representative: Nandish (founder, Rankall.io)
- Contributors: Nandish (founder, Representative) and Paras Pipalia — no other contributors.

## Attribution

Built with Meta's Model API (Muse Spark), HeyGen, and ElevenLabs (licensed
account). Open-source licenses are noted in the public repo. AI-assisted
build is disclosed; every demo number comes from a real scan.
