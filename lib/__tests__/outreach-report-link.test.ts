// Outreach fix #1: emails link to the prospect's own free report page
// (/r/<id>), never to the paywalled /report/<id>, a bare ?q= search URL,
// or the homepage presented as a report.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  }),
}));

import { buildTouchEmail, isPublicReportUrl } from '../outreachEmail';
import { OUTREACH_SEQUENCE } from '../outreachSequences';
import { resolvePublicReportUrl } from '../publicShare';

const SCAN_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_URL = `https://rankall.io/r/${SCAN_ID}`;
const DAY3 = OUTREACH_SEQUENCE.find(t => t.day === 3)!;
const DAY1 = OUTREACH_SEQUENCE.find(t => t.day === 1)!;

const baseTarget = {
  email: 'owner@example.com',
  business_name: 'Test Dental',
  owner_name: 'Jane',
  city: 'Austin',
  industry: 'dentist',
  rankall_score: 40,
  competitor_name: 'Rival Dental',
  scan_id: SCAN_ID,
  video_url: `https://rankall.io/video/${SCAN_ID}`,
};

describe('isPublicReportUrl', () => {
  it('accepts a real /r/<uuid> URL', () => {
    expect(isPublicReportUrl(REPORT_URL)).toBe(true);
    expect(isPublicReportUrl(`https://www.rankall.io/r/${SCAN_ID}`)).toBe(true);
  });
  it('rejects ?q= search URLs, /report/ paywalled URLs, the homepage, and garbage', () => {
    expect(isPublicReportUrl('https://rankall.io/?q=Test+Dental+Austin')).toBe(false);
    expect(isPublicReportUrl(`https://rankall.io/report/${SCAN_ID}`)).toBe(false);
    expect(isPublicReportUrl('https://rankall.io')).toBe(false);
    expect(isPublicReportUrl('https://rankall.io/r/not-a-uuid')).toBe(false);
    expect(isPublicReportUrl('')).toBe(false);
    expect(isPublicReportUrl(null)).toBe(false);
    expect(isPublicReportUrl(undefined)).toBe(false);
    expect(isPublicReportUrl('not a url')).toBe(false);
  });
});

describe('buildTouchEmail (fix #1)', () => {
  it('links a {{report_url}} touch to the real /r/<id> page, never a ?q= URL', () => {
    const { html } = buildTouchEmail(DAY3, { ...baseTarget, report_url: REPORT_URL }, 'log-1');
    expect(html).toContain(`redirect=${encodeURIComponent(REPORT_URL)}`);
    expect(html).toContain('View your free AI report');
    expect(html).not.toContain('?q=');
  });
  it('a legacy ?q= stored URL is never mailed as a report link', () => {
    const { html } = buildTouchEmail(
      DAY3,
      { ...baseTarget, report_url: 'https://rankall.io/?q=Test+Dental+Austin' },
      'log-1',
    );
    expect(html).not.toContain('?q=');
    expect(html).not.toContain('View your free AI report');
    expect(html).not.toContain('redirect=');
  });
  it('a paywalled /report/ URL is never mailed as a report link', () => {
    const { html } = buildTouchEmail(
      DAY3,
      { ...baseTarget, report_url: `https://rankall.io/report/${SCAN_ID}` },
      'log-1',
    );
    expect(html).not.toContain('/report/');
    expect(html).not.toContain('View your free AI report');
  });
  it('no eligible report URL → no fabricated CTA link to the homepage', () => {
    const { html } = buildTouchEmail(DAY3, { ...baseTarget, report_url: null }, 'log-1');
    expect(html).not.toContain('View your free AI report');
    expect(html).not.toContain(`redirect=${encodeURIComponent('https://rankall.io')}`);
  });
  it('Day 1 still leads with the video thumbnail when there is no report URL', () => {
    const { html } = buildTouchEmail(DAY1, { ...baseTarget, report_url: null }, 'log-1');
    // Copy renamed video -> audio (the asset is an audio walkthrough);
    // the media block still leads, with no report link. The link itself
    // stays /video/<id> by design.
    expect(html).toContain('Listen to Your 1-Minute Audio Walkthrough');
    expect(html).not.toContain('Watch Your 1-Minute AI Report Video');
  });
});

describe('resolvePublicReportUrl (fix #1)', () => {
  beforeEach(() => { maybeSingleMock.mockReset(); });

  it('ownerless scan → /r/<id>', async () => {
    maybeSingleMock.mockResolvedValue({ data: { user_id: null, is_public: null }, error: null });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBe(REPORT_URL);
  });
  it('owned + published scan → /r/<id>', async () => {
    maybeSingleMock.mockResolvedValue({ data: { user_id: 'user-1', is_public: true }, error: null });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBe(REPORT_URL);
  });
  it('owned + unpublished scan → null (never mail a private scan as a free report)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { user_id: 'user-1', is_public: false }, error: null });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBeNull();
    maybeSingleMock.mockResolvedValue({ data: { user_id: 'user-1', is_public: null }, error: null });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBeNull();
  });
  it('missing scan / DB error → null', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBeNull();
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(resolvePublicReportUrl(SCAN_ID)).resolves.toBeNull();
  });
  it('invalid or missing scan id → null without a DB read', async () => {
    await expect(resolvePublicReportUrl('not-a-uuid')).resolves.toBeNull();
    await expect(resolvePublicReportUrl(null)).resolves.toBeNull();
    await expect(resolvePublicReportUrl(undefined)).resolves.toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });
});
