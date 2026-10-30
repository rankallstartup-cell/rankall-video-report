import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax84 follow-up: backslash open redirect + reset-link spinner.
const callback = readFileSync(join(process.cwd(), 'app/auth/callback/route.ts'), 'utf8');
const reset = readFileSync(join(process.cwd(), 'app/reset-password/page.tsx'), 'utf8');

describe('ax84 follow-up', () => {
  // The string check was replaced by safeNextPath (resolve + same-origin +
  // control-char/backslash rejection) — it also missed /%09/evil.com.
  // Vector-level coverage lives in lib/__tests__/safe-redirect.test.ts.
  it('callback validates next via safeNextPath (open redirect)', () => {
    expect(callback).toContain('safeNextPath(requestUrl.searchParams.get(\'next\')');
  });

  it('reset page surfaces failed/expired link errors instead of spinning', () => {
    expect(reset).toContain('error_description');
    expect(reset).toContain('linkError');
    expect(reset).toContain('invalid or expired');
  });

  it('reset page times out the spinner when no auth event arrives', () => {
    expect(reset).toContain('setTimeout');
    expect(reset).toContain('clearTimeout');
  });

  it('reset page offers a new reset link on failure', () => {
    expect(reset).toContain('/forgot-password');
  });
});
