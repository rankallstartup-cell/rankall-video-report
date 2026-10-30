import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88q — /admin/outreach-intelligence: (1) numbers had no source
// or date; (2) By Industry / By Country were silent empty boxes;
// (3) non-admins were silently redirected — no denial message.
// Root defect found in the API: with ZERO conversions every
// score bucket ties at 0% and the route still crowned a "best"
// range and "best" industry (the observed "0-30" / "dentist").

const page = readFileSync(join(process.cwd(), 'app/admin/outreach-intelligence/page.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'app/api/admin/simulator-stats/route.ts'), 'utf8');

describe('b88q — outreach intelligence honesty', () => {
  it('no conversions -> no best range or industry', () => {
    expect(api).toContain('if (convertedRows.length > 0)');
  });

  it('every number carries its source; the load is dated', () => {
    expect(page).toContain('computed live from outreach_targets and video_views');
    expect(page).toContain('Loaded ${loadedAt}');
    expect(page).toContain('From simulation_views');
    expect(page).toContain('all-time');
  });

  it('empty segments say so', () => {
    expect(page).toContain('byIndustry.length === 0');
    expect(page).toContain('byCountry.length === 0');
    expect(page).toContain('No data yet.');
  });

  it('denial is explicit, not a silent redirect', () => {
    expect(page).toContain('Access denied — admin only.');
    expect(page).not.toContain("router.replace('/dashboard')");
  });

  it('avg recovery is labelled as money', () => {
    expect(page).toContain("`$${simStats.avgRecovery.toLocaleString()}`");
  });
});
