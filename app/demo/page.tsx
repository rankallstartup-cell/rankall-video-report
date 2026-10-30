'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import HomepageScanVideo from '@/components/HomepageScanVideo';
import Logo from '@/components/Logo';

const BG = '#0a0a1a';
const CARD = '#1a1a2e';
const PURPLE = '#1B17FF';
const RED = '#dc2626';
const GREEN = '#22c55e';
const GRAY = '#9ca3af';
const WHITE = '#ffffff';

interface TourStep {
  id?: string;
  title?: string;
  duration?: number;
  narration?: string;
  tooltip?: string;
  highlight?: string;
  screenshot_url?: string;
  video_url?: string;
  audio_url?: string;
}

export default function DemoTourPage() {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [needsStart, setNeedsStart] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const indexRef = useRef(0);
  const stepsRef = useRef<TourStep[] | null>(null);
  const validStepsRef = useRef<TourStep[]>([]);

  indexRef.current = index;
  stepsRef.current = steps;

  // Fetch tour data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read via a server route (service-role) so RLS on product_tour can't
        // hide the data from the anon browser client.
        const res = await fetch('/api/tour', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        const s = data?.steps;
        console.log('[/demo] /api/tour steps:', Array.isArray(s) ? s.length : 'none',
          Array.isArray(s) ? `(with screenshots: ${s.filter((x: any) => x?.screenshot_url).length})` : '',
          data?.error ? `error: ${data.error}` : '');
        setSteps(Array.isArray(s) ? s : null);
      } catch (e) {
        console.log('[/demo] /api/tour fetch error:', e);
        if (!cancelled) setSteps(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Determine if we have a usable player. Show the real tour using whatever
  // steps actually have a screenshot — do NOT require every step to have one,
  // or a single failed capture would hide the entire tour behind the fallback.
  const validSteps: TourStep[] =
    steps && steps.length > 0
      ? steps.filter((st) => !!st && (!!st.screenshot_url || !!st.video_url))
      : [];
  const hasPlayer = validSteps.length > 0;
  validStepsRef.current = validSteps;

  // Visual-only mode: when no step has narration audio, the tour auto-advances
  // on a timer instead of depending on audio.play() to drive progress.
  const hasAudio = validSteps.some((st) => !!st.audio_url);

  const total = validSteps.length;
  const current = hasPlayer ? validSteps[Math.min(index, total - 1)] : undefined;

  // Load audio for current step
  const loadAndPlay = useCallback(
    (autoplay: boolean) => {
      const el = audioRef.current;
      const s = validStepsRef.current;
      if (!el || !s) return;
      const step = s[indexRef.current];
      setAudioTime(0);
      setAudioDuration(0);
      if (step?.audio_url) {
        el.src = step.audio_url;
        el.load();
        if (autoplay) {
          el.play().then(
            () => {
              setPlaying(true);
              setNeedsStart(false);
            },
            () => {
              // autoplay blocked
              setNeedsStart(true);
            }
          );
        }
      } else {
        // No audio: stop, leave as paused
        el.removeAttribute('src');
      }
    },
    []
  );

  // When index changes (and player active), load + autoplay. In visual-only
  // mode (no audio on this step) auto-advance on a fixed timer instead.
  useEffect(() => {
    if (!hasPlayer) return;

    const step = validSteps[index];

    if (hasAudio && step?.audio_url) {
      return;
    }

    if (!playing) return;

    const timer = setTimeout(() => {
      if (index < validSteps.length - 1) {
        setIndex((prev) => prev + 1);
      } else {
        setPlaying(false);
        setShowCTA(true);
      }
    }, (step?.duration && step.duration > 0 ? step.duration : 6) * 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hasPlayer, hasAudio, playing, current?.duration]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid && current?.video_url) {
      vid.src = current.video_url;
      vid.load();
      if (playing) {
        vid.play().catch(() => {});
        loadAndPlay(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, loadAndPlay]);

  const goNext = useCallback(() => {
    const valid = validStepsRef.current;
    if (valid.length === 0) return;
    const el = audioRef.current;
    if (el) {
      el.pause();
    }
    setIndex((i) => {
      if (i >= valid.length - 1) {
        setShowCTA(true);
        return i;
      }
      return i + 1;
    });
  }, []);

  const goPrev = useCallback(() => {
    setShowCTA(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPlaying(true);
      loadAndPlay(true);
    } else {
      vid.pause();
      setPlaying(false);
      audioRef.current?.pause();
    }
  }, [loadAndPlay]);

  // Keyboard navigation
  useEffect(() => {
    if (!hasPlayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPlayer, goNext, goPrev, togglePlay]);

  const onShare = () => {
    const text = 'See how AI recommends businesses: https://rankall.io/demo';
    try {
      navigator.clipboard?.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => {}
      );
    } catch {
      /* ignore */
    }
  };

  // ---------- FALLBACK ----------
  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: BG,
          color: WHITE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <p style={{ color: GRAY }}>Loading tour…</p>
      </main>
    );
  }

  if (!hasPlayer) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: BG,
          color: WHITE,
          fontFamily: 'sans-serif',
          padding: '48px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <p
          style={{
            color: '#a78bfa',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            margin: '0 0 8px',
          }}
        >
          Rankall Product Tour
        </p>
        <h1
          style={{
            fontSize: 'clamp(24px, 5vw, 36px)',
            fontWeight: 800,
            margin: '0 0 12px',
            textAlign: 'center',
          }}
        >
          See how AI recommends businesses
        </h1>
        <div
          style={{
            background: CARD,
            border: '1px solid #2a2a3e',
            borderRadius: 14,
            padding: '12px 20px',
            margin: '0 0 28px',
            color: GRAY,
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {/* b8ah: the tour is NOT being produced — product_tour is empty on
              staging and nothing produces it (generate-tour needs the
              ElevenLabs key + a manual run). Stop promising it. */}
          Interactive tour — not recorded yet. The animated example below shows how a scan works.
        </div>

        <div style={{ width: '100%', maxWidth: 640 }}>
          <HomepageScanVideo />
        </div>

        {/* b8ah: the old link promised an "animated preview" on /demo-video,
            which has no video — misleading/dead. The animation is on THIS
            page; the honest CTA is the free scan. */}
        <a
          href="/#scan"
          style={{
            display: 'inline-block',
            marginTop: 28,
            background: PURPLE,
            color: WHITE,
            textDecoration: 'none',
            borderRadius: 12,
            padding: '14px 28px',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Scan your business free <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </a>
      </main>
    );
  }

  // ---------- PLAYER ----------
  const stepNum = Math.min(index + 1, total);
  const progressPct = total > 1 ? (index / (total - 1)) * 100 : 100;
  const audioPct =
    audioDuration > 0 ? Math.min(100, (audioTime / audioDuration) * 100) : 0;

  // Word-by-word caption reveal
  const narration = current?.narration ?? '';
  const words = narration.split(/\s+/).filter(Boolean);
  let revealedCount = words.length;
  if (audioDuration > 0 && words.length > 0) {
    revealedCount = Math.max(
      1,
      Math.min(words.length, Math.ceil((audioTime / audioDuration) * words.length))
    );
  }

  const tooltipText = current?.tooltip || current?.highlight || '';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: BG,
        color: WHITE,
        fontFamily: 'sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        if (Math.abs(dx) > 50) {
          if (dx < 0) goNext();
          else goPrev();
        }
        touchStartX.current = null;
      }}
    >
      <style>{`
        @keyframes demo-fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes demo-ringpulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.6) }
          50% { box-shadow: 0 0 0 12px rgba(124,58,237,0) }
        }
        @keyframes slideProgress {
          from { width: 0% }
          to { width: 100% }
        }
        @media (max-width: 767px) {
          .demo-topbar-center { display: none !important; }
        }
      `}</style>

      {/* TOP BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid #1f1f33',
          flexShrink: 0,
        }}
      >
        <a href="/" aria-label="RankAll home" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          <Logo variant="white" height={24} />
        </a>
        <span
          className="demo-topbar-center"
          style={{ color: GRAY, fontSize: 14, fontWeight: 600 }}
        >
          Product Tour
        </span>
        <a
          href="/"
          style={{
            background: PURPLE,
            color: WHITE,
            textDecoration: 'none',
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Try it free <svg viewBox="0 0 448 512" width="13" height="13" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </a>
      </div>

      {/* STEP COUNTER + PROGRESS */}
      <div style={{ padding: '10px 18px 0', flexShrink: 0 }}>
        <div style={{ color: GRAY, fontSize: 13, marginBottom: 6 }}>
          Step {stepNum} of {total}
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            background: '#1f1f33',
            borderRadius: 100,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background: PURPLE,
              borderRadius: 100,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* MAIN AREA — screenshot */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '12px' : '20px',
          position: 'relative',
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 1100,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {/* keyed element forces remount -> crossfade animation */}
          {current?.video_url ? (
            // Screen recording for this step. Muted + looping so it fills the
            // narration window and never fights the Brad voiceover (audio_url),
            // which is the authoritative sound and also drives step advancement.
            <video
              src={current?.video_url || ''}
              ref={videoRef}
              muted
              playsInline
              style={{
                width: '100%',
                maxHeight: isMobile ? '50vh' : '60vh',
                objectFit: 'contain',
                aspectRatio: '16 / 9',
                borderRadius: 14,
                border: '1px solid #2a2a3e',
                background: CARD,
                boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
                animation: 'demo-fadein 0.5s ease',
              }}
              onEnded={() => {
                if (indexRef.current >= total - 1) {
                  setPlaying(false);
                  setShowCTA(true);
                } else {
                  goNext();
                }
              }}
              onError={(e) => {
                (e.currentTarget as HTMLVideoElement).style.visibility = 'hidden';
              }}
            />
          ) : (
            // azxj: next/image with explicit 1280x720 dimensions reserves the
            // 16:9 box before the image loads (CLS). unoptimized: screenshot
            // URLs come from the product_tour table and can be any host, so
            // the optimizer cannot allowlist them — an unlisted host would
            // break the tour. No screenshot URL renders the same box as a
            // placeholder instead of a broken <img>.
            current?.screenshot_url ? (
              <Image
                key={current.screenshot_url}
                src={current.screenshot_url}
                alt={current?.title || `Step ${stepNum}`}
                width={1280}
                height={720}
                unoptimized
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: isMobile ? '50vh' : '60vh',
                  objectFit: 'contain',
                  aspectRatio: '16 / 9',
                  borderRadius: 14,
                  border: '1px solid #2a2a3e',
                  background: CARD,
                  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
                  animation: 'demo-fadein 0.5s ease',
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
            ) : (
              <div
                key={`no-screenshot-${index}`}
                style={{
                  width: '100%',
                  maxHeight: isMobile ? '50vh' : '60vh',
                  aspectRatio: '16 / 9',
                  borderRadius: 14,
                  border: '1px solid #2a2a3e',
                  background: CARD,
                  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
                  animation: 'demo-fadein 0.5s ease',
                }}
              />
            )
          )}
          {tooltipText && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: '90%',
                background: 'rgba(124,58,237,0.95)',
                color: WHITE,
                padding: '8px 16px',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 600,
                animation: 'demo-ringpulse 2s ease-in-out infinite',
              }}
            >
              {tooltipText}
            </div>
          )}
        </div>
      </div>

      {/* Visual-mode slide timer — shows how long until the next slide when
          there is no narration audio to drive progress. */}
      {!hasAudio && playing && (
        <div style={{ height: 3, background: '#1e2a3a', borderRadius: 2, overflow: 'hidden', margin: '8px 20px' }}>
          <div
            key={index}
            style={{ height: '100%', background: PURPLE, animation: 'slideProgress 6s linear forwards' }}
          />
        </div>
      )}

      {/* BOTTOM PANEL */}
      <div
        style={{
          background: CARD,
          borderTop: '1px solid #2a2a3e',
          padding: isMobile ? '14px 16px' : '18px 28px',
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: isMobile ? 18 : 22,
            fontWeight: 800,
          }}
        >
          {current?.title || ''}
        </h2>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: isMobile ? 14 : 16,
            lineHeight: 1.6,
            color: GRAY,
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                color: i < revealedCount ? WHITE : '#4b4b63',
                transition: 'color 0.2s ease',
              }}
            >
              {w}{' '}
            </span>
          ))}
        </p>
        {!hasAudio && (
          <p style={{ color: '#4b5563', fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
            Visual tour · Add ElevenLabs key and re-run generate-tour for audio narration
          </p>
        )}

        {/* Audio progress */}
        <div
          style={{
            width: '100%',
            height: 4,
            background: '#0f0f1f',
            borderRadius: 100,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: `${audioPct}%`,
              height: '100%',
              background: GREEN,
              borderRadius: 100,
            }}
          />
        </div>

        {/* NAV — always visible below the video */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <button onClick={goPrev} style={navBtnStyle(index === 0)} disabled={index === 0}>
            <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Previous
          </button>
          <button onClick={togglePlay} style={navBtnStyle(false, true)}>
            {playing ? (<><svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z"/></svg> Pause</>) : (<><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg> Play</>)}
          </button>
          <button onClick={goNext} style={navBtnStyle(false)}>
            Next <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </button>
        </div>
      </div>

      {/* Single audio element */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setAudioTime(el.currentTime || 0);
          if (el.duration && !isNaN(el.duration)) setAudioDuration(el.duration);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (d && !isNaN(d)) setAudioDuration(d);
        }}
        onEnded={() => {}}
      />

      {/* CTA OVERLAY */}
      {showCTA && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,10,26,0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            padding: 24,
            textAlign: 'center',
            animation: 'demo-fadein 0.4s ease',
          }}
        >
          <h2 style={{ fontSize: 'clamp(26px, 6vw, 40px)', fontWeight: 900, margin: '0 0 24px' }}>
            Ready to see YOUR score?
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginBottom: 18,
            }}
          >
            <a
              href="/"
              style={{
                background: PURPLE,
                color: WHITE,
                textDecoration: 'none',
                borderRadius: 12,
                padding: '16px 28px',
                fontSize: 17,
                fontWeight: 800,
              }}
            >
              Scan My Business Free <svg viewBox="0 0 448 512" width="15" height="15" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </a>
            <a
              href="/pricing"
              style={{
                background: 'transparent',
                color: WHITE,
                textDecoration: 'none',
                borderRadius: 12,
                padding: '16px 28px',
                fontSize: 17,
                fontWeight: 800,
                border: `2px solid ${PURPLE}`,
              }}
            >
              Start Free Trial <svg viewBox="0 0 448 512" width="15" height="15" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </a>
          </div>
          <button
            onClick={onShare}
            style={{
              background: 'transparent',
              color: GRAY,
              border: '1px solid #2a2a3e',
              borderRadius: 100,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Copied!</>) : 'Share this demo'}
          </button>
          <button
            onClick={() => {
              setShowCTA(false);
              setIndex(0);
            }}
            style={{
              marginTop: 20,
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Replay tour
          </button>
        </div>
      )}
    </main>
  );
}

function navBtnStyle(disabled: boolean, primary = false): React.CSSProperties {
  return {
    background: primary ? PURPLE : '#0f0f1f',
    color: disabled ? '#4b4b63' : WHITE,
    border: primary ? 'none' : '1px solid #2a2a3e',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
  };
}
