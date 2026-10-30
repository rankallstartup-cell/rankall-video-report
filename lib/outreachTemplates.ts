// azxh residual: the agency outreach email quoted a stale price
// while the founder-set Agency price is $259/month. The price now
// reads from lib/publicStats.ts (the single source of truth) so it
// cannot drift again when pricing changes.
import { FOUNDER_PRICING_USD } from './publicStats';
import { impactRangeForFix } from './fixIntelligence';

const AGENCY_PRICE = FOUNDER_PRICING_USD.find((t) => t.name === 'Agency')?.monthly ?? 259;
// Knowledge Panel impact range from the fix metadata (the queue's estimate).
const KP_RANGE = impactRangeForFix('knowledge_panel');

export interface EmailTemplate {
  subject: string;
  greeting: string;
  bodyIntro: string;
  trustSignalNote: string;
  ctaText: string;
  signoff: string;
  tone: 'formal' | 'casual' | 'professional';
}

export function getEmailTemplate(
  countryCode: string,
  opts: {
    ownerName?: string;
    businessName: string;
    industry?: string;
    city?: string;
    score?: number;
    competitorName?: string;
    scanUrl: string;
    trustSources?: string[];
    kpMissing?: boolean;
    /** Signed per-recipient link (server: lib/outreachGuard
     *  generateUnsubscribeToken → /unsubscribe?email=…&token=…). A bare
     *  /unsubscribe link cannot unsubscribe anyone (/api/unsubscribe
     *  requires the token). */
    unsubscribeUrl: string;
  }
): { subject: string; html: string; text: string } {
  const { ownerName, businessName, industry, city, score, competitorName, scanUrl, trustSources, kpMissing } = opts;
  const name = ownerName || businessName;
  const comp = competitorName || 'a competitor';
  const scoreStr = score !== undefined ? `${score}/100` : 'below average';
  const trust1 = trustSources?.[0] || 'Google Business';
  const trust2 = trustSources?.[1] || 'Trustpilot';

  const templates: Record<string, { subject: string; body: string }> = {
    GB: {
      subject: `I scanned ${businessName} — your AI score: ${scoreStr}`,
      body: `Dear ${name},\n\nI ran ${businessName} through Rankall and wanted to share what I found.\n\nWhen patients search for ${industry || 'businesses like yours'} in ${city || 'your area'} on ChatGPT and Gemini, ${comp} is being recommended. ${businessName} scored ${scoreStr}.\n\nYour ${trust1} profile and ${trust2} presence are key factors AI platforms check.\n\nView your full report: ${scanUrl}\n\nFix #1 takes 20 minutes and is completely free.\n\nKind regards,\nNandish\nRankall.io`,
    },
    AU: {
      subject: `Ran your biz through AI — here's what I found`,
      body: `Hey ${name},\n\nRan ${businessName} through Rankall — thought you'd want to see this.\n\nChatGPT's sending people to ${comp} instead of you. Your score: ${scoreStr}.\n\nYour ${trust1} and ${trust2} listings are what AI platforms look at first.\n\nFull breakdown here: ${scanUrl}\n\nFix #1 is free and takes 15 mins.\n\nCheers,\nNandish\nRankall.io`,
    },
    IN: {
      subject: `AI scan of ${businessName} — score: ${scoreStr}`,
      body: `Dear Dr./Mr./Ms. ${name},\n\nI recently analysed ${businessName} on Rankall, an AI recommendation intelligence platform.\n\nCurrent findings:\n• AI Visibility Score: ${scoreStr}\n• ${comp} is currently ahead on key AI platforms\n• ${trust1} profile status needs attention\n• ${trust2} listing: review required\n\nYour full report: ${scanUrl}\n\nFix #1 is complimentary and takes 15 minutes.\n\nWith regards,\nNandish\nRankall.io`,
    },
    CA: {
      subject: `ChatGPT recommended ${comp} — not ${businessName}`,
      body: `Hi ${name},\n\nI scanned ${businessName} on Rankall.\n\nWhen someone searches for ${industry || 'your type of business'} in ${city || 'your area'} on ChatGPT, they're being sent to ${comp}. Your score: ${scoreStr}.\n\nYour ${trust1} and ${trust2} profiles are what Canadian AI platforms check most.\n\nSee your full report: ${scanUrl}\n\nFix #1 is free.\n\nBest,\nNandish\nRankall.io`,
    },
    AE: {
      subject: `AI Visibility Report — ${businessName} Dubai`,
      body: `Dear ${name},\n\nI have completed an AI visibility analysis for ${businessName} using Rankall.\n\nKey findings:\n• AI Score: ${scoreStr}\n• ${comp} currently appears more prominently on AI platforms\n• Your Google Maps listing (Arabic/English) status: needs optimisation\n• Trade license visibility: recommended for AI trust signals\n\nFull report: ${scanUrl}\n\nThe first optimisation is provided at no cost.\n\nRespectfully,\nNandish\nRankall.io`,
    },
    IE: {
      subject: `I scanned ${businessName} — ChatGPT score: ${scoreStr}`,
      body: `Hi ${name},\n\nRan ${businessName} through Rankall — worth sharing.\n\nWhen people search for ${industry || 'your type of business'} in ${city || 'Ireland'} on ChatGPT, ${comp} keeps coming up. Your score: ${scoreStr}.\n\nYour ${trust1} and ${trust2} presence are what Irish AI searches look at.\n\nFull report: ${scanUrl}\n\nFirst fix is free.\n\nCheers,\nNandish\nRankall.io`,
    },
  };

  const template = templates[countryCode] || {
    subject: `ChatGPT recommended ${comp} — not ${businessName}`,
    body: `Hi ${name},\n\nI scanned ${businessName} on Rankall.\n\nYour AI score: ${scoreStr}. ${comp} is being recommended instead of you on key AI platforms.\n\nSee your full report: ${scanUrl}\n\nFix #1 is free and takes 15 minutes.\n\nBest,\nNandish\nRankall.io`,
  };

  const kpSection = kpMissing ? `
<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px">
  <p style="margin:0;font-size:14px;color:#dc2626;font-weight:600">⚠️ No Google Knowledge Panel detected</p>
  <p style="margin:6px 0 0;font-size:13px;color:#374151">Google and AI platforms don't have a verified entity record for your business. This is often the root cause of low AI visibility. Fix #1 addresses this.</p>
</div>` : '';

  const html = `<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0F172A;">
${template.body.split('\n').map(line => line.trim() ? `<p style="margin:8px 0;line-height:1.6;">${line}</p>` : '<br/>').join('\n')}
${kpSection}
<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
<p style="font-size:12px;color:#94A3B8;">Rankall.io — AI Recommendation Intelligence | <a href="${opts.unsubscribeUrl}" style="color:#94A3B8;">Unsubscribe</a></p>
</body></html>`;

  return { subject: template.subject, html, text: template.body };
}

export const PERSONAL_PRO_OUTREACH = {
  touch1: {
    delay: 0,
    subject: "I searched for {{title}} {{owner_name}} on ChatGPT — here's what I found",
    body: `{{title}} {{owner_name}},

I ran your name through 12 AI platforms this morning.

Here's what I found:
• ChatGPT: {{chatgpt_result}}
• Gemini: {{gemini_result}}
• Perplexity: {{perplexity_result}}

Your AI Name Recognition Score: {{score}}/100

Your colleague {{peer_name}} scores {{peer_score}}/100 and appears on {{peer_advantage}} more platforms.

▶ Listen to your 1-minute audio walkthrough: {{video_url}}

Fix #1 — Google Knowledge Panel — is free. Takes about 2 hours of setup (estimated impact +${KP_RANGE.min}–${KP_RANGE.max} points; not guaranteed).

— Nandish, Rankall.io`,
  },
  touch2: {
    delay: 3,
    subject: 'Your Google Knowledge Panel is {{kp_status}}, {{title}} {{owner_name}}',
    body: `{{title}} {{owner_name}},

Following up on the AI visibility report I sent.

One thing stood out: your Google Knowledge Panel is {{kp_status}}.

It is one of the signals AI platforms use to identify professionals by name.

Without it, AI platforms struggle to verify who you are — even if your reviews and credentials are excellent.

Your free report shows exactly how to fix this: {{report_url}}

— Nandish`,
  },
  touch3: {
    delay: 7,
    subject: '2-min audio: {{title}} {{owner_name}} vs peers on AI',
    body: `{{title}} {{owner_name}},

I recorded a short audio walkthrough specifically for you.

It shows your real AI Name Recognition Score, where your peers in {{specialty}} are winning, and your top fix.

▶ Listen: {{video_url}}

This is real data from a live scan of your name across 12 AI platforms.

— Nandish, Rankall.io`,
  },
};

export type PersonalProTouch = keyof typeof PERSONAL_PRO_OUTREACH;

export function renderPersonalTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export const AGENCY_EMAIL_TEMPLATE = {
  subject: 'Offer AI visibility reports to your clients',
  body: `Hi {{agency_contact_name}},

Quick question: Are any of your clients asking about AI search visibility yet?

Customers increasingly ask ChatGPT, Gemini, and Perplexity for recommendations, and many local businesses — dentists, lawyers, HVAC companies, restaurants — don't appear in those answers.

I built Rankall — an AI visibility platform built specifically for agencies like yours.

Here's the model:
- You set your own price for AI visibility management
- Your Rankall cost: $${AGENCY_PRICE}/month for unlimited client accounts
- A new service line you weren't offering before

We generate the proposals, run the scans, create the white-label reports. You deliver the results and keep the billing relationship.

{{prospect_scan_note}}

Worth 15 minutes?
{{cta_url}}

{{signature}}`,
  signature: `Nandish
Rankall.io — AI Visibility for Agencies`,
  linkedin_connect: `Hi {{name}}, I work with marketing agencies adding AI visibility to their service line. Built something relevant — would value your perspective.`,
  linkedin_followup: `Thanks for connecting! Quick share: Rankall lets agencies add an AI visibility service line with white-label reports. Happy to show you a live demo for one of your clients.`,
};

export function renderAgencyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function buildSimulatorEmailBlock(opts: {
  score: number; projected: number; revenueRecovered: number; revenueSymbol: string; reportUrl: string;
}): string {
  return `📊 Your Projected Improvement:
Current score: ${opts.score}/100
After implementing fixes: ${opts.projected}/100
Revenue you could recover: ${opts.revenueSymbol}${opts.revenueRecovered}/mo
Time to see results: 8-10 weeks

See your full roadmap: ${opts.reportUrl}`;
}

export const PRODUCT_TOUR_LINE = 'See the full product tour: rankall.io/demo';

export const SIMULATOR_FOLLOWUP_TOUCH2 = {
  subject: 'Your projected score after 8 weeks: {{projected}}/100',
  body: `Hi {{name}},

When we scanned {{business}} last week your AI visibility was {{score}}/100.

If you implement the 3 free fixes in your report, here's what our data shows:

Week 2: {{score_w2}}/100
Week 4: {{score_w4}}/100
Week 8: {{projected}}/100

{{revenue_symbol}}{{recovery}}/month recovered.

{{similar_count}} similar {{industry}} businesses have gone through this exact process. Average improvement: 24 points.

Your roadmap is waiting:
{{report_url}}

Nandish`,
};
