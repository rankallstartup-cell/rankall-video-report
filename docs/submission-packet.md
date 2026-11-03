# Nov 4 submission packet — SIGNED-OFF TEXT Oct 31, 2026 (submit act still founder's, Nov 4). Amended Oct 31: line 37 tiers → segments by founder decision (RT-133); all other lines as signed off Oct 31. Amended Nov 2: cost clarification, README note resolved-and-live, checklist boxes, full contributor names, + refined form-texts appendix (founder review); signed-off body otherwise unchanged.

Copy-ready assembly for the Cerebral Valley submission. Everything below
comes from the approved drafts; nothing new is claimed. Final text was
signed off by the founder Oct 31, 2026 (tracker #38, Nov 1 freeze met), and
the submit act itself (tracker #39) is the founder's on Nov 4.

## Links (verified live Oct 30 evening CDT)

- Demo video (screen walkthrough v3, 2:17, plays inline):
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4
- Judge demos (11 real businesses, 7 segments, no login):
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- Live front door (fresh scan → video):
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- Public repo: https://github.com/rankallstartup-cell/rankall-video-report

## People

- Representative: Nandish Patel (founder, Rankall.io)
- Contributors: Nandish Patel (founder, Representative) and Paras Pipalia —
  no other contributors.

## Profile one-liner (Cerebral Valley profile — fixed by founder Oct 30)

Founder of Rankall.io — AI visibility monitoring that shows any
business whether AI recommends them or their competitors, across 12 AI
platforms.

## Submission text (from submission-writeup-draft.md, signed off Oct 31, 2026)

### What it is

Rankall scans a business's visibility across AI platforms and tells it
whether AI recommends it or its competitors. For this hackathon we built
the next step: from a real scan, Rankall generates a personalized
video report — a presenter who tells that business, from its
own real numbers, where AI recommends it and where competitors are
taking its customers. One click claims the full written report.

### Try it (no login)

- Judge demos — pick a business, watch its video in under 30 seconds:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- Live front door — run a fresh scan and watch a video generate:
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- Demo video (screen walkthrough v3, 2:17, founder-approved Oct 27) —
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4
  (front door, fresh scan, real video-report clip, director + Meta
  beats, business-page segment labeled pre-existing).

Every demo video on the judge page is labeled with its real run date as
a previously completed real run — never presented as freshly generated.

### What was built Oct 26 – Nov 4 (in-window work — the submission)

- Video pipeline: scan aggregates → script → director verification →
  narration → avatar render → delivery page, with a durable job store
  and checkpoint/resume so a 60-second serverless limit never loses a
  render.
- Meta AI as the 12th scanned platform, live by default, via Meta's
  Model API (Muse Spark 1.3). New scans run 12 platforms; pre-Meta demos
  keep their original platform count (the Oct 8 Folsom demo shows 7 of
  11, with no Meta line — nothing backfilled).
- Agentic director: an agent layer inside the pipeline that reviews its
  own draft against the real scan JSON, rejects weak hooks and
  overclaims, and repairs them before rendering.
- Judge Mode: 11 pre-scanned real businesses across 7 segments with
  instantly playing videos, plus a visible Meta chain and on-page
  director report.
- Delivery page + jobs dashboard + self-serve front door (Business /
  Person toggle, one shared scan pipeline).
- Bounded cross-invocation script retries: when Spark returns empty
  content, the job stays processing and a later poll retries Spark (max
  3 attempts total), instead of falling back immediately. Proven live:
  two empties, then a Spark script on the third attempt.
- Product identification — prototype note (design note, not a tracking
  claim): Muse (Meta AI) identifies products, and Rankall checks whether
  it identifies YOUR product correctly, misidentifies it, or substitutes
  a competitor's product — ad vs organic never mixed. The Judge Mode
  page carries a short labeled note; the demo hero stays the low scorer.
  Full cross-platform tracking is post-Nov 4 work.

### Pre-existing (NOT hackathon work)

The scan engine, platform scoring, reports, dashboards, and business
pages existed before Oct 26 and appear only as context. The business
page is a labeled secondary link ("this page already existed — the video
is what's new"). No new business-page building happened in-window.

### How it works (architecture, in words)

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

### Measured numbers only

- HeyGen v3 render: ~$2.02–2.13 per ~55s video (~$0.038/s),
  measured on real renders — above the <$1/video target; cost capture
  records real wallet-before/after spend per job.
  Clarification (Nov 2): the technical plan's $1.70–$2.17 range is the observed range across clean sequential runs (45–60 s); $2.02–$2.13 is the ~52–56 s subset of that range (Kinsler 52.4 s, Tech Ridge 55.8 s) at the same rate — both measured, no contradiction.
- Full server-side video, wall time: 483s (first complete run),
  401s (script-fix re-test). HeyGen render time dominates.
- Day 6 batch: 8 videos, one per tier (Local, Personal, Product, Agency,
  Enterprise, Government, SEO, Global Brand Intelligence), $10.40 total
  (~$1.30/video average). All 8 used the flagged fallback (Spark empty
  on all 8) — the retry above is the fix, proven after the batch.

### Open gaps, disclosed honestly

- Mistral: RESOLVED Oct 27 — the weeks-long 429 was Free-plan
  exhaustion, not code. Account upgraded to Pro, key rotated, and the
  preview gate scan of Oct 27 20:59 CDT (scanId
  `8d85ebea-9c97-4100-aa26-a98f026c611b`) mentioned 12/12 platforms with
  Mistral AND Kimi both succeeding. No code fix is claimed for an
  account limit; the account fix is what closed the gate.
  Staging re-scan Oct 30 (scanId `5a014aea-5f46-4685-87f7-1154eee6bc1f`) also mentioned Mistral, closing RT-32.
- Kimi: fixed in-window — empty-content retries escalate the token
  budget 300 → 1000 (reasoning is ~1,500 characters); verified live.
- Demo video: screen walkthrough v3, 2:17, founder-approved Oct 27,
  https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4

### Attribution

Built with Meta's Model API (Muse Spark), HeyGen, and ElevenLabs
(licensed account). Open-source licenses are noted in the public repo.
AI-assisted build is disclosed; every demo number comes from a real
scan. No live consumer Muse scanning or live cross-platform tracking is
claimed; surfaces with no permitted method are labeled "pending", never
scored.

## Submit-day checklist (Nov 4, internal target 4pm CST, hard 8pm CST)

- [x] Repo public — confirmed (1092 blobs, main 30990782, Oct 30).
- [x] Demo link plays inline, no login — confirmed via preview host
      (RT-110).
- [x] Video ≤ 3:00 — walkthrough v3 is 2:17.
- [x] Contributors listed — Nandish Patel + Paras Pipalia only.
- [x] Mistral + Kimi verified — preview leg passes; Kimi verified live; staging leg passed Oct 30 (RT-32 closed).
- [x] Writeup sign-off — DONE Oct 31 (all three resolutions applied, frozen).
- [x] Staging Mistral re-test (RT-32 gate) — DONE Oct 30 (staging re-scan 5a014aea mentioned Mistral; RT-32 closed, gate lifted).

## Signed off Oct 31, 2026 — all open items resolved

1. Wall-time line: RESOLVED at sign-off — replaced with anchored numbers (483s first complete run; 401s script-fix re-test). Note the public README now carries the corrected figures — resolved and live (RT-129, verified on public main).
2. "60-second" wording family: RESOLVED at sign-off — reworded to "personalized video report" (founder-approved Oct 31); the packet above reflects the signed-off text.
3. Staging re-test (RT-32): RESOLVED — staging re-scan Oct 30 mentioned Mistral; RT-32 closed and the gate lifted. The Mistral paragraph above now cites both legs.

## Refined form texts — Nov 2, 2026 (founder review)

Final field texts for the Cerebral Valley form, refined Nov 2 from the signed-off packet. These supersede the earlier field-list drafts for the form fill; the signed-off body above is unchanged except for the Nov 2 amendments noted in the header.

- Team Name: Rankall
- Team Members: Nandish Patel + Paras Pipalia
- Track: Startups
- Problem statement: Build for Your World
- Public GitHub Repository: https://github.com/rankallstartup-cell/rankall-video-report
- 3-Minute Demo Video: https://www.youtube.com/watch?v=pmWXaDmhGKA
- Describe your use of Meta products: "Rankall uses Meta's Model API (Muse Spark 1.3) in two core places. Meta AI is the 12th platform Rankall scans, live by default, so new scans run 12 platforms. Muse Spark also writes each personalized video script, while an agentic director verifies every numerical claim against the real scan JSON, rejects overclaims, and repairs them before rendering."
- Why are Meta's models important: "Meta's models are both part of what Rankall measures and part of how Rankall turns that intelligence into something useful. Meta AI expands Rankall's visibility measurement as the 12th scanned platform, while Muse Spark turns real scan data into a personalized report that is verified by our director before publication. Meta is therefore embedded in both the measurement layer and the reporting workflow, rather than being an add-on."
- Partner feedback: leave blank (optional)
- Permission checkbox: accept
- Likelihood to build with Meta Model API again: 5/5
- Overall opinion of Meta Model API: Very positive
- Recommend Meta Model API: 5/5
- Recommend Muse Code: N/A if available; if forced to give 0–5, 3/5
- Biggest obstacle: reliability of model output / empty-content responses requiring retry logic and larger token budgets
- Meta models vs other models: competitive, particularly valuable here because Meta is both a measured platform and part of the generation workflow
- Most important when choosing a model: reliability/quality first, then latency, cost, API stability, and production support
- Hardest thing to switch: production integration and validation logic once model-specific behavior is embedded in the pipeline
- Production blocker: do NOT choose "We don't plan to take this project to production." Choose the closest production-path option; if an Other field is offered, use: "Production hardening, scaling the async video pipeline, and reducing per-report render cost while maintaining reliability."
