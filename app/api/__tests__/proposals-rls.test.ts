import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b01w: proposal deletion is a real DB delete, but agency_proposals
// had NO RLS / policies — the client-side agency_user_id filter was
// the only barrier, and it is bypassable via direct PostgREST calls.
// The fix is the RLS migration (applied by Nandish) + the ownership
// scoping that already exists on every access path. This test pins
// both halves: the migration, and every read/write path scoping by
// agency_user_id.
describe('b01w agency_proposals RLS + ownership', () => {
  it('migration enables RLS with owner-only policies for all 4 operations', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261015000100_b01w_agency_proposals_rls.sql'),
      'utf8',
    );
    expect(sql).toContain('ALTER TABLE agency_proposals ENABLE ROW LEVEL SECURITY');
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toContain(`FOR ${op}`);
    }
    expect(sql).toContain('agency_user_id = auth.uid()');
    expect(sql).toContain('DROP POLICY IF EXISTS b01w_proposals_delete');
  });

  it('every app access path scopes by agency_user_id', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/dashboard/agency/proposals/page.tsx'), 'utf8');
    const update = readFileSync(
      join(process.cwd(), 'app/api/agency/update-proposal-status/route.ts'), 'utf8');
    const generate = readFileSync(
      join(process.cwd(), 'app/api/agency/generate-proposal/route.ts'), 'utf8');
    for (const [name, src] of [['page', page], ['update', update], ['generate', generate]] as const) {
      expect(src, name).toContain('agency_user_id');
    }
    expect(page).toContain(".eq('agency_user_id', data.user.id)");
    expect(update).toContain(".eq('agency_user_id', user.id)");
    expect(generate).toContain('agency_user_id:');
  });
});

describe('b01w migration is self-contained', () => {
  it('self-checks RLS + all four policies and reloads the PostgREST schema', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261015000100_b01w_agency_proposals_rls.sql'), 'utf8');
    expect(sql).toMatch(/RAISE EXCEPTION 'b01w: agency_proposals RLS check failed/);
    expect(sql).toMatch(/relrowsecurity/);
    expect(sql).toMatch(/n_policies <> 4/);
    expect(sql.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});
