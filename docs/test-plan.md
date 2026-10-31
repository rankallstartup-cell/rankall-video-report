# Test plan — Rankall video reports

**Summary:** How the entry was tested, layer by layer in order, what each layer covered, and what was honestly left parked — no parked item is claimed as passed.

## Layers in order

Testing runs in this order. Each layer covers a different kind of risk, and a later layer never excuses an earlier layer's gap.

| Layer | What it covers |
|---|---|
| Unit | Type check and automated test suites for the changed code, run against both the changed code and a true base (changed files reverted, hashes verified, then restored). A slice passes this layer only when its new tests pass and the full-suite failure set is unchanged. |
| Manual | Signed-out live checks by a human: judge cards, front door, jobs page, videos playing, and founder listens for presenter voices. No sign-in, no credentials in the test rig. |
| Integration | The seams between pieces: presenter allowlist probes, jobs API responses, and verification scans against real platform responses. |
| Automation | The code-layer test runs: targeted suites for the changed files plus the full suite, with failure-set comparison against the base. |
| Regression | The end-of-channel re-check: the same targeted and full suites on a true base, confirming the change adds no new failure anywhere. |

## The full run on October 29

One full run covered the whole entry before the late-October slices landed:

- Type check: clean, zero errors.
- Full test suite: 2,399 passed, 59 failed, 2,458 total. Every one of the 59 failures sat in unrelated product areas; every hackathon slice passed. The failures were recorded as referrals for their owning areas, not hidden and not fixed by touching unrelated code.
- Live sweep: the judge page, front door, jobs page, and health endpoint all returned 200, and the judge videos were verified at their committed sizes.
- Integration probes: unlisted presenter ids were rejected; listed presenters passed the allowlist check.
- Signed-out manual checks: judge cards correct, front door stating 12 platforms, jobs page loading, videos valid.
- Cost of the whole run: $0. No renders, no scans started for testing, no sends, no sign-ins. The wallet balance was unchanged from open to close.

A later fix run for the test failures themselves took the suite from 59 failures to 21, all still in unrelated product areas, with zero new failures introduced. The remaining 21 are not hackathon-slice failures and are not claimed as fixed here.

## Slice verifications

Each late change was verified the same way: targeted tests for its files, a full-suite comparison against a true base, and live checks where the change has a visible surface.

| Change | Targeted tests | Full-suite comparison | Live checks |
|---|---|---|---|
| Judge Mode tier expansion (7 cards added) | 12/12, base 11/11 | Failure set unchanged | Judge page 200, all 7 new videos at exact bytes |
| Low-scorer card added (score-2 generic scan) | 13/13, base 12/12 | Failure set unchanged | Judge page 200, all 11 videos at exact bytes |
| Judge-card swap (Personal card out, Gantos card in) | 14/14, base 13/13 | 2,440 passed / 21 failed / 2,461 vs base 2,439 / 21 / 2,460; failure set empty-diff | Judge page 200, Gantos card facts present, removed card zero hits, all other videos at exact bytes |
| Script pacing target (about 840 characters) | 10/10, base 6/6 | 2,444 passed / 21 failed / 2,465 vs base 2,440 / 21 / 2,461; failure set empty-diff | Pages 200 (deploy check only — the change has no visible surface) |
| Public README wall-time fix | Text change, no code tests | Not applicable | Live README lines 117–118 read 483 s / 401 s; old figures zero hits |

A "failure set empty-diff" means the changed-code run and the base run failed exactly the same tests — the change added no new failure. Every full-suite comparison above was a true base run, not a comparison against a stale baseline.

## Live checks

These checks ran signed-out (no login, no credentials) against the public preview:

- Judge page, front door, jobs page: 200.
- Health endpoint: 200, reporting the pipeline enabled.
- All 11 judge videos: served as video/mp4 at their exact committed bytes, including the Gantos video at 16,185,623 bytes and the low-scorer video at 15,484,181 bytes.
- Screen walkthrough demo video: served as video/mp4 at 8,675,519 bytes, 2 minutes 17 seconds, playing inline.
- Anonymous share page for a real scan: 200 (the share loader fix that lets prospects view a scan without signing in).
- Judge page works with no login: every check above ran without cookies or credentials.

## Honestly parked

These items were not verified and are not claimed as passed. Each states what would unblock it.

1. **Signed-in live testing.** Never run: the test rig holds no credentials and never signs in. What would unblock it: a signed-in check by the product owner on their own account. Until then, signed-in surfaces are covered by code reads only, never claimed as live-verified.
2. **Live-browser click-through.** Parked: the delivery-view click path for the newest judge card (confirming the fallback flag shows on the delivery view reached from the card) was verified by code read only — the mechanism is proven in code, the click itself was not run. What would unblock it: a live-browser pass over the judge-card path.
3. **Pacing proof render.** No render was run for the 840-character target, and none is claimed. The target is verified as a code value and by arithmetic (50.44 s from 700 characters → about 840 characters for about 60 seconds). What would unblock a rendered-length claim: a separately approved render.
4. **Bob's Red Mill render.** Approved to run last, after the final submission tasks. Not yet run, not claimed. What would unblock it: its turn in the order, with its presenter picked at render time.
5. **Judge-page hero line.** Decided (a line about the low scorers) but not yet on the page. Not claimed as present. What would unblock it: the line being built onto the page.

## Coverage note

The 11 judge cards span 7 segments in substance: Local (5 dental cards), Product, Agency, Enterprise, Government, SEO, and Global Brand Intelligence. There is no Personal demo card today — the Personal card was replaced by a company card by founder choice (see the development plan). Any material that describes the judge demos as covering every segment is stale and should be corrected, not repeated.

## What "pass" means here

A slice is described as passing only for the layers and checks actually run on it, with the evidence listed. Parked items are never folded into a pass. A code change with no visible surface (like the pacing target) is verified by its tests and by deploy checks, and the limit of those checks is stated, not hidden.
