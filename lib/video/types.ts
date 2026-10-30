// ── Hackathon video-report pipeline: provider-agnostic types ───────────────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026).
// Entry wedge: a personalized 60-second video report generated from a
// business's AI-visibility scan (free scan → their own video → signup).
//
// Providers are swappable behind this interface so the video-generation
// backend can be spiked (days 1–2) and swapped without touching the route
// or the script builder. Keys are read from env ONLY — never hardcode.
export type VideoProviderName = 'meta' | 'heygen' | 'elevenlabs';

export type VideoJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

export interface VoiceOptions {
  /** Provider-specific voice id. When omitted, the provider default is used. */
  voiceId?: string;
  /** Natural-language voice direction, e.g. "warm, urgent, trustworthy". */
  style?: string;
  /** Target narration speed, 0.8–1.2 where supported. */
  speed?: number;
}

export interface VideoRenderOptions {
  voice?: VoiceOptions;
  /** Target total runtime in seconds. Default 60. */
  durationSeconds?: number;
  /** Locale for narration, e.g. 'en-US'. */
  locale?: string;
  /** Free-form tags the provider may use for caching/lookup. */
  tags?: Record<string, string>;
}

export interface VideoRenderResult {
  provider: VideoProviderName;
  /** Opaque provider-side job id. Poll getStatus() when videoUrl is null. */
  jobId: string;
  status: VideoJobStatus;
  /** Set when status === 'complete'. */
  videoUrl: string | null;
  /** Direct audio track, when the provider renders narration separately. */
  audioUrl?: string | null;
  error?: string;
}

export interface VideoProvider {
  readonly name: VideoProviderName;
  /** True when the provider's env key(s) are present. Never throws. */
  isConfigured(): boolean;
  /** Render the script. Throws when not configured (with a clear message). */
  renderVideo(script: VideoScript, options?: VideoRenderOptions): Promise<VideoRenderResult>;
  /** Poll a job started by renderVideo. */
  getStatus(jobId: string): Promise<VideoRenderResult>;
}

// Imported by the provider files below to avoid a circular import.
export interface VideoScriptSection {
  /** Section label, e.g. 'hook' | 'finding-1' | 'cta'. */
  id: string;
  /** On-screen headline / lower-third text. */
  onScreenText: string;
  /** Spoken narration for this section (~25–40 words keeps 60s pacing). */
  narration: string;
}

export interface VideoScript {
  version: 1;
  /** Display title, e.g. "Your AI visibility report — Brite Smiles". */
  title: string;
  /** Target runtime in seconds. */
  targetDurationSeconds: number;
  hook: VideoScriptSection;
  findings: VideoScriptSection[];
  cta: VideoScriptSection;
  /** Full narration stitched in speaking order (handy for TTS providers). */
  fullNarration: string;
}
