import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Item 15: user-controlled names interpolated into email HTML are escaped.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('email templates escape user-controlled names', () => {
  it('pause confirmation', () => {
    expect(read('app/api/user/pause-subscription/route.ts')).toContain('Hi ${escapeHtml(name)},');
  });
  it('score-decay / personal-monitor / agency score alert', () => {
    expect(read('app/api/cron/score-decay-warning/route.ts')).toContain('Hi ${escapeHtml(firstName)},');
    expect(read('app/api/cron/personal-monitor/route.ts')).toContain('Hi ${escapeHtml(firstName)} —');
    const a = read('app/api/cron/agency-rescan/route.ts');
    expect(a).toContain('Score Alert: ${escapeHtml(client.business_name)} dropped');
    expect(a).toContain('${escapeHtml(cause)}');
  });
  it('outreach send-email HTML body uses escaped copies only', () => {
    const s = read('app/api/outreach/send-email/route.ts');
    const html = s.slice(s.indexOf('const html = `<!DOCTYPE html>'), s.indexOf('// Every outreach email must carry the unsubscribe footer.'));
    for (const raw of ['${businessName}', '${competitorName}', '${city}', '${industry}', '${firstName}', '${f.title}']) {
      expect(html).not.toContain(raw);
    }
    expect(html).toContain('${hBiz}');
  });
});
