import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listVideoJobs } from '@/app/api/hackathon/video-report/route';
import { formatJobCost } from '@/lib/video/videoJobs';
import RegenerateButton from './regenerate-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Video Report Jobs',
  robots: { index: false, follow: true },
};

// Video jobs dashboard (hackathon preview surface, same gating + noindex as
// the delivery page). History, status, costs, regenerate — for ANY scan:
// the subject shown is whatever the scan recorded (business, person,
// product, brand, or anything else), never assumed to be a local business.
// Job state lives in the durable Supabase store, so this page lists every
// job from any serverless instance (the old per-instance memory note is
// gone with the old Map). A processing job may still show its stall state
// if its invocation was cut off before the render phase — that is the
// delivery page's stall behavior, not a listing gap.
export default async function VideoReportJobsPage() {
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') {
    notFound();
  }
  const jobs = await listVideoJobs();

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontWeight: 700, letterSpacing: 1 }}>RANKALL.IO</p>
      <h1 style={{ fontSize: 30, lineHeight: 1.2 }}>Video report jobs</h1>
      <p style={{ color: '#4b5563' }}>
        Every video render started from a scan — newest first. Costs are the
        measured render cost when available, never an estimate presented as a
        bill.
      </p>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Note: jobs are stored in the database, so every job is listed here
        from any instance.
      </p>
      <p>
        <a
          href="/hackathon/video-report"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 8,
            background: '#111827',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Create a new video
        </a>
      </p>

      {jobs.length === 0 ? (
        <p style={{ color: '#4b5563', marginTop: 24 }}>
          No video jobs yet. Create one from the front door
          and it will appear here.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
          {jobs.map((job) => (
            <li
              key={job.jobId}
              style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{job.businessName ?? 'Unnamed job'}</strong>
                <span
                  style={{
                    color:
                      job.status === 'complete' ? '#15803d' : job.status === 'failed' ? '#b91c1c' : '#b45309',
                  }}
                >
                  {job.status === 'complete' ? 'Complete' : job.status === 'failed' ? 'Failed' : 'Processing'}
                </span>
              </div>
              <p style={{ color: '#6b7280', fontSize: 14, margin: '8px 0' }}>
                Started {new Date(job.createdAt).toLocaleString()}
                {job.result?.costs ? ` · Cost ${formatJobCost(job.result.costs)}` : ' · Cost not measured'}
                {job.result?.costs?.overBudget ? ' · Over budget guardrail' : ''}
              </p>
              {job.scanId ? (
                <p style={{ margin: '8px 0' }}>
                  <a href={`/hackathon/video-report/${job.scanId}`}>View scan&apos;s video page</a>
                </p>
              ) : (
                <p style={{ color: '#6b7280', fontSize: 14, margin: '8px 0' }}>
                  Started from an ad-hoc scan input (no scan page to link).
                </p>
              )}
              {job.status === 'complete' && job.result?.videoUrl ? (
                <p style={{ margin: '8px 0' }}>
                  <a href={job.result.videoUrl} target="_blank" rel="noreferrer">
                    Watch video
                  </a>
                </p>
              ) : null}
              {job.status === 'failed' ? (
                <p style={{ color: '#b91c1c', margin: '8px 0' }}>
                  {job.error ?? 'Render failed.'}
                  {job.failedStage ? ` (stage: ${job.failedStage})` : ''}
                </p>
              ) : null}
              {job.scanId ? (
                <div style={{ marginTop: 8 }}>
                  <RegenerateButton scanId={job.scanId} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
