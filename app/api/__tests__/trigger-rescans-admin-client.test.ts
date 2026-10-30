import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax72 residual: trigger-rescans runs with NO user session but read
// fix_predictions / rankall_scans with the anon client — under RLS
// those selects return nothing, so the cron reported "No rescans
// due" and verification never fired. It must use the service-role
// client (getSupabaseAdmin), like rescan-weekly does.
describe('ax72 trigger-rescans uses the service-role client', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/api/trigger-rescans/route.ts'), 'utf-8');

  it('reads through getSupabaseAdmin, never the anon client', () => {
    expect(src).toContain('getSupabaseAdmin');
    expect(src).not.toContain("import { supabase } from '@/lib/supabase'");
    expect(src).not.toContain('createClient(');
    expect(src).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});

describe('trigger-rescans fallback bound — b877', () => {
  it('records a completed row after a no-row fallback rescan', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/trigger-rescans/route.ts'), 'utf8');
    expect(src).toContain('recordFallbackRescans(scan.id, scan.user_id ?? null');
    expect(src).toContain('unscheduledFixTypes');
  });
});
