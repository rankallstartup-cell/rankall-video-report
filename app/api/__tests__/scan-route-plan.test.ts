import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b062 follow-up: the scan route was the last plan resolver still
// reading user_metadata FIRST (self-grant hole). It must use the
// shared cascade (subscriptions -> app_metadata -> free).
const route = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');

describe('scan route plan resolution — b062 follow-up', () => {
  it('uses the shared cascade, never user_metadata, for the plan', () => {
    expect(route).toContain('resolvePlanFromSources');
    expect(route).not.toContain('um?.account_type');
    expect(route).not.toContain('user_metadata?.account_type');
  });

  it('does not fall back to profiles for the plan', () => {
    // The old code read profiles.account_type when the plan was 'free'.
    expect(route).not.toContain("from('profiles')");
    expect(route).not.toContain('profile as any)?.account_type');
  });

  it('reads subscriptions with status + trial_end for the cascade', () => {
    expect(route).toContain("select('plan, status, trial_end')");
  });
});
