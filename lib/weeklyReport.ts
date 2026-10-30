// lib/weeklyReport.ts
// Weekly AI Visibility Report — per-user data builder + the shared run loop.
// Summarizes EXISTING scan data only (no fresh rescan).

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlan } from './planConfig';
import { loadLiveSubscriptions, planForAuthUser } from './planAudience';
import { getCountryConfig } from './countryConfig';
import { sendEmail } from './emailTemplates';
import { buildWeeklyReportHTML } from './weeklyReportEmail';
import { fetchGA4Data } from './ga4';
import { withCanonicalImpacts } from './fixIntelligence';
import { shouldSkipEmail } from './emailSuppression';

export interface WeeklyReportData {
  userName: string;
  userEmail: string;
  planType: string;
  entityType: 'business' | 'personal' | 'agency' | 'product' | 'enterprise';
  currentScore: number;
  previousScore: number;
  scoreChange: number;
  mentionedCount: number;
  totalPlatforms: number;
  competitorName: string;
  competitorScore: number | null; // null = no measured competitor score (never render 0/100 from missing data)
  revenueGap: number;
  currencySymbol: string;
  industry: string;
  city: string;
  countryCode: string;
  topFixTitle: string;
  topFixImpact: number | null;
  weekOf: string;
  reportUrl: string;
  ga4Data?: {
    sessions: number;
    newUsers: number;
    trend: 'up' | 'down' | 'flat';
    percentChange: number;
    propertyName: string;
  } | null;
}

const PAID_PLANS = ['personal_pro', 'business', 'agency', 'enterprise'];

// Plan comes from the shared cascade (subscriptions → app_metadata → free) via lib/planAudience.
// same source usePlan() reads first. This is the caller-supplied user shape.
export interface WeeklyUser { id: string; email: string; full_name: string; plan: string }

export async function buildWeeklyReportData(
  user: WeeklyUser,
  supabaseAdmin: SupabaseClient,
): Promise<WeeklyReportData | null> {
  const userId = user.id;
  const email = user.email;
  if (!email) return null;
  const userName = user.full_name || 'there';
  const plan = normalizePlan(user.plan || 'free');

  // Most recent scan.
  const { data: latestScan } = await supabaseAdmin
    .from('rankall_scans')
    .select('id, overall_score, mentioned_count, competitor_name, industry, country_code, location, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestScan) return null;

  // Dormant check — no scan in the last 30 days → skip.
  const daysSinceScan = Math.floor((Date.now() - new Date(latestScan.created_at as string).getTime()) / 86400000);
  if (daysSinceScan > 30) return null;

  // Previous scan (> 7 days ago) for the week-over-week delta.
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: previousScan } = await supabaseAdmin
    .from('rankall_scans')
    .select('overall_score')
    .eq('user_id', userId)
    .lt('created_at', oneWeekAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentScore = Number(latestScan.overall_score) || 0;
  const previousScore = Number(previousScan?.overall_score) || 0;
  const scoreChange = previousScan ? currentScore - previousScore : 0;

  // competitor_score isn't on rankall_scans — read the latest score_history row.
  const { data: sh } = await supabaseAdmin
    .from('score_history')
    .select('competitor_score')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // ax6u: competitor_score is NULL in every score_history row (the scan
  // pipeline never computes a competitor score). Preserve NULL — the old
  // `Number(...) || 0` turned "no data" into a fabricated "scores 0/100"
  // in the weekly email. A real stored number passes through unchanged.
  const competitorScore = sh?.competitor_score == null ? null : Number(sh.competitor_score);

  // Top pending fix opportunity.
  const { data: topFixRows } = await supabaseAdmin
    .from('generated_fixes')
    .select('fix_title, fix_type')
    .eq('user_id', userId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(20);
  // ax81: rank by the canonical per-fix number (same as the fix queue),
  // normalised at read time — never the stored legacy predicted_impact.
  const topFix = withCanonicalImpacts((topFixRows ?? []) as Array<{ fix_title: string | null; fix_type: string | null }>)[0] ?? null;

  // GA4 website-traffic data — included only if the user has connected Google
  // Analytics. Degrades gracefully: any failure/absence leaves ga4Data null and
  // the email still sends without the traffic section.
  let ga4Data: WeeklyReportData['ga4Data'] = null;
  try {
    const ga4Result = await fetchGA4Data(userId, supabaseAdmin);
    if (ga4Result?.connected) {
      ga4Data = {
        sessions: ga4Result.last30Days.sessions,
        newUsers: ga4Result.last30Days.newUsers,
        trend: ga4Result.trend,
        percentChange: ga4Result.percentChange,
        propertyName: ga4Result.propertyName,
      };
    }
  } catch {
    // GA4 fetch failed — email still sends without traffic data.
  }

  const entityType: WeeklyReportData['entityType'] =
    plan === 'personal_pro' ? 'personal' : plan === 'agency' ? 'agency' : plan === 'enterprise' ? 'enterprise' : 'business';

  const countryCode = (latestScan.country_code as string) || 'US';

  return {
    userName,
    userEmail: email,
    planType: plan,
    entityType,
    currentScore,
    previousScore,
    scoreChange,
    mentionedCount: Number(latestScan.mentioned_count) || 0,
    totalPlatforms: 11,
    competitorName: (latestScan.competitor_name as string) || '',
    competitorScore,
    revenueGap: 0, // not stored per-scan; omitted from the email when 0
    currencySymbol: getCountryConfig(countryCode).symbol,
    industry: (latestScan.industry as string) || 'business',
    city: (latestScan.location as string) || '',
    countryCode,
    topFixTitle: (topFix?.fix_title as string) || 'Optimize your AI visibility',
    // No hardcoded fallback (was `|| 8`): unknown → null → number omitted.
    topFixImpact: topFix?.predicted_impact ?? null,
    weekOf: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    // Deep-link via /login?next= so a logged-out user lands back on their report
    // after signing in; a logged-in user is redirected straight there by the login
    // page's session check.
    reportUrl: latestScan.id
      ? `https://www.rankall.io/login?next=${encodeURIComponent(`/report/${latestScan.id}`)}`
      : 'https://www.rankall.io/dashboard',
    ga4Data,
  };
}

export interface WeeklyPreviewItem { email: string; score: number; scoreChange: number; subject: string; ga4Sessions?: number; ga4Trend?: 'up' | 'down' | 'flat' }
export interface WeeklyReportRunResult { sent: number; skipped: number; errors: number; total: number; dryRun: boolean; preview?: WeeklyPreviewItem[] }

function reportSubject(score: number): string {
  return `Your AI Visibility Week in Review — Score: ${score}/100`;
}

// Shared run loop — used by the cron and the admin trigger. Summarizes existing
// data only; respects unsubscribes; rate-limited to ~1 email/sec. In dryRun mode
// it builds everything but sends nothing, returning a preview of what WOULD send.
export async function runWeeklyReports(
  supabaseAdmin: SupabaseClient,
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<WeeklyReportRunResult> {
  // Audience = paid users via the shared cascade (subscriptions →
  // app_metadata → free). NEVER user_metadata — users can write it.
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const liveSubs = await loadLiveSubscriptions(supabaseAdmin);
  const paidUsers = (usersData?.users ?? []).filter((u) => PAID_PLANS.includes(planForAuthUser(u, liveSubs)));

  const rows = paidUsers.slice(0, opts.limit ?? 100000);
  const preview: WeeklyPreviewItem[] = [];
  let sent = 0, skipped = 0, errors = 0;

  for (const u of rows) {
    try {
      const weeklyUser: WeeklyUser = {
        id: u.id,
        email: u.email ?? '',
        full_name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email || 'there',
        plan: planForAuthUser(u, liveSubs),
      };
      const data = await buildWeeklyReportData(weeklyUser, supabaseAdmin);
      if (!data) { skipped++; continue; }

      // Respect opt-outs — do_not_contact (signed unsubscribe link,
      // bounces, spam) + legacy outreach_unsubscribes, fail closed, and the
      // user's "Weekly report" toggle in Settings (user_preferences).
      if (await shouldSkipEmail({ email: data.userEmail, userId: u.id }, 'weekly_report')) { skipped++; continue; }

      const subject = reportSubject(data.currentScore);

      if (opts.dryRun) {
        // Would send — record a preview, send nothing.
        preview.push({
          email: data.userEmail,
          score: data.currentScore,
          scoreChange: data.scoreChange,
          subject,
          ga4Sessions: data.ga4Data?.sessions ?? undefined,
          ga4Trend: data.ga4Data?.trend ?? undefined,
        });
        sent++;
        continue;
      }

      const ok = await sendEmail({ to: data.userEmail, subject, html: buildWeeklyReportHTML(data) });
      if (ok) { sent++; console.log('[weeklyReport] sent:', data.userEmail, 'score', data.currentScore); }
      else errors++;

      await new Promise((r) => setTimeout(r, 1000)); // Resend rate limit
    } catch (err) {
      console.error('[weeklyReport] error for', u.id, err);
      errors++;
    }
  }

  return { sent, skipped, errors, total: rows.length, dryRun: !!opts.dryRun, preview: opts.dryRun ? preview : undefined };
}
