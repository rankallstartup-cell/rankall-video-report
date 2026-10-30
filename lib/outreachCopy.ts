// lib/outreachCopy.ts
// Item 4: outreach copy (audio script, WhatsApp, LinkedIn) built from MEASURED
// facts only. Pure, no I/O, so every branch is unit-tested. Rules:
//  - a number is printed only when the caller supplied a real number;
//  - a competitor is named only when the scan recorded one, and "outranking"
//    is claimed only when both scores were measured and theirs is higher;
//  - no platform names, platform counts or outcomes are invented.

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ── Audio script (/api/generate-video-email) ───────────────────────────────
export function buildVideoScript(input: {
  businessName: string;
  recipientName?: unknown;
  score?: unknown;
  mentionedCount?: unknown;
  totalPlatforms?: unknown;
  competitorName?: unknown;
  topFix?: unknown;
}): string {
  const biz = input.businessName;
  const recipient = str(input.recipientName);
  const name = recipient ? `, ${recipient}` : '';
  const competitor = str(input.competitorName);
  const topFix = str(input.topFix);
  const total = isNum(input.totalPlatforms) && input.totalPlatforms > 0 ? input.totalPlatforms : null;
  const mentioned = isNum(input.mentionedCount) && total != null
    ? Math.max(0, Math.min(total, Math.round(input.mentionedCount)))
    : null;

  const facts: string[] = [];
  if (mentioned != null && total != null) {
    facts.push(`Right now, ${biz} is recommended on ${mentioned} out of the ${total} AI platforms we checked.`);
  }
  if (isNum(input.score)) {
    facts.push(`Its AI visibility score is ${Math.round(input.score)} out of 100.`);
  }
  if (competitor) {
    facts.push(`When we asked about your category, AI platforms named ${competitor}.`);
  }

  const fixLine = topFix
    ? `The good news? Your top fix is: ${topFix}. The full report shows exactly how to do it.`
    : `The good news? The full report lists the fixes, starting with the one most likely to help.`;

  return `Hey${name}! I just ran a quick AI visibility scan for ${biz}, and here's what I found.

${facts.join(' ')}

${fixLine}

I put together a full report with step-by-step instructions. Check it out at rankall.io — it's completely free to see your full breakdown.

Let me know if you want me to walk you through it.`;
}

// ── WhatsApp (/api/outreach/send-whatsapp) ─────────────────────────────────
export interface WhatsAppInput {
  firstName?: string;
  businessName: string;
  industry?: string;
  city?: string;
  competitorName?: string | null;
  competitorScore?: unknown;
  reportUrl: string;
  countryCode?: string;
  language?: string;
  score?: unknown;
  kpMissing?: boolean;
}

export function buildWhatsAppMessage(opts: WhatsAppInput): string {
  const { firstName, businessName, industry, city, reportUrl, countryCode, language, kpMissing } = opts;
  const name = firstName || businessName;
  const score = isNum(opts.score) ? Math.round(opts.score) : null;
  const comp = str(opts.competitorName);
  const compScore = isNum(opts.competitorScore) ? Math.round(opts.competitorScore) : null;
  // Only a MEASURED lead is described as one.
  const compAhead = comp != null && score != null && compScore != null && compScore > score;

  if (countryCode === 'IN' || language === 'hi_en') {
    const kpLine = kpMissing
      ? `\nAur ek baat — Google aapka business verify nahi kar paya.`
      : '';
    const scoreLine = score != null ? `\nAI Score: ${score}/100` : '';
    const compLine = compAhead ? `\n${comp} aapse aage hai AI platforms par (${compScore}/100).` : '';
    return `Namaste ${name} ji 🙏\n\nMaine aapka ${industry || 'business'} scan kiya.\n${scoreLine}${compLine}${kpLine}\n\nAapki free report:\n${reportUrl}\n\nFix #1 bilkul free hai.\n\n— Rankall.io`;
  }
  if (countryCode === 'PH' || language === 'fil_en') {
    const scoreLine = score != null ? `\nAI Score: ${score}/100` : '';
    const compLine = compAhead ? `\n${comp} ay nangunguna sa mga AI platform (${compScore}/100).` : '';
    return `Hello ${name}! 👋\n\nNi-scan namin ang inyong ${industry || 'business'}.\n${scoreLine}${compLine}\n\nLibreng report dito:\n${reportUrl}\n\nAng Fix #1 ay libre.\n\n— Rankall.io`;
  }
  if (countryCode === 'AE') {
    const scoreLine = score != null ? `\nYour AI Score: ${score}/100` : '';
    const compLine = compAhead ? `\n${comp} currently scores higher across AI platforms (${compScore}/100).` : '';
    return `Dear ${name},\n\nWe have completed an AI visibility scan for your ${industry || 'business'} in ${city || 'the UAE'}.\n${scoreLine}${compLine}\n\nView your complimentary report:\n${reportUrl}\n\nYour first recommended fix is provided at no cost.\n\nWith regards,\nRankall.io`;
  }
  const scoreLine = score != null ? `\nYour Share of Recommendation score: ${score}/100` : '';
  if (countryCode === 'GB') {
    const compLine = compAhead ? `\n${comp} is currently ahead of you (${compScore}/100).` : '';
    return `Hi ${name},\n\nWe've scanned your ${industry || 'business'} for AI visibility across 12 platforms.\n${scoreLine}${compLine}\n\nYour free report:\n${reportUrl}\n\nFix #1 is included free of charge.\n\nBest regards,\nRankall.io`;
  }
  const compLine = compAhead ? `\n${comp} is currently outranking you (${compScore}/100).` : '';
  return `Hi ${name}! 👋\n\nWe scanned your ${industry || 'business'} across 12 AI platforms.\n${scoreLine}${compLine}\n\nYour free report:\n${reportUrl}\n\nFix #1 is completely free.\n\n— Rankall.io`;
}

// outreach_log.score: the measured score, never a default 0 (and never the
// appeared count, which is a different number).
export function whatsappLogScore(score: unknown): number | null {
  return isNum(score) ? Math.round(score) : null;
}

// ── LinkedIn (/api/outreach/linkedin-message) ──────────────────────────────
export interface LinkedInFacts {
  ownerName: string;
  businessName: string;
  industry: string | null;
  city: string | null;
  score: number | null;
  competitor: string | null;
  reportUrl: string | null;
  linkedinUrl: string | null;
  scanId: string | null;
}

export function parseLinkedInInput(body: unknown): { ok: true; facts: LinkedInFacts } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ownerName = str(b.owner_name);
  const businessName = str(b.business_name);
  if (!ownerName || !businessName) return { ok: false, error: 'owner_name and business_name required' };
  const reportUrl = str(b.report_url);
  const linkedinUrl = str(b.linkedin_url);
  const scoreNum = typeof b.score === 'string' && b.score.trim() !== '' ? Number(b.score) : b.score;
  return {
    ok: true,
    facts: {
      ownerName,
      businessName,
      industry: str(b.industry),
      city: str(b.city),
      score: isNum(scoreNum) && scoreNum >= 0 && scoreNum <= 100 ? Math.round(scoreNum) : null,
      competitor: str(b.competitor),
      reportUrl: reportUrl && /^https?:\/\//i.test(reportUrl) ? reportUrl : null,
      linkedinUrl: linkedinUrl && /^https?:\/\//i.test(linkedinUrl) ? linkedinUrl : null,
      scanId: str(b.scan_id),
    },
  };
}

export function buildLinkedInPrompt(f: LinkedInFacts): string {
  const ctx = [
    `- Business: ${f.businessName}`,
    f.industry ? `- Industry: ${f.industry}` : null,
    f.city ? `- City: ${f.city}` : null,
    f.score != null ? `- AI Score: ${f.score}/100` : null,
    f.competitor ? `- A competitor AI platforms named for this category: ${f.competitor}` : null,
    f.reportUrl ? `- Report URL: ${f.reportUrl}` : null,
  ].filter(Boolean).join('\n');
  const followup = [
    f.competitor ? `Mention that AI platforms named ${f.competitor} when asked about this category.` : null,
    f.score != null ? `You may mention the AI score of ${f.score}/100.` : null,
    f.reportUrl ? 'Share the report URL.' : 'Offer to share their free AI visibility report.',
  ].filter(Boolean).join(' ');
  return `Generate two LinkedIn messages for outreach to ${f.ownerName} at ${f.businessName}.

Context (use ONLY these facts — do not invent numbers, platform names, competitors or outcomes):
${ctx}

Generate:
1. CONNECTION REQUEST (max 300 characters): Personalized to their ${f.industry ? 'specialty' : 'business'}${f.city ? ' and city' : ''}. Mention you've been researching ${f.industry || 'local'} businesses${f.city ? ` in ${f.city}` : ''}.

2. FOLLOW-UP MESSAGE (after they connect): ${followup}

Return as JSON with keys "connection_message" and "followup_message". Return only valid JSON.`;
}

export function linkedInFallbackFollowup(f: LinkedInFacts): string {
  const parts = [`Hi ${f.ownerName},`];
  if (f.competitor) parts.push(`when we asked AI platforms about your category, they named ${f.competitor}.`);
  else parts.push(`I ran an AI visibility check for ${f.businessName}.`);
  parts.push(f.reportUrl ? `Here's your free AI visibility report: ${f.reportUrl}` : `Happy to share the free report if useful.`);
  return parts.join(' ');
}
