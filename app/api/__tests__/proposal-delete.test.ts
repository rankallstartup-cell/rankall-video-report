import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b01w: deleteProposal() deleted by id only — no agency_user_id filter,
// unlike the select/insert on the same page. It relied on RLS alone.
// Source-level check: the page is a client component; the test reads it.
const src = readFileSync(
  join(process.cwd(), 'app/dashboard/agency/proposals/page.tsx'),
  'utf8',
);

function fnBody(name: string): string {
  const start = src.indexOf(`async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  // The next top-level function starts the next block; the delete fn is
  // short, so slice to the next `function ` at column 2.
  const end = src.indexOf('\n  function ', start + 1);
  return src.slice(start, end === -1 ? undefined : end);
}

describe('proposals delete — b01w ownership filter', () => {
  it('deleteProposal scopes the delete to the agency user', () => {
    const body = fnBody('deleteProposal');
    expect(body).toContain(".from('agency_proposals')");
    expect(body).toContain('.delete()');
    expect(body).toContain(".eq('id', id)");
    expect(body).toContain(".eq('agency_user_id', data.user.id)");
    expect(body).toContain('supabase.auth.getUser()');
  });

  it('no bare id-only delete remains on the page', () => {
    expect(src).not.toContain(".delete().eq('id', id)");
  });
});
