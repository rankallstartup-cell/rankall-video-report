import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FrontDoorForm from './front-door-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Get Your AI Visibility Video',
  robots: { index: false, follow: true },
};

// Self-serve front door (hackathon preview surface, same gating + noindex
// as the delivery page). Any visitor runs a scan and gets their video —
// the real conversion product, not just a judge demo. Tier-agnostic by
// construction: the form takes any business, person, product, or brand,
// and the copy names the full range instead of any single vertical.
export default function VideoReportFrontDoorPage() {
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') {
    notFound();
  }
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontWeight: 700, letterSpacing: 1 }}>RANKALL.IO</p>
      <h1 style={{ fontSize: 32, lineHeight: 1.2 }}>Get your AI visibility video</h1>
      <p style={{ color: '#4b5563', fontSize: 18, lineHeight: 1.5 }}>
        Enter any business, person, product, or brand. We scan it across 12 AI
        platforms and turn your results into your own 60-second video report.
      </p>
      <p style={{ color: '#4b5563', lineHeight: 1.5 }}>
        For local businesses, personal brands, products, agencies, enterprises,
        government programs, and global brands — if customers ask AI for what
        you do, this shows where you stand.
      </p>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        A full scan takes a minute or two; the video renders in a few minutes
        after that. Your video page shows real elapsed time while it works —
        never fake progress.
      </p>
      <FrontDoorForm />
      <p style={{ marginTop: 24 }}>
        <a href="/hackathon/video-report/jobs" style={{ color: '#4b5563' }}>
          View video jobs
        </a>
      </p>
    </main>
  );
}
