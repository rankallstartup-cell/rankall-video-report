// lib/weeklyReportEmail.ts
// Weekly AI Visibility Report — email HTML. Works for all plan/entity types.

import type { WeeklyReportData } from './weeklyReport';

export function buildWeeklyReportHTML(data: WeeklyReportData): string {
  const scoreColor = data.currentScore >= 70 ? '#22c55e' : data.currentScore >= 40 ? '#f59e0b' : '#ef4444';

  const scoreChangeText =
    data.scoreChange > 0 ? `▲ +${data.scoreChange} from last week`
    : data.scoreChange < 0 ? `▼ ${data.scoreChange} from last week`
    : '→ No change from last week';
  const scoreChangeColor = data.scoreChange > 0 ? '#22c55e' : data.scoreChange < 0 ? '#ef4444' : '#9ca3af';

  const entityHeadline =
    data.entityType === 'personal' ? 'Personal Brand AI Visibility'
    : data.entityType === 'agency' ? 'Agency AI Visibility Summary'
    : data.entityType === 'enterprise' ? 'AI Visibility Summary'
    : 'Business AI Visibility';

  const platformText = `${data.mentionedCount} of ${data.totalPlatforms} AI platforms are recommending you`;

  // Competitor block — not shown for personal brand (name-recognition
  // track), and NOT shown when no competitor score was ever measured.
  // ax6u: the old code rendered "<competitor> scores 0/100" whenever a
  // competitor name existed, because missing data arrived as 0. A missing
  // score now arrives as null and hides the line entirely.
  const competitorSection = data.competitorName && data.entityType !== 'personal' && data.competitorScore != null
    ? `<tr><td style="padding:16px 0;border-bottom:1px solid #1e2a3a;">
         <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Top Competitor</p>
         <p style="color:#ef4444;font-size:16px;font-weight:600;margin:0;">${data.competitorName} scores ${data.competitorScore}/100</p>
         ${data.revenueGap > 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0 0;">Estimated gap: ${data.currencySymbol}${data.revenueGap.toLocaleString()}/month</p>` : ''}
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Weekly AI Visibility Report</title>
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a1a;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:32px;text-align:center;">
          <h1 style="color:#7c3aed;font-size:24px;font-weight:900;margin:0 0 4px;letter-spacing:-0.5px;">rankall</h1>
          <p style="color:#6b7280;font-size:13px;margin:0;">Week of ${data.weekOf}</p>
        </td></tr>
        <tr><td style="background:#0f1629;border-radius:16px;padding:32px;">
          <p style="color:#9ca3af;font-size:15px;margin:0 0 24px;">Hi ${data.userName}, here's your weekly ${entityHeadline} summary.</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:24px;background:#1a1a2e;border-radius:12px;text-align:center;">
              <p style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">AI Visibility Score</p>
              <p style="color:${scoreColor};font-size:64px;font-weight:900;margin:0;line-height:1;">${data.currentScore}</p>
              <p style="color:#6b7280;font-size:13px;margin:4px 0 0;">/100</p>
              <p style="color:${scoreChangeColor};font-size:14px;font-weight:600;margin:12px 0 0;">${scoreChangeText}</p>
            </td></tr>
            <tr><td style="padding-top:16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:16px 0;border-bottom:1px solid #1e2a3a;">
                  <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Platform Coverage</p>
                  <p style="color:#ffffff;font-size:16px;font-weight:600;margin:0;">${platformText}</p>
                </td></tr>
                ${competitorSection}
                <tr><td style="padding:16px 0;">
                  <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Top Opportunity This Week</p>
                  <p style="color:#7c3aed;font-size:15px;font-weight:600;margin:0;">${data.topFixTitle}</p>
                  ${data.topFixImpact != null ? `<p style="color:#22c55e;font-size:13px;margin:4px 0 0;">Est. +${data.topFixImpact} points</p>` : ''}
                </td></tr>
                ${data.ga4Data ? `
                <tr><td style="padding:16px 0;border-top:1px solid #1e2a3a;">
                  <p style="color:#9ca3af;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">📊 Website Traffic · Last 30 Days</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="text-align:center;padding:8px;">
                        <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">${data.ga4Data.sessions.toLocaleString()}</p>
                        <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">Sessions</p>
                      </td>
                      <td style="text-align:center;padding:8px;">
                        <p style="color:#ffffff;font-size:24px;font-weight:700;margin:0;">${data.ga4Data.newUsers.toLocaleString()}</p>
                        <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">New Visitors</p>
                      </td>
                      <td style="text-align:center;padding:8px;">
                        <p style="color:${data.ga4Data.trend === 'up' ? '#22c55e' : data.ga4Data.trend === 'down' ? '#ef4444' : '#9ca3af'};font-size:24px;font-weight:700;margin:0;">${data.ga4Data.trend === 'up' ? '▲' : data.ga4Data.trend === 'down' ? '▼' : '→'} ${Math.abs(data.ga4Data.percentChange)}%</p>
                        <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">vs Last Period</p>
                      </td>
                    </tr>
                  </table>
                  ${data.ga4Data.propertyName ? `<p style="color:#6b7280;font-size:11px;margin:8px 0 0;">${data.ga4Data.propertyName}</p>` : ''}
                </td></tr>` : ''}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 0;text-align:center;">
          <a href="${data.reportUrl}" style="background:#7c3aed;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">View Your Full Report →</a>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #1e2a3a;text-align:center;">
          <p style="color:#4b5563;font-size:12px;margin:0 0 8px;">You're receiving this because you have a Rankall account.</p>
          <a href="https://www.rankall.io/settings" style="color:#6b7280;font-size:12px;">Manage email preferences</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
