import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89h — /dashboard/client/contact: bare red lines for every state,
// the short no-client wording (siblings use the full sentence), and
// query errors ignored — a failed agency_clients lookup was
// misreported as "No client account found."

const page = readFileSync(join(process.cwd(), 'app/dashboard/client/contact/page.tsx'), 'utf8');

describe('b89h — client contact states', () => {
  it('signed-out is a gate, not an error line', () => {
    expect(page).toContain("setErrKind('unauth')");
    expect(page).toContain('Sign in to contact your agency.');
    expect(page).toContain('/login?next=/dashboard/client/contact');
  });

  it('no-client wording matches the sibling pages', () => {
    expect(page).toContain('No client account found. Please contact your agency.');
    expect(page).not.toContain("setError('No client account found.')");
  });

  it('a failed lookup is a failure with Retry, not a no-client claim', () => {
    expect(page).toContain('clientErr');
    expect(page).toContain("setErrKind('failed')");
    expect(page).toContain('Retry');
  });
});
