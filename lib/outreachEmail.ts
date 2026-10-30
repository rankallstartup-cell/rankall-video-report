// lib/outreachEmail.ts
// Renders a cold-outreach touch into a send-ready HTML email: personalised body,
// an audio-player thumbnail on Day 1, a tracking open-pixel, click-tracked
// links, and the shared unsubscribe footer. Pure string building — no I/O.

import type { OutreachTouch } from './outreachSequences';
import { renderTemplate } from './outreachSequences';
import { unsubscribeFooter } from './outreachGuard';

const BASE = 'https://rankall.io';

export interface TouchTarget {
  email: string;
  business_name?: string | null;
  owner_name?: string | null;
  city?: string | null;
  industry?: string | null;
  rankall_score?: number | null;
  competitor_name?: string | null;
  scan_id?: string | null;
  video_url?: string | null;
  report_url?: string | null;
}

// A stored report_url is only trusted if it points at the prospect's own
// public report page. Legacy outreach_targets rows hold ?q= search URLs,
// and the old code fell back to the homepage — neither is a report URL
// and neither may be mailed as one (outreach fix #1).
export function isPublicReportUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'rankall.io' || u.hostname === 'www.rankall.io') &&
      /^\/r\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

// Every outbound link is wrapped so clicks are recorded (token = sequence log id).
function trackedLink(logId: string, url: string, label: string, style: string): string {
  const tracked = `${BASE}/api/outreach/track?token=${encodeURIComponent(logId)}&event=click&redirect=${encodeURIComponent(url)}`;
  return `<a href="${tracked}" style="${style}">${label}</a>`;
}

// Email-safe audio-player thumbnail (inline styles, table-free enough for
// most clients) linking to the personalised audio walkthrough.
function audioThumbnail(logId: string, videoUrl: string): string {
  const tracked = `${BASE}/api/outreach/track?token=${encodeURIComponent(logId)}&event=click&redirect=${encodeURIComponent(videoUrl)}`;
  return `
  <div style="margin:22px 0">
    <a href="${tracked}" style="text-decoration:none;color:#ffffff;display:block">
      <div style="background:#0f172a;border-radius:14px;padding:44px 20px;text-align:center;position:relative">
        <div style="width:64px;height:64px;line-height:64px;margin:0 auto 14px;border-radius:50%;background:#7c3aed;font-size:26px">▶</div>
        <div style="font-size:15px;font-weight:700;color:#ffffff">Listen to Your 1-Minute Audio Walkthrough</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px">Personalised for your business · 1 min</div>
      </div>
    </a>
  </div>`;
}

export function buildTouchEmail(
  touch: OutreachTouch,
  target: TouchTarget,
  logId: string,
): { subject: string; html: string } {
  // Outreach fix #1: the report URL comes pre-resolved (cron checks the
  // scan's public-share eligibility). A legacy ?q= URL or the homepage
  // fallback is NOT a report URL — never mail it as one.
  const videoUrl = target.video_url || (target.scan_id ? `${BASE}/video/${target.scan_id}` : BASE);
  const reportUrl = isPublicReportUrl(target.report_url) ? target.report_url : null;
  const vars: Record<string, string | number> = {
    business_name: target.business_name || 'your business',
    owner_name: target.owner_name || 'there',
    city: target.city || 'your area',
    industry: target.industry || 'your category',
    score: target.rankall_score ?? 0,
    competitor: target.competitor_name || 'a competitor',
    video_url: videoUrl,
    report_url: reportUrl ?? '',
  };

  const subject = renderTemplate(touch.subject, vars);
  const bodyText = renderTemplate(touch.body, vars);
  const bodyHtml = bodyText
    .split('\n\n')
    .map(p => `<p style="font-size:15px;color:#1f2937;line-height:1.7;margin:0 0 14px">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  // Day 1 leads with the audio thumbnail; later touches use a plain CTA
  // link. When there is no eligible report URL there is no CTA link —
  // the cron never sends a {{report_url}} touch without one, so this is
  // defensive only. Never link the homepage as if it were the report.
  const cta = touch.day === 1
    ? audioThumbnail(logId, videoUrl)
    : reportUrl
      ? `<p style="margin:18px 0">${trackedLink(logId, reportUrl, 'View your free AI report →', 'display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none')}</p>`
      : '';

  // Open pixel (token = sequence log id).
  const pixel = `<img src="${BASE}/api/outreach/track?token=${encodeURIComponent(logId)}&event=open" width="1" height="1" style="display:none" alt=""/>`;

  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px 4px">
    ${bodyHtml}
    ${cta}
    ${unsubscribeFooter(target.email)}
    ${pixel}
  </div>`;

  return { subject, html };
}
