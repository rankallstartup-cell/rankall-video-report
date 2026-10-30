import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8a1 — /dashboard/personal-brand + the dashboard layout score pill.

const page = readFileSync(join(process.cwd(), 'app/dashboard/personal-brand/page.tsx'), 'utf8');
const layout = readFileSync(join(process.cwd(), 'app/dashboard/layout.tsx'), 'utf8');

describe('b8a1 — the sidebar pill number matches its label', () => {
  it('layout loads the personal score separately (intent_type = personal_pro)', () => {
    expect(layout).toContain('personalScore');
    expect(layout).toContain(".eq('intent_type', 'personal_pro')");
  });

  it('the pill renders the context-appropriate score', () => {
    expect(layout).toContain("effectiveNavKey === 'personal_pro' ? personalScore : score");
  });
});

describe('b8a1 — page states', () => {
  it('signed-out visitors get a sign-in gate before any plan gate', () => {
    expect(page).toContain('Sign in to scan your personal brand');
    expect(page).toContain('/login?next=/dashboard/personal-brand');
    expect(page).toContain('!planLoading && !userId');
  });

  it('explicit empty state when no personal scans exist', () => {
    expect(page).toContain('No personal-brand scans yet.');
    expect(page).toContain('snapshotsLoaded');
  });

  it('admin view is labelled when the upgraded plan differs', () => {
    expect(page).toContain('Admin view:');
    expect(page).toContain('rawPlan');
  });

  it('the form name is a placeholder, not a prefilled person', () => {
    // Code-checked per the ticket: per-country example names are input
    // placeholders; the name field's value starts empty.
    expect(page).toContain("const [name, setName]             = useState('');");
    expect(page).toContain('placeholder={ph.name}');
  });
});
