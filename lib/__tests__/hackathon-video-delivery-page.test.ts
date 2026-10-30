// Hackathon delivery page contract (app/hackathon/video-report/[scan_id]),
// Days 4–5 integration: video at the top (now polling the pipeline),
// numbers underneath, exactly ONE signup CTA, plus the one labeled
// pre-existing secondary business-page link. Wound-first order, no
// invented figures, gated by the same flag as the API.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const page = readFileSync(
  join(process.cwd(), 'app/hackathon/video-report/[scan_id]/page.tsx'),
  'utf8',
);
const player = readFileSync(
  join(process.cwd(), 'app/hackathon/video-report/[scan_id]/video-player.tsx'),
  'utf8',
);
const playerState = readFileSync(
  join(process.cwd(), 'lib/video/playerState.ts'),
  'utf8',
);

describe('hackathon delivery page', () => {
  it('has a video player (client component), the numbers, and the one signup CTA', () => {
    expect(player).toContain('<video');
    expect(page).toContain('Claim your free report');
    expect(page).toContain('id="signup-cta"');
    // Exactly one signup CTA — the ?src= marker is the loop tracking.
    expect((page.match(/href="\/signup/g) ?? []).length).toBe(1);
    expect(page).toContain('src=video-report');
  });

  it('polls the pipeline instead of faking a video: start, poll, dedupe, stall', () => {
    expect(player).toContain("'/api/hackathon/video-report'");
    expect(player).toContain('jobId');
    expect(player).toContain('sessionStorage');
    expect(player).toContain('Try generating again');
    expect(playerState).toContain('STALL_AFTER_MS');
    expect(player).toContain('stalled');
  });

  it('never renders a broken player: no video URL means a preparing state, failed means a failure state', () => {
    expect(player).toContain('Your video is being prepared');
    expect(player).toContain('Video generation failed');
    expect(page).toContain('isHttpUrl');
  });

  it('has exactly one secondary link: the pre-existing business page, staging only, never guessed', () => {
    expect(page).toContain('id="business-page-link"');
    expect(page).toContain('View the full business page');
    expect(page).toContain('Pre-existing');
    expect(page).toContain('https://rankall-staging.vercel.app/business/');
    expect(page).toContain('latest_scan_id');
    expect(page).not.toContain('/leaderboard');
    expect(page).not.toContain('/?q=');
  });

  it('is wound-first: video section comes before numbers, CTA last, business link after the CTA', () => {
    const videoAt = page.indexOf('id="video-player"');
    const numbersAt = page.indexOf('id="numbers"');
    const ctaAt = page.indexOf('id="signup-cta"');
    const bizAt = page.indexOf('id="business-page-link"');
    expect(videoAt).toBeGreaterThan(-1);
    expect(numbersAt).toBeGreaterThan(videoAt);
    expect(ctaAt).toBeGreaterThan(numbersAt);
    expect(bizAt).toBeGreaterThan(ctaAt);
  });

  it('is gated by the same flag as the video-report API', () => {
    expect(page).toContain('HACKATHON_VIDEO_REPORT_ENABLED');
    expect(page).toContain('notFound()');
  });

  it('invents no revenue figure and no generic competitor', () => {
    expect(page).not.toContain('revenueGapForScan');
    expect(page).not.toContain('Top Competitor');
  });
});
