import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trialCapsSummary, TRIAL_LIMITS, TRIAL_MAX_LOCATIONS } from '../trialCaps';

// Fix round 2: signup trial copy never mentioned the caps.
describe('trialCapsSummary', () => {
  it('local business', () => {
    const s = trialCapsSummary('local_pro');
    expect(s).toContain(`${TRIAL_MAX_LOCATIONS} location`);
    expect(s).toContain(`up to ${TRIAL_LIMITS.local_scan} scans`);
    expect(s).toContain('Report exports unlock');
  });
  it('personal', () => {
    expect(trialCapsSummary('personal_pro')).toContain(`up to ${TRIAL_LIMITS.personal_scan} scans`);
  });
  it('agency mentions white-label', () => {
    const s = trialCapsSummary('agency');
    expect(s).toContain(`up to ${TRIAL_LIMITS.agency_client_scan} client scans`);
    expect(s).toContain('white-label');
  });
  it('signup renders it', () => {
    expect(readFileSync(join(process.cwd(), 'app/signup/page.tsx'), 'utf-8')).toContain('trialCapsSummary(planKeyFor(plan))');
  });
});
