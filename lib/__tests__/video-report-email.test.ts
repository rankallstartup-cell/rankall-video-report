// "Video ready" email builder (lib/video/videoReportEmail.ts): honest
// content only — escaped values, score only when real, no competitor,
// no revenue, URLs validated.
import { describe, it, expect } from 'vitest';
import { buildVideoReadyEmail } from '@/lib/video/videoReportEmail';

const base = {
  businessName: 'Tech Ridge Dental',
  city: 'North Austin',
  industry: 'Dentist',
  score: 72,
  deliveryUrl: 'https://preview.example/hackathon/video-report/scan-1?videoUrl=https%3A%2F%2Fcdn.example%2Fv.mp4',
  videoUrl: 'https://cdn.example/v.mp4',
};

describe('buildVideoReadyEmail', () => {
  it('builds a subject + html with the delivery link and the score', () => {
    const { subject, html } = buildVideoReadyEmail(base);
    expect(subject).toContain('Tech Ridge Dental');
    expect(html).toContain('Watch your video');
    expect(html).toContain('https://preview.example/hackathon/video-report/scan-1');
    expect(html).toContain('72 out of 100');
  });

  it('omits the score line when no real score is supplied', () => {
    const { html } = buildVideoReadyEmail({ ...base, score: null });
    expect(html).not.toContain('out of 100');
  });

  it('escapes business names so no HTML can be injected', () => {
    const { html, subject } = buildVideoReadyEmail({
      ...base,
      businessName: '<script>alert(1)</script> Dental',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(subject).toContain('<script>alert(1)</script> Dental');
  });

  it('throws on non-http(s) URLs instead of mailing them', () => {
    expect(() => buildVideoReadyEmail({ ...base, deliveryUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => buildVideoReadyEmail({ ...base, videoUrl: 'ftp://example.com/v.mp4' })).toThrow();
  });

  it('invents nothing: no revenue, no competitor', () => {
    const { html } = buildVideoReadyEmail(base);
    expect(html).not.toMatch(/revenue/i);
    expect(html).not.toMatch(/competitor/i);
  });
});
