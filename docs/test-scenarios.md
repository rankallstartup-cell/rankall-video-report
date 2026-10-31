# Test scenarios — Rankall video reports

**Summary:** A curated set of 22 real cases, each with what was expected, what actually happened, the result, and the evidence. Nothing here is invented: every case traces to a test run, a live check, a scan record, or a job record.

## How to read this

- **Expected** is what the case required before it ran.
- **Actual** is what was observed.
- **Result** is Pass only when the actual matched the expected. Parked items are not in this table — they are listed in the test plan, not claimed here.
- **Evidence** names the artifact that proves it: a public commit, a scan record, a job record, or a measured size. Short commit hashes refer to the public repo.

## Scenarios

| ID | Case | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|
| S01 | Judge page loads without login, 11 cards | Page 200, 11 video references, no login | Page 200, 11 video references, signed-out | Pass | Live preview judge page |
| S02 | Gantos card facts | Score 2, 0 of 11 platforms, Aug 25 2026, Naperville dentist | Card shows exactly those facts | Pass | Scan `41fc6cf3-1e08-4667-b427-74d47d59869a`; video 16,185,623 bytes |
| S03 | Removed Personal card fully absent | Removed card's name, scan reference, and video file return zero hits on the served page | Zero hits on all three | Pass | Live preview judge page |
| S04 | Other cards untouched by the swap | The other 10 videos serve at their exact bytes | All 10 at exact bytes | Pass | Live preview video checks |
| S05 | Tier-expansion cards | 7 new cards with correct scores, mentions, and dates | All 7 correct at build time (Topo 41, SV & Co 0, Acumatica 30, Marfa 8, Victorious 2, Stumptown 42, Personal 17); the Personal card was later replaced (see S02–S03) | Pass | Public `dc79d78b`; targeted 12/12 |
| S06 | Low-scorer card | Generic scan resolves to a real dental business, score 2, 2 of 11 platforms, Oct 8 2026 | Card shows exactly that; video 46.92 s | Pass | Scan `2f5d9bbe-126d-41ca-81db-5568453fb610`; video 15,484,181 bytes; public `30990782`; targeted 13/13 |
| S07 | Pacing prompt target | Prompt target reads about 840 characters (about 167 words) | Target reads exactly "Target about 840 characters (about 167 words) of total narration." | Pass | Public `34e26e11`; targeted 10/10; no render run |
| S08 | Spark retry proof | Empty content retries, max 3 attempts, then a Spark script | Two empties, Spark script on attempt 3; job completed in 401 s for $2.17 | Pass | Job `job_1793126697397_88e08dc1` |
| S09 | Kimi empty-content fix | Empty content retries with a larger token budget | Token budget escalates 300 → 1,000; verified live | Pass | Live verification run |
| S10 | Mistral verification, first scan | Mistral succeeds on a 12-platform scan | 12 of 12 platforms mentioned, Mistral succeeding | Pass | Scan `8d85ebea-9c97-4100-aa26-a98f026c611b` |
| S11 | Mistral verification, second scan | A second scan also mentions Mistral after the account action | Second scan mentions Mistral; account action closed it, no code fix claimed | Pass | Scan `5a014aea-5f46-4685-87f7-1154eee6bc1f` |
| S12 | Presenter allowlist | Listed presenters pass; unlisted ids are rejected before any job or spend | Listed pass, unlisted rejected with an allowlist error | Pass | Integration probes |
| S13 | Voice pairing | Each presenter maps to one voice; unknown pairings are rejected | Dante/Julian → Eric; Abigail/Saoirse → Bella; unknown rejected | Pass | Integration probes |
| S14 | Job store honest failure | Store unavailable answers service-unavailable, never silent in-memory fallback on the preview | Code path returns service-unavailable when the store is unavailable; no in-memory fallback path exists on the preview | Pass | Code + route behavior |
| S15 | Checkpoint and resume | Job resumes from the last checkpoint; a started render is re-polled, never re-started; a 10-minute stall fails naming its stage | Resume, re-poll, and stall-failure behavior all as designed | Pass | Job store design + live runs |
| S16 | Fallback flagging | Fallback scripts are flagged on the delivery view from the stored job record | Delivery view adds the fallback step when the job record is not a Spark script; judge cards show run labels only, no per-card badge claimed | Pass | Job records; delivery-view behavior |
| S17 | Pre-existing scans keep original counts | Older demos keep 11 or fewer platforms, no Meta line added | Folsom shows 7 of 11 with no Meta line; nothing backfilled | Pass | Scan `cd149a50-d824-46ee-aab3-27fd465a225c`; live judge page |
| S18 | Walkthrough plays inline | Demo video serves as video/mp4 and plays without login | Served as video/mp4, 8,675,519 bytes, 2 min 17 s, inline playback | Pass | Public `d7557469`; live preview video check |
| S19 | Anonymous share page | A prospect views a real scan without signing in | Share page returns 200 for a real scan, signed-out | Pass | Live preview share-page check |
| S20 | Full run, October 29 | Type check clean; full suite runs; live sweep passes; $0 spent | Type check clean; suite 2,399 passed / 59 failed / 2,458 (all 59 outside hackathon slices); sweep pages 200; wallet unchanged | Pass | October 29 run logs |
| S21 | Public README wall-time fix live | Live README reads 483 s / 401 s; old figures zero hits | Lines 117–118 read 483 s (first complete run) and 401 s (script-fix re-test); old figures zero hits | Pass | Public `93fe0b49`; live README check |
| S22 | Cost honesty | Per-video cost quoted only from clean sequential runs; batch average never quoted as a unit cost | Quoted range $1.70–$2.17 per 45–60 s video; batch $10.40 total never divided into a unit cost | Pass | Wallet-delta records; cost analysis |

## Coverage note

This set is curated, not exhaustive. It covers the demo surface (judge cards, videos, share page), the pipeline's reliability mechanisms (retry, resume, fallback, honest failure), the honesty rules (original counts, flagged fallbacks, cost honesty), and the late changes (tier expansion, low-scorer card, card swap, pacing target, README fix). The full working set of checks is larger; parked items (signed-in live testing, live-browser click-through, the pacing proof render, the queued-last render, and the pending hero line) are listed in the test plan and are not in this table.

## Links

- Public repo: https://github.com/rankallstartup-cell/rankall-video-report
- Judge demos (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report/judge
- Live front door (no login): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/hackathon/video-report
- Demo video (plays inline): https://rankall-git-hackathon-video-report-nandish-patel-s-projects.vercel.app/demo-walkthrough-v3.mp4
