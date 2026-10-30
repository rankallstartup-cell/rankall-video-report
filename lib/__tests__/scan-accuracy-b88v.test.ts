import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88v — /admin/scan-accuracy: (1) every row linked to /report/[id],
// but that route only serves public/ownerless scans
// (canServePublicShare) — owned scans were dead "Report not
// found" links; (2) no per-row date or ID, so duplicate-looking
// rows were indistinguishable and no score traced to a date;
// (3) the /11 denominator was unexplained on the page.

const page = readFileSync(join(process.cwd(), 'app/admin/scan-accuracy/page.tsx'), 'utf8');

describe('b88v — scan accuracy provenance', () => {
  it('owned scans get an honest label, not a dead link', () => {
    expect(page).toContain('Private scan — no public report');
    expect(page).toContain('r.user_id');
  });

  it('rows carry the scan date and a short ID', () => {
    expect(page).toContain("'Business', 'Date', 'Query'");
    expect(page).toContain('r.id.slice(0, 8)');
  });

  it('the denominator is explained on the page', () => {
    expect(page).toContain('out of all {TOTAL_PLATFORMS} platforms scanned');
    expect(page).toContain('coverage assumed full');
  });

  it('the denial names the restriction', () => {
    expect(page).toContain('Access denied — admin only.');
  });
});
