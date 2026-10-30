import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax6u residual: the same NULL -> fabricated-score pattern as the
// weekly email lived in two more surfaces. The SMS route turned
// null into 0 ("ChatGPT score: 0/100. Competitor: 0/100" for numbers
// never computed). The demo-video route invented 31 / 78 / $4,200
// when no real scan existed and spoke them as measured results.
describe('ax6u SMS/video never render unmeasured scores', () => {
  const sms = readFileSync(join(process.cwd(), 'app/api/outreach/send-sms/route.ts'), 'utf-8');
  const video = readFileSync(join(process.cwd(), 'app/api/demo/generate-video/route.ts'), 'utf-8');

  it('SMS omits missing scores instead of turning null into 0', () => {
    expect(sms).not.toContain('score ?? 0');
    expect(sms).not.toContain('competitor_score ?? 0');
    expect(sms).toContain("score != null ? `ChatGPT score: ${score}/100. ` : ''");
    expect(sms).toContain("competitor_score != null ? `Competitor: ${competitor_score}/100. ` : ''");
  });

  it('video fails loudly without a real measured scan, never invents 31/78/4200', () => {
    expect(video).not.toContain('score: 31');
    expect(video).not.toContain('competitor_score: 78');
    expect(video).not.toContain('revenue_leak: 4200');
    expect(video).not.toContain('?? 31');
    expect(video).not.toContain('?? 78');
    expect(video).not.toContain('?? 4200');
    expect(video).toContain('No demo scan with measured scores available');
    expect(video).toContain('status: 503');
  });
});
