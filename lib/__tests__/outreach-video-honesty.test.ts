// Outreach #6 — video honesty gap (audio walkthrough copy).
// The outreach flow promises a "video" that does not exist: the /video page
// renders an <audio> player (ElevenLabs narration), never a video. Every
// user-facing instance must say "audio walkthrough", never "video".
// Identifiers are deliberately NOT renamed (video_url, /video/<id>, the
// video_page_viewed analytics event) — links and analytics stay stable; only
// the human-facing promise changes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTREACH_SEQUENCE } from '../outreachSequences';
import { buildTouchEmail } from '../outreachEmail';
import { PERSONAL_PRO_OUTREACH } from '../outreachTemplates';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('outreach #6: no video promise remains in Day-1 outreach copy', () => {
  it('Day-1 sequence body promises an audio walkthrough, never a video', () => {
    const day1 = OUTREACH_SEQUENCE.find((t) => t.day === 1)!;
    expect(day1.body).toContain('1-minute audio walkthrough');
    expect(day1.body).not.toMatch(/video/i);
  });

  it('Day-1 built email CTA says Listen / Audio Walkthrough, never Watch / Video', () => {
    const { html } = buildTouchEmail(
      OUTREACH_SEQUENCE[0],
      {
        email: 'owner@example.com',
        business_name: 'Acme Dental',
        owner_name: 'Dr. Acme',
        city: 'Austin',
        industry: 'Dentist',
        rankall_score: 45,
        competitor_name: 'Bright Smiles',
        scan_id: 'scan-123',
      },
      'log-1',
    );
    expect(html).toContain('Listen to Your 1-Minute Audio Walkthrough');
    expect(html).not.toContain('Watch Your');
    expect(html).not.toContain('AI Report Video');
    // The link itself stays /video/<id> by design (links unchanged) — only
    // the human-facing promise changes. It appears URL-encoded inside the
    // click-track redirect.
    expect(html).toContain('video%2Fscan-123');
  });

  it('Personal Pro outreach templates promise audio, never video', () => {
    const stripPlaceholder = (s: string) => s.replace(/\{\{video_url\}\}/g, '');
    for (const key of ['touch1', 'touch3'] as const) {
      const t = PERSONAL_PRO_OUTREACH[key];
      expect(stripPlaceholder(t.body)).not.toMatch(/video/i);
      expect(stripPlaceholder(t.subject)).not.toMatch(/video/i);
    }
    expect(PERSONAL_PRO_OUTREACH.touch1.body).toContain('audio walkthrough');
    expect(PERSONAL_PRO_OUTREACH.touch3.body).toContain('audio walkthrough');
    expect(PERSONAL_PRO_OUTREACH.touch3.subject).toContain('2-min audio');
  });

  it('generate-video-email builder promises audio in CTA, WhatsApp and script prompt', () => {
    const route = src('app/api/outreach/generate-video-email/route.ts');
    expect(route).toContain('Listen to Your 1-Minute Audio Walkthrough');
    expect(route).toContain('Free 60-sec audio walkthrough');
    expect(route).toContain('1-minute spoken audio script');
    expect(route).not.toContain('Watch Your 1-Minute Video Report');
    expect(route).not.toContain('video report:');
    expect(route).not.toContain('spoken video script');
  });

  it('LinkedIn messages promise audio, never video', () => {
    const route = src('app/api/linkedin/generate-messages/route.ts');
    expect(route).toContain('1-minute audio walkthrough');
    expect(route).toContain('Audio walkthrough URL');
    expect(route).not.toContain('video walkthrough');
    expect(route).not.toContain('Video URL');
  });
});

describe('outreach #6: /video page is honest about audio', () => {
  it('page title says Audio Walkthrough, never Video', () => {
    const page = src('app/video/[scan_id]/page.tsx');
    expect(page).toContain('Scan Audio Walkthrough | Rankall');
    expect(page).not.toContain('Scan Video | Rankall');
  });

  it('audio section heading says audio walkthrough', () => {
    const page = src('app/video/[scan_id]/page.tsx');
    expect(page).toContain('Your personalized audio walkthrough');
  });

  it('a missing audio file gets an honest note, never a broken player', () => {
    const page = src('app/video/[scan_id]/page.tsx');
    // The player only renders after a HEAD check proves the file exists.
    expect(page).toContain("method: 'HEAD'");
    expect(page).toContain('audioAvailable');
    expect(page).toContain("isn&apos;t available for this scan yet");
  });

  it('no-scan case still 404s (never promises audio for a scan that does not exist)', () => {
    const page = src('app/video/[scan_id]/page.tsx');
    // b8bf rewrite renamed the variable: the null check runs on the
    // loaded row, before scan is mapped from it.
    expect(page).toContain('if (!row) return notFound();');
  });
});
