import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35v: Agency Settings redesign — b35q design system on staging logic;
// v2's page bypassed the trial-cap via direct client-side upsert.
describe('b35v agency settings redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/agency/settings/page.tsx'), 'utf-8');
  it('new design system present: pagehead, dash-card, Geist, tokens', () => {
    for (const s of ['pagehead', 'dash-card', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('trial-cap enforcement intact (b28g paid-tier boundary)', () => {
    expect(src).toContain('isTrialing');
    expect(src).toContain('TRIAL_WHITELABEL_BLOCKED_MESSAGE');
    expect(src).toContain('/api/agency/settings');
    expect(src).toContain('white_label_enabled');
    expect(src).not.toContain(".from('agency_settings').upsert");
    expect(src).not.toContain('.from("agency_settings").upsert');
  });
  it('no v2 regressions or invented copy', () => {
    for (const s of ['No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('staging logic preserved: save/upload/toast handlers', () => {
    for (const s of ['handleSave', 'handleLogoUpload', 'showToast', 'agency-assets', 'White Label Settings']) {
      expect(src).toContain(s);
    }
  });
});
