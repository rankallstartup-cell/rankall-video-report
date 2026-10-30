import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35x: Badge redesign — b35q design system on staging logic;
// v2's page linked embeds to the private /report/<id> page and skipped
// the publish-on-copy POST, so embedded badges would not work for visitors.
describe('b35x badge redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/badge/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('public-share logic intact: /r/ link + publish-on-copy POST', () => {
    expect(src).toContain('/r/${scan.id}');
    expect(src).toContain("action: 'share'");
    expect(src).not.toContain('${BASE}/report/');
  });
  it('no v2 regressions or invented copy', () => {
    for (const s of ['No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('staging logic preserved: copy/embed/score handlers', () => {
    for (const s of ['copyEmbed', 'scoreColor', 'PlatformTabBtn', 'embedCodes']) {
      expect(src).toContain(s);
    }
  });
});
