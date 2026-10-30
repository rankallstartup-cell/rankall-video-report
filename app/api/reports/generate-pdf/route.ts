import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { revenueGapForScan } from '@/lib/scoring';
import { getCountryConfig, getAvgCustomerValue, getRevenueSymbol } from '@/lib/countryConfig';
import { createClient } from '@supabase/supabase-js';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { TRIAL_EXPORT_BLOCKED_MESSAGE } from '@/lib/trialCaps';
import { escapeHtml } from '@/lib/escapeHtml';
import { canAccessScan } from '@/lib/apiAuth';
import { brandingEntitled, reportExportDecision, type PlanFacts } from '@/lib/reportEntitlements';
import { projectScore, gradeLabel } from '@/lib/projection';
import { canonicalFixImpact } from '@/lib/fixIntelligence';
import { isPlaceholderCompetitor } from '@/lib/dataQuality';

const ACCENT = '#7c3aed';
// White-label PDFs must carry no Rankall colour: when the agency has not set
// a brand colour, fall back to neutral slate (and neutral tints below).
const NEUTRAL_ACCENT = '#334155';

const ALL_PLATFORMS = [
  'ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot',
  'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI', 'Meta AI',
];

// Rankall grade bands — the ONE table in lib/projection (gradeLabel).
const GRADE_TONES: Record<string, { tone: string; bg: string }> = {
  Dominant: { tone: '#16A34A', bg: '#DCFCE7' }, Strong: { tone: '#059669', bg: '#D1FAE5' },
  Visible: { tone: '#2563EB', bg: '#DBEAFE' }, Emerging: { tone: '#D97706', bg: '#FEF3C7' },
  'Not Visible': { tone: '#DC2626', bg: '#FEE2E2' },
};
function getGrade(score: number) {
  const label = gradeLabel(score);
  return { grade: label, label, ...(GRADE_TONES[label] ?? GRADE_TONES['Not Visible']) };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Every interpolated string goes through escapeHtml (also escapes ' and `).
const esc = escapeHtml;

function generateHtml(params: {
  scan: Record<string, unknown>;
  agencySettings: Record<string, unknown> | null;
  platformMap: Record<string, boolean | null>;
  // b8b5: platforms that actually answered (non-empty response_text).
  // The revenue model divides by RESPONDED platforms — the old code
  // passed ALL_PLATFORMS.length (then 11), so a scan with 9 mentions out of
  // 10 responses showed the PDF gap for 2/11 ($1,745) while the report
  // page showed 1/10 ($960).
  respondedCount: number;
  clientName: string;
  city: string;
  accentColor: string;
}) {
  const { scan, agencySettings, platformMap, respondedCount, clientName, city, accentColor } = params;
  // clientName is scan.input — user-controlled (any anonymous scan). It was
  // interpolated raw into this same-origin text/html response (stored XSS).
  // `clientHtml` is for HTML; the raw value is only used inside strings that
  // are escaped at render (fix descriptions).
  const clientHtml = esc(clientName);
  const score = Math.round((scan.overall_score ?? scan.score ?? 0) as number);
  const { grade, label, tone, bg } = getGrade(score);

  const whiteLabel = !!agencySettings?.white_label_enabled;
  // a8wr: in white-label mode, NEVER fall back to Rankall's name/email.
  // A white-label agency that hasn't set a name/email yet must see blank
  // fields — not Rankall branding inside a "white-label" PDF. (The settings
  // page auto-enables white-label when a logo is uploaded, so the
  // name/email-missing case is real, not theoretical.)
  const agencyName  = (agencySettings?.agency_name as string) || (whiteLabel ? '' : 'Rankall.io');
  const agencyEmail = (agencySettings?.agency_email as string) || (whiteLabel ? '' : 'hello@rankall.io');
  const rawLogo     = (agencySettings?.agency_logo_url as string | null) || null;
  // Only http(s) logo URLs (no javascript:/data: tricks); escaped on render.
  const logoUrl     = rawLogo && /^https?:\/\//i.test(rawLogo.trim()) ? rawLogo.trim() : null;
  const date        = fmtDate(new Date());
  const poweredBy   = whiteLabel ? '' : 'Powered by Rankall.io';
  // Rankall's purple tints only when NOT white-label.
  const tintBg     = whiteLabel ? '#F8FAFC' : '#F5F3FF';
  const tintBorder = whiteLabel ? '#E2E8F0' : '#DDD6FE';

  // b8b5: a placeholder competitor ("If you meant a different service")
  // is not a business — never present it as the capturing competitor.
  const rawCompetitor = (scan.competitor_name as string) || '';
  const competitor = isPlaceholderCompetitor(rawCompetitor) ? '' : rawCompetitor;
  const mentionedCount = ALL_PLATFORMS.filter(p => platformMap[p] === true).length;
  const missingCount   = ALL_PLATFORMS.length - mentionedCount;


  // Top 3 fixes — derive from missing platforms if no explicit fixes stored
  const rawFixes = (scan.fixes || scan.top_fixes || []) as Array<Record<string, unknown>>;
  const fixes = rawFixes.length > 0
    ? rawFixes.slice(0, 3).map(f => ({
        title: (f.title || f.name || 'AI Optimisation Fix') as string,
        // ONE impact number per fix (ax81): the canonical midpoint for the
        // fix type — the same number the fix queue and report show. No
        // invented default when the type is unknown.
        impact: canonicalFixImpact((f.fix_type || f.type || f.id) as string | undefined) ?? 0,
        time: (f.time || '1–2 weeks') as string,
        cost: (f.cost || 'Low') as string,
        desc: (f.description || f.impact || '') as string,
      }))
    : [
        { title: 'Claim & Optimise Knowledge Panel', impact: canonicalFixImpact('knowledge_panel') ?? 0, time: '1–2 weeks', cost: 'Low',
          desc: `${clientName} is missing from ${missingCount} of ${ALL_PLATFORMS.length} AI platforms. Claiming and fully completing your Google/Bing knowledge panel gives AI engines an authoritative source to cite. This is the single highest-leverage fix for local AI visibility.` },
        { title: 'Structured Data & Schema Markup', impact: canonicalFixImpact('jsonld') ?? 0, time: '2–3 weeks', cost: 'Medium',
          desc: `AI models rely on machine-readable data to understand your business. Adding LocalBusiness, FAQ and Service schema makes ${clientName} easier for ChatGPT, Gemini and Perplexity to recommend with confidence.` },
        { title: 'Authority Citation Building', impact: canonicalFixImpact('citations') ?? 0, time: '4–6 weeks', cost: 'Medium',
          desc: `AI recommendations favour businesses with consistent citations across directories and review platforms. Building citations${competitor ? ` to match competitors like ${competitor}` : ''} increases the likelihood of ${clientName} appearing in AI answers.` },
    ];

  // ax80: ONE revenue model — revenueGapForScan (lib/scoring), the
  // same model the report page, landing page, and AI inbox use. The
  // old PDF formula (gap-to-70 x 180) disagreed with the report page
  // for the same scan, and the hardcoded £ billed every business in
  // GBP. The symbol comes from the scan's country, like the report page.
  const countryCode = (scan.country_code as string) || 'US';
  const revCfg = getCountryConfig(countryCode);
  const revSym = getRevenueSymbol(revCfg);
  const monthlyLoss = revenueGapForScan({
    mentionedCount,
    // b8b5: responded platforms only — the report page excludes
    // non-responders (Mistral, empty response) from the denominator.
    respondedPlatforms: respondedCount,
    avgCustomerValue: getAvgCustomerValue((scan.industry as string) ?? '', countryCode),
    monthlyAIInquiries: revCfg.monthlyAIInquiries ?? 50,
  });
  // After-fixes recovery mirrors lib/simulator.ts: recoveryRatio =
  // min(0.6, pointsGained/40) from the fix impacts (85 cap), so the
  // PDF's After Fixes agrees with the simulator instead of the old
  // flat 0.35 (65% recovery, above the simulator's 60% cap).
  const fixPoints = fixes.reduce((sum, f) => sum + (f.impact || 0), 0);
  // One projection cap for every surface (lib/projection — b02b); never
  // projects a score above the cap or below the current score.
  const pointsGained = Math.max(0, projectScore(score, fixPoints) - score);
  const recoveryRatio = Math.min(0.6, pointsGained / 40);
  const afterFixesLoss = Math.round(monthlyLoss * (1 - recoveryRatio));
  const annualRecovery = (monthlyLoss - afterFixesLoss) * 12;

  // b88a: three states, matching the web report (b8a5) — a platform
  // that returned no response is NOT "not found": null in the map
  // means no response was recorded for it in this scan.
  const platformRows = ALL_PLATFORMS.map(p => {
    const state = platformMap[p];
    const status = state === true ? 'Visible' : state === false ? 'Not mentioned' : 'No response';
    const color = state === true ? '#16A34A' : state === false ? '#DC2626' : '#64748B';
    const note = state === true
      ? 'Business appears in AI recommendations'
      : state === false
        ? 'AI responded, but did not name this business'
        : 'No response was recorded from this platform in this scan';
    return `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid #E2E8F0;font-weight:600;">${esc(p)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #E2E8F0;text-align:center;color:${color};font-weight:700;">${status}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:13px;">${note}</td>
      </tr>`;
  }).join('');

  const fixRows = fixes.map((f, i) => `
      <div style="display:flex;gap:16px;padding:18px 0;border-bottom:1px solid #E2E8F0;">
        <div style="width:34px;height:34px;border-radius:9px;background:${accentColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:15px;font-weight:900;color:#fff;">${i + 1}</span>
        </div>
        <div style="flex:1;">
          <p style="font-size:16px;font-weight:800;color:#0F172A;margin:0 0 6px;">${esc(f.title)}</p>
          <div style="display:flex;gap:18px;margin-bottom:8px;flex-wrap:wrap;">
            ${f.impact > 0 ? `<span style="font-size:12px;font-weight:700;color:${accentColor};">Est. impact: ~+${Math.round(f.impact)} pts</span>` : ''}
            <span style="font-size:12px;color:#94A3B8;">Time: ${esc(f.time)}</span>
            <span style="font-size:12px;color:#94A3B8;">Cost: ${esc(f.cost)}</span>
          </div>
          <p style="font-size:13px;color:#64748B;line-height:1.6;margin:0;">${esc(f.desc)}</p>
        </div>
      </div>`).join('');

  const roadmap = [
    { weeks: 'Week 1–2', title: 'Audit & Claim', items: ['Claim knowledge panel', 'Baseline AI scan', 'Fix critical listings'] },
    { weeks: 'Week 3–4', title: 'Foundation', items: ['Structured data markup', 'Optimise descriptions', 'Verify citations'] },
    { weeks: 'Week 5–8', title: 'Expansion', items: ['Directory submissions', 'Publish FAQ content', 'Authority building'] },
    { weeks: 'Week 9–12', title: 'Dominance', items: ['Re-scan all platforms', 'Competitor gap close', 'Updated report'] },
  ];

  // b8b5 (fix-forward): the heading had the same duplication as the
  // key finding ("rankall.io — rankall.io") when the stored location
  // equals the business name. Omit the city half in that case.
  const cityLine = city && city.trim().toLowerCase() !== clientName.trim().toLowerCase()
    ? `${clientHtml} &mdash; ${esc(city)}`
    : clientHtml;
  // b8b5: when the stored location duplicates the business name
  // ("rankall.io in rankall.io"), the "in <city>" clause is a template
  // artifact — omit it.
  const citySuffix = city && city.trim().toLowerCase() !== clientName.trim().toLowerCase() ? ` in ${esc(city)}` : '';
  const keyFinding =
    `${clientHtml}${citySuffix} currently appears on only <strong>${mentionedCount} of ${ALL_PLATFORMS.length}</strong> major AI platforms ` +
    `(Score ${score}/100, ${label}). ` +
    `${competitor ? `Competitor <strong>${esc(competitor)}</strong> is capturing AI-driven customers that should be reaching you. ` : 'Competitors with stronger AI presence are capturing customers that should be reaching you. '}` +
    `This visibility gap is costing an estimated <strong>${revSym}${monthlyLoss.toLocaleString()}/month</strong> in lost revenue.`;

  // a8wr: logo block — a broken logo URL hides itself (no broken-image
  // icon in the PDF). With no logo, white-label PDFs show no badge at
  // all (the agency name carries the header); the "R" badge is Rankall's
  // own mark, so it only renders when white-label is OFF.
  const logoBlock = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(agencyName || 'Agency logo')}" onerror="this.style.display='none'" style="max-height:48px;max-width:180px;object-fit:contain;" />`
    : whiteLabel
      ? ''
      : `<div style="width:44px;height:44px;border-radius:10px;background:${accentColor};display:flex;align-items:center;justify-content:center;"><span style="font-size:20px;font-weight:900;color:#fff;">R</span></div>`;

  const header = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid ${accentColor};">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoBlock}
        <div>
          <p style="font-size:18px;font-weight:800;color:#0F172A;">${esc(agencyName)}</p>
          ${poweredBy ? `<p style="font-size:12px;color:#94A3B8;">${poweredBy}</p>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <p style="font-size:13px;color:#64748B;">${date}</p>
        <p style="font-size:12px;color:#94A3B8;">Confidential</p>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Visibility Report — ${esc(clientName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #fff; color: #0F172A; }
    .page { max-width: 860px; margin: 0 auto; padding: 44px 40px; min-height: 100vh; }
    .section-title { font-size: 22px; font-weight: 800; color: #0F172A; border-left: 4px solid ${accentColor}; padding-left: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 14px; background: #F1F5F9; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748B; }
    /* margin:0 removes the page-margin box where browsers print their own
       header/footer (URL, date, title) — so the rankall.io URL does not
       appear on a white-label PDF. Spacing comes from .page padding instead.
       Some browsers still print headers if the user re-enables them in the
       print dialog ("Headers and footers"). */
    @page { size: A4; margin: 0; }
    @media print {
      html, body { margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page { padding: 18mm 16mm; min-height: auto; max-width: none; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>

<!-- ===================== PAGE 1: Executive Summary ===================== -->
<div class="page page-break">
  ${header}
  <div style="text-align:center;margin-bottom:36px;">
    <h1 style="font-size:34px;font-weight:900;color:#0F172A;margin-bottom:10px;">AI Visibility Report</h1>
    <p style="font-size:17px;color:#0F172A;margin-bottom:4px;"><strong>${cityLine}</strong></p>
    <p style="font-size:13px;color:#94A3B8;">${agencyName ? `Prepared by ${esc(agencyName)} &nbsp;·&nbsp; ` : ''}${date}</p>
  </div>

  <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:16px;padding:36px;text-align:center;margin-bottom:28px;">
    <p style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;">AI Visibility Score</p>
    <div style="display:flex;align-items:center;justify-content:center;gap:20px;">
      <span style="font-size:84px;font-weight:900;color:${accentColor};line-height:1;">${score}</span>
      <span style="font-size:26px;color:#94A3B8;padding-bottom:12px;">/100</span>
      <div style="background:${bg};border-radius:12px;padding:12px 24px;">
        <span style="font-size:26px;font-weight:900;color:${tone};">${grade}</span>
      </div>
    </div>
    <p style="font-size:15px;font-weight:600;color:#64748B;margin-top:14px;">Grade: ${label}</p>
  </div>

  <div style="background:${tintBg};border:1.5px solid ${tintBorder};border-radius:12px;padding:24px;">
    <p style="font-size:13px;font-weight:700;color:${accentColor};margin-bottom:8px;">Key Finding</p>
    <p style="font-size:15px;color:#0F172A;line-height:1.7;">${keyFinding}</p>
  </div>
</div>

<!-- ===================== PAGE 2: Platform Breakdown ===================== -->
<div class="page page-break">
  ${header}
  <div class="section-title">Platform Breakdown</div>
  <p style="font-size:14px;color:#64748B;margin-bottom:20px;">Visibility across all 12 major AI platforms. Currently visible on ${mentionedCount} of ${ALL_PLATFORMS.length}.</p>
  <table>
    <thead><tr><th>Platform</th><th style="text-align:center;">Status</th><th>Notes</th></tr></thead>
    <tbody>${platformRows}</tbody>
  </table>
</div>

<!-- ===================== PAGE 3: Top 3 Fixes ===================== -->
<div class="page page-break">
  ${header}
  <div class="section-title">Top 3 Recommended Fixes</div>
  <p style="font-size:14px;color:#64748B;margin-bottom:8px;">Prioritised by impact-to-effort ratio.</p>
  ${fixRows}
</div>

<!-- ===================== PAGE 4: Revenue Impact ===================== -->
<div class="page page-break">
  ${header}
  <div class="section-title">Revenue Impact Analysis</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:32px;">
    <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:12px;padding:22px;text-align:center;">
      <p style="font-size:11px;font-weight:700;color:#B91C1C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Current Monthly Loss</p>
      <p style="font-size:32px;font-weight:900;color:#DC2626;">${revSym}${monthlyLoss.toLocaleString()}</p>
    </div>
    <div style="background:#FFF7ED;border:1.5px solid #FED7AA;border-radius:12px;padding:22px;text-align:center;">
      <p style="font-size:11px;font-weight:700;color:#C2410C;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">After Fixes</p>
      <p style="font-size:32px;font-weight:900;color:#EA580C;">${revSym}${afterFixesLoss.toLocaleString()}</p>
    </div>
    <div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:22px;text-align:center;">
      <p style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Annual Recovery</p>
      <p style="font-size:32px;font-weight:900;color:#16A34A;">${revSym}${annualRecovery.toLocaleString()}</p>
    </div>
  </div>

  <div class="section-title" style="font-size:17px;margin-bottom:16px;">12-Week Implementation Roadmap</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    ${roadmap.map(col => `
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px;">
        <p style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${col.weeks}</p>
        <p style="font-size:15px;font-weight:800;color:#0F172A;margin-bottom:10px;">${col.title}</p>
        ${col.items.map(i => `<p style="font-size:13px;color:#64748B;margin-bottom:6px;">• ${i}</p>`).join('')}
      </div>`).join('')}
  </div>
</div>

<!-- ===================== PAGE 5: Next Steps ===================== -->
<div class="page">
  ${header}
  <div class="section-title">Next Steps</div>
  <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:28px;margin-bottom:24px;">
    <p style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:14px;">How to use this report</p>
    <p style="font-size:14px;color:#334155;line-height:1.7;">
      Thank you for the opportunity to assess ${clientHtml}'s AI visibility. The fixes in this report are prioritised by
      estimated impact — start with the top 3. After a fix is applied, a verification re-scan (about 7 days later) confirms
      whether it worked; that is how every improvement in Rankall is proven. AI search is reshaping how customers find
      local businesses — acting now keeps you ahead of competitors.
    </p>
  </div>

  <div style="background:${tintBg};border:1.5px solid ${tintBorder};border-radius:12px;padding:24px;margin-bottom:28px;">
    <p style="font-size:13px;font-weight:700;color:${accentColor};margin-bottom:6px;">Get in touch</p>
    <p style="font-size:15px;color:#0F172A;">${agencyEmail ? `Questions about this report? Contact us at <strong>${esc(agencyEmail)}</strong>` : 'Questions about this report? Contact us at <strong>hello@rankall.io</strong>'}</p>
  </div>

  <div style="border-top:1.5px solid #E2E8F0;padding-top:20px;text-align:center;">
    <p style="font-size:13px;font-weight:700;color:#94A3B8;">${esc(agencyName)}${whiteLabel ? '' : ' &nbsp;·&nbsp; Rankall powered by AI'}</p>
    <p style="font-size:12px;color:#94A3B8;margin-top:4px;">Report generated ${date}</p>
  </div>
</div>

<!-- Print button (hidden when printing) -->
<div class="no-print" style="position:fixed;top:20px;right:20px;">
  <button onclick="window.print()" style="background:${accentColor};color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;">
    Print / Save as PDF
  </button>
</div>

</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scanId       = searchParams.get('scan_id');
  // Accept either agency_user_id (preferred) or agency_id
  const agencyUserId = searchParams.get('agency_user_id') || searchParams.get('agency_id');

  if (!scanId) {
    return NextResponse.json({ error: 'scan_id is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Plan entitlements (server-side). Trial cap (b28g): exports are blocked
  // during trial. Free plans have report_export = 0. Resolved once here;
  // the export decision runs after the branding agency is known (below).
  let requesterPlan: PlanFacts;
  try {
    const r = await resolvePlanServer(user.id);
    requesterPlan = { plan: r.plan, isTrialing: r.isTrialing, isAdmin: r.isAdmin };
  } catch {
    // Fail closed: an export is a paid feature and we could not verify it.
    return NextResponse.json({ error: 'plan_lookup_failed', message: 'Could not verify your plan. Please try again.' }, { status: 503 });
  }
  if (requesterPlan.isTrialing && !requesterPlan.isAdmin) {
    return NextResponse.json({
      error: 'trial_export_blocked',
      message: TRIAL_EXPORT_BLOCKED_MESSAGE,
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }

  let effectiveAgencyId: string = user.id;
  let settingsClient: Pick<typeof supabase, 'from'> = supabase;
  // P0a: ownership check — the requester may only generate a PDF for their own
  // scan. (Public share links are served by /r/[id]; outreach scans have no
  // owner.) Uses the service role so the check itself can't be bypassed by RLS.
  {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: ownedScan } = await admin
      .from('rankall_scans')
      .select('id, user_id')
      .eq('id', scanId)
      .maybeSingle();
    if (!ownedScan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }
    const ownerId = (ownedScan as Record<string, unknown>).user_id as string | null;
    // Owner or admin; an agency may render its own CLIENT's scan. Ownerless
    // scans are no longer renderable by any logged-in user (the old
    // `ownerId && ownerId !== user.id` let them through).
    let allowed = canAccessScan({ user_id: ownerId }, { id: user.id, email: user.email ?? null });
    if (!allowed && ownerId) {
      const { data: link, error: linkErr } = await admin
        .from('agency_clients')
        .select('agency_user_id')
        .eq('agency_user_id', user.id)
        .eq('client_user_id', ownerId)
        .limit(1)
        .maybeSingle();
      allowed = !linkErr && !!link;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Branding: ?agency_user_id is only honoured when it is the caller, or
    // the agency the caller is a client of. Otherwise the caller's OWN
    // settings are used (no rendering another agency's branding/white-label).
    effectiveAgencyId = user.id;
    if (agencyUserId && agencyUserId !== user.id) {
      const { data: membership, error: memErr } = await admin
        .from('agency_clients')
        .select('client_user_id')
        .eq('agency_user_id', agencyUserId)
        .eq('client_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!memErr && membership) effectiveAgencyId = agencyUserId;
    }
    settingsClient = admin;
  }

  // Branding account's CURRENT plan: white-label / custom branding only for
  // a current non-trial agency plan (a downgraded agency keeps its settings
  // row, which must stop rendering). Also decides the export for an agency's
  // client (the agency's plan covers its clients' branded reports).
  let brandingPlan: PlanFacts | null = requesterPlan;
  if (effectiveAgencyId !== user.id) {
    try {
      const r = await resolvePlanServer(effectiveAgencyId);
      brandingPlan = { plan: r.plan, isTrialing: r.isTrialing, isAdmin: r.isAdmin };
    } catch {
      brandingPlan = null;
    }
  }
  const exportDecision = reportExportDecision(requesterPlan, effectiveAgencyId !== user.id ? brandingPlan : null);
  if (exportDecision !== 'ok') {
    return NextResponse.json({
      error: exportDecision === 'trial_blocked' ? 'trial_export_blocked' : 'plan_required',
      message: exportDecision === 'trial_blocked'
        ? TRIAL_EXPORT_BLOCKED_MESSAGE
        : 'Report exports are included in paid plans. Upgrade to download or print this report.',
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }
  const mayUseBranding = brandingEntitled(brandingPlan);

  // Fetch scan from rankall_scans (canonical), fall back to scans
  let scanData: Record<string, unknown> | null = null;
  {
    const { data } = await supabase
      .from('rankall_scans')
      .select('*')
      .eq('id', scanId)
      .limit(1)
      .maybeSingle();
    scanData = data as Record<string, unknown> | null;
  }
  if (!scanData) {
    const { data } = await supabase
      .from('scans')
      .select('*')
      .eq('id', scanId)
      .limit(1)
      .maybeSingle();
    scanData = data as Record<string, unknown> | null;
  }

  if (!scanData) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // Load platform results (stored in separate table)
  const platformMap: Record<string, boolean | null> = {};
  // b8b5: responded = the platform actually answered. In the main
  // table a NULL or empty response_text (Mistral on the rankall.io
  // scan stores NULL) means NO response — it must not count in the
  // revenue denominator. (The first version of this fix treated NULL
  // as "field absent → assume responded" and still divided by 11.)
  // Only in the alt-schema fallback does a wholly ABSENT key count as
  // responded (the row exists and there is nothing to exclude it on).
  const respondedMain = (r: Record<string, unknown>) =>
    typeof r.response_text === 'string' && r.response_text.trim() !== '';
  const respondedFallback = (r: Record<string, unknown>) =>
    !('response_text' in r) || respondedMain(r);
  let respondedCount = 0;
  {
    const { data: rows } = await supabase
      .from('rankall_platform_results')
      .select('platform, mentioned, response_text')
      .eq('scan_id', scanId);
    for (const r of (rows || []) as Array<Record<string, unknown>>) {
      const p = r.platform as string;
      // b88a: no response_text -> no response (null), never a
      // flattened "not mentioned".
      if (p && !r.response_text) { platformMap[p] = null; continue; }
      // ax7w: mentioned ONLY — the old `|| !!r.response_text`
      // counted a category-only answer ("Here are dentists in
      // Austin…", business not named) as an appearance, inflating
      // the summary's "appears on X of 12". Same rule as the report
      // page (response_text && mentioned).
      if (p) {
        platformMap[p] = !!r.mentioned;
        if (respondedMain(r)) respondedCount += 1;
      }
    }
    // Fallback: embedded query_results array on the scan row (alt schema)
    if (Object.keys(platformMap).length === 0) {
      const qr = (scanData.query_results as Array<Record<string, unknown>>) || [];
      for (const r of qr) {
        if (r.platform) {
          platformMap[r.platform as string] = !!r.mentioned; // ax7w: see above
          if (respondedFallback(r)) respondedCount += 1;
        }
      }
    }
  }

  // Fetch agency settings (D3 wiring) — keyed on agency_user_id
  let agencySettings: Record<string, unknown> | null = null;
  {
    const { data: settings } = await settingsClient
      .from('agency_settings')
      .select('agency_name, agency_logo_url, agency_primary_color, agency_email, white_label_enabled')
      .eq('agency_user_id', effectiveAgencyId)
      .maybeSingle();
    // Not a current agency → Rankall branding (no white-label, no custom
    // agency name/logo/colour).
    agencySettings = mayUseBranding ? (settings as Record<string, unknown> | null) : null;
  }

  const clientName = (scanData.input as string) || (scanData.business_name as string) || 'Your Business';
  const city = (scanData.location as string) || (scanData.city as string) || '';
  // a8wr: only a well-formed hex color is trusted into the style
  // attributes — anything else falls back to Rankall purple instead of
  // breaking layout or breaking out of the attribute. (The settings UI
  // already constrains input to hex, this is defense-in-depth for
  // direct DB writes.)
  const rawColor = (agencySettings?.agency_primary_color as string) || '';
  const fallbackAccent = agencySettings?.white_label_enabled ? NEUTRAL_ACCENT : ACCENT;
  const accentColor = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(rawColor) ? rawColor : fallbackAccent;

  const html = generateHtml({ scan: scanData, agencySettings, platformMap, respondedCount, clientName, city, accentColor });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

  // TODO (C2 — storage): Upload rendered PDF to Supabase Storage bucket 'reports'
  //   ([scan_id]/report.pdf) once a serverless HTML→PDF path (e.g. an external
  //   render service) is wired. The print-to-PDF path above is the supported flow.
  // TODO (C3 — email): Email the report link / attached PDF to the client via the
  //   existing email-sequence infrastructure once C2 storage is in place.
}
