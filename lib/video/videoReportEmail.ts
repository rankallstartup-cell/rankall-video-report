// ── "Your video is ready" email ────────────────────────────────────────────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026), Day 5.
//
// Builds the email for the scan → video → email → signup loop. Pure string
// building (like lib/outreachEmail.ts) — the actual send goes through the
// repo's existing lib/emailTemplates.ts sendEmail (Resend HTTP API).
//
// Honesty rules: every interpolated value is HTML-escaped; the score line
// appears only when a real score is supplied; no competitor, no revenue,
// no figure that did not come from the scan. Both URLs must be http(s) or
// the builder throws — a bad URL is never mailed.

export interface VideoReadyEmailInput {
  businessName: string;
  city?: string | null;
  industry?: string | null;
  score?: number | null;
  /** Delivery page URL (already carries ?videoUrl= when the video is ready). */
  deliveryUrl: string;
  /** Direct mp4 URL, for clients that cannot play the page embed. */
  videoUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildVideoReadyEmail(input: VideoReadyEmailInput): {
  subject: string;
  html: string;
} {
  if (!isHttpUrl(input.deliveryUrl)) throw new Error('deliveryUrl must be an http(s) URL');
  if (!isHttpUrl(input.videoUrl)) throw new Error('videoUrl must be an http(s) URL');

  const name = escapeHtml(input.businessName || 'your business');
  const place = [input.city, input.industry].filter(Boolean).join(' · ');
  const placeLine = place ? `<p style="color:#55556a;font-size:14px;margin:0 0 16px">${escapeHtml(place)}</p>` : '';
  const scoreLine =
    typeof input.score === 'number' && Number.isFinite(input.score)
      ? `<p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 14px">Your AI visibility score is ${Math.round(input.score)} out of 100.</p>`
      : '';

  return {
    subject: `Your AI visibility video is ready — ${input.businessName || 'your business'}`,
    html: [
      `<p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 14px">Hi there,</p>`,
      `<p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 14px">Your personalized 60-second video report for ${name} is ready — made from your own scan, not a template.</p>`,
      placeLine,
      scoreLine,
      `<p style="margin:22px 0"><a href="${escapeHtml(input.deliveryUrl)}" style="display:inline-block;background:#1b17ff;color:#ffffff;font-size:15px;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none">Watch your video →</a></p>`,
      `<p style="font-size:13px;color:#55556a;line-height:1.6;margin:0">Direct video link: <a href="${escapeHtml(input.videoUrl)}">${escapeHtml(input.videoUrl)}</a></p>`,
      `<p style="font-size:13px;color:#55556a;line-height:1.6;margin:14px 0 0">On the video page you can claim your free report to see every platform and the exact fixes, in order.</p>`,
    ].join(''),
  };
}
