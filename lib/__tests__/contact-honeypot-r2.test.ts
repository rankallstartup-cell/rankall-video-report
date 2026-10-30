import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HONEYPOT_FIELD } from '../publicFormGuardShared';
import { isHoneypotTripped } from '../publicFormGuard';

// Fix round 2: /api/contact checks a honeypot the /contact form never sent.
describe('/contact honeypot', () => {
  const src = readFileSync(join(process.cwd(), 'app/contact/page.tsx'), 'utf-8');
  it('form renders the hidden honeypot input and posts it', () => {
    expect(src).toContain('name={HONEYPOT_FIELD}');
    expect(src).toContain('[HONEYPOT_FIELD]: trap');
  });
  it('route semantics: empty passes, filled trips', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '' })).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 'http://spam' })).toBe(true);
  });
});
