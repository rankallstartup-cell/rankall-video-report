// ── Delivery-page video player (client component) ─────────────────────────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026), Days 4–5.
//
// Owns the video area of /hackathon/video-report/[scan_id]:
//   ?videoUrl=<mp4> present  → play it immediately (email flow contract).
//   no videoUrl              → start a pipeline run via POST
//                              /api/hackathon/video-report { scanId }, then
//                              poll GET ?jobId= until it completes.
// The honest "preparing" state stays up the whole time; a failed or
// stalled job shows a real failure state + a retry button — never a fake
// video, never invented progress.
//
// Dedupe: the jobId is kept in sessionStorage per scan so a refresh
// resumes polling the same job instead of starting (and paying for) a
// second render. On completion the URL gains ?videoUrl= via replaceState,
// so a later refresh plays straight from the parameter with no new job.
//
// Stall handling (see lib/video/playerState.ts + the API route's module
// doc): a serverless instance can freeze after POST returns, so a job
// can sit on "processing" forever. Past STALL_AFTER_MS the player says so
// and offers a retry, which starts a fresh job. Production needs a
// queue/worker; this page must not pretend the queue exists.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POLL_INTERVAL_MS,
  STALL_AFTER_MS,
  formatElapsed,
  isSafeVideoUrl,
  playerStatusFor,
  type PlayerStatus,
} from '@/lib/video/playerState';

interface JobRecord {
  status: 'processing' | 'complete' | 'failed';
  result?: { videoUrl?: string | null };
  error?: string;
  failedStage?: string;
}

function storageKey(scanId: string): string {
  return `rankall-video-job:${scanId}`;
}

export default function VideoReportPlayer({
  scanId,
  initialVideoUrl,
}: {
  scanId: string;
  initialVideoUrl: string | null;
}) {
  const [status, setStatus] = useState<PlayerStatus>(
    initialVideoUrl && isSafeVideoUrl(initialVideoUrl) ? 'ready' : 'preparing',
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(
    initialVideoUrl && isSafeVideoUrl(initialVideoUrl) ? initialVideoUrl : null,
  );
  const [failedStage, setFailedStage] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  // Guards the StrictMode double-effect: one start per mount, not two jobs.
  const startedRef = useRef(false);

  const startJob = useCallback(async () => {
    setStatus('preparing');
    setFailedStage(null);
    try {
      const res = await fetch('/api/hackathon/video-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      if (!res.ok) {
        setStatus('failed');
        return;
      }
      const data = (await res.json()) as { jobId?: string };
      if (!data.jobId) {
        setStatus('failed');
        return;
      }
      try {
        sessionStorage.setItem(storageKey(scanId), data.jobId);
      } catch {
        // Private mode: dedupe is best-effort; polling still works.
      }
      // Pass t0 explicitly: setStartedAt is async, so the poll closure
      // would otherwise measure elapsed from the previous render's value.
      const t0 = Date.now();
      setStartedAt(t0);
      pollJob(data.jobId, t0);
    } catch {
      setStatus('failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const pollJob = useCallback(
    (jobId: string, t0: number) => {
      let cancelled = false;
      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(
            `/api/hackathon/video-report?jobId=${encodeURIComponent(jobId)}`,
          );
          if (cancelled) return;
          if (res.status === 404) {
            // Job record lost (instance recycled) — this attempt is over.
            setStatus('stalled');
            return;
          }
          if (!res.ok) return; // Transient error: keep polling, don't fail.
          const record = (await res.json()) as JobRecord;
          if (cancelled) return;
          const next = playerStatusFor(
            { status: record.status, videoUrl: record.result?.videoUrl ?? null },
            Date.now() - t0,
          );
          if (next === 'ready' && isSafeVideoUrl(record.result?.videoUrl)) {
            const url = record.result!.videoUrl as string;
            setVideoUrl(url);
            setStatus('ready');
            try {
              sessionStorage.removeItem(storageKey(scanId));
            } catch {
              // Best-effort only.
            }
            // Make the finished video shareable + refresh-safe: the URL
            // now carries ?videoUrl=, so a reload plays it with no new job.
            try {
              const u = new URL(window.location.href);
              u.searchParams.set('videoUrl', url);
              window.history.replaceState(null, '', u.toString());
            } catch {
              // Best-effort only.
            }
            return;
          }
          if (next === 'failed') {
            setFailedStage(record.failedStage ?? null);
            setStatus('failed');
            return;
          }
          if (next === 'stalled') {
            setStatus('stalled');
            return;
          }
          // Still preparing: schedule the next poll.
          setTimeout(tick, POLL_INTERVAL_MS);
        } catch {
          // Transient network error: keep polling, don't fail the job.
          setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      void tick();
      return () => {
        cancelled = true;
      };
    },
    [scanId],
  );

  // Elapsed-time ticker for the preparing state (real time, not progress).
  useEffect(() => {
    if (status !== 'preparing') return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [status]);

  // Stall watchdog: preparing past STALL_AFTER_MS is a stall, not patience.
  useEffect(() => {
    if (status !== 'preparing') return;
    const remaining = STALL_AFTER_MS - (now - startedAt);
    if (remaining <= 0) {
      setStatus('stalled');
      return;
    }
    const id = setTimeout(() => setStatus('stalled'), remaining);
    return () => clearTimeout(id);
  }, [status, now, startedAt]);

  // First mount: resume a stored job, or start a fresh one.
  useEffect(() => {
    if (initialVideoUrl && isSafeVideoUrl(initialVideoUrl)) return;
    if (startedRef.current) return;
    startedRef.current = true;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(storageKey(scanId));
    } catch {
      stored = null;
    }
    if (stored) {
      // Resume polling the stored job; its start time is unknown after a
      // refresh, so measure elapsed from this mount (stall watchdog may
      // fire early on a very old resumed job — retry is the honest path).
      pollJob(stored, Date.now());
    } else {
      void startJob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const retry = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey(scanId));
    } catch {
      // Best-effort only.
    }
    startedRef.current = true;
    void startJob();
  }, [scanId, startJob]);

  if (status === 'ready' && videoUrl) {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        src={videoUrl}
        style={{ width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 12, display: 'block' }}
      >
        Your browser does not support video.
      </video>
    );
  }

  if (status === 'failed') {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          Video generation failed{failedStage ? ` during ${failedStage}` : ''}
        </p>
        <p style={{ color: '#55556A', fontSize: 15, lineHeight: 1.5, margin: '0 0 16px' }}>
          Your numbers below are still accurate — only the video render failed. Try again and it
          will start a fresh render.
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            background: '#1B17FF', color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Try generating again
        </button>
      </div>
    );
  }

  if (status === 'stalled') {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          This is taking longer than usual
        </p>
        <p style={{ color: '#55556A', fontSize: 15, lineHeight: 1.5, margin: '0 0 16px' }}>
          The render may have stalled — this attempt stopped, but your scan is unaffected.
          Try again and it will start a fresh render.
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            background: '#1B17FF', color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Try generating again
        </button>
      </div>
    );
  }

  // Preparing: honest state, real elapsed time, no fake progress.
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Your video is being prepared</p>
      <p style={{ color: '#55556A', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        We&apos;re turning your scan into your 60-second video. Your numbers below are ready now —
        and the video will play here as soon as it&apos;s rendered.
        ({formatElapsed(now - startedAt)} elapsed — a full render usually takes a few minutes.)
      </p>
    </div>
  );
}
