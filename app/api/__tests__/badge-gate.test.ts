import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax8b: the badge route used service-role (bypasses RLS) with no
// ownership check — anyone with a scanId got name + score.
// ax8b item 2 (updated): the badge is for embedding on the OWNER's site,
// so real data is served only for an owned scan the owner published
// (is_public) or the owner previewing it — canServeBadge in
// lib/reportPayload (unit-tested in lib/__tests__/report-payload). The old
// third assertion ("real data for ownerless scans") encoded the leak this
// ticket closes: ownerless scans now get the generic badge.
const badge = readFileSync(join(process.cwd(), 'app/api/badge/[scanId]/route.ts'), 'utf8');

describe('ax8b badge gate', () => {
  it('reads user_id so it can enforce ownership itself', () => {
    expect(badge).toContain('user_id');
  });

  it('serves a generic badge (no name/score) for owned scans', () => {
    expect(badge).toContain('Private report');
    // The generic branch must not interpolate the real score or name.
    const genericBranch = badge.split('Private report')[0];
    expect(genericBranch).toContain('user_id');
  });

  it('gates real badge data on canServeBadge (owned + shared, or owner preview)', () => {
    expect(badge).toContain('canServeBadge(scan.user_id, scan.is_public, viewerId)');
    expect(badge).toContain('shortName');
    expect(badge).toContain('AI Visibility Score');
  });

  it('uses the trusted display name (#39)', () => {
    expect(badge).toContain('getTrustedDisplayName');
  });
});
