# Auto Fix Loop Architecture

## Current State (Phase 1–2)
Scan → Generate → Review → Approve

- **Scan** (`/api/scan`): after the response, `after()` runs `generateFixForScan()`
  in-process (no self-fetch) for the top 3 fix types.
- **Generate** (`lib/generateFix.ts`): builds evidence, generates content via
  Anthropic, inserts into `generated_fixes` (status `pending_review`). All failures
  are logged (`[generateFix] …`, `[autoFix] …`) — never silent.
- **Review** (`/dashboard/fix`): "Ready for Review" section shows pending fixes with
  their evidence + a Predicted/Verified badge.
- **Approve** (`/api/fixes/review`): sets `status='approved'` and personalises the
  content (replaces `YOUR_BUSINESS_NAME`).

## Phase 3 (Next)
Scan → Generate → Review → Approve → **Guided Application**
(approved fixes flow into `/api/fixes/apply` → `fix_predictions` → rescan/verify)

## Phase 4 (Future)
… → Approve → **Script-Tag Auto-Apply** → Verify

## Phase 5 (Future)
… → Auto-Apply → Verify → **Intelligence Graph learns** → future recommendations improve

## Fix Lifecycle States
`pending_review` → `approved` / `rejected` → `applied` → `verified`

## Evidence Requirements
Every generated fix must carry:
- `why_recommended`
- `triggered_by_signal`
- `triggered_by_finding`
- `platform_evidence`
- `verification_status` (`predicted` | `verified`)

Evidence is generic-but-true (see `buildFixEvidence` in `lib/fixIntelligence.ts`) —
**never fabricate specifics** (no invented phone/address/credentials).

## Traceability Requirements
Every fix references:
- `scan_id` — which scan created it
- `evidence_source` — how it was generated (`auto_after_scan` | `manual` | `scheduled` | `admin`)
- `user_id` — who it belongs to
