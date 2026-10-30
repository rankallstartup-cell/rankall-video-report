'use client';
import { useEffect, useState, useCallback, Fragment } from 'react';
import RiskReversal from '@/components/RiskReversal';
import HonestUrgency from '@/components/HonestUrgency';
import WarmVariant from '@/components/WarmVariant';
import { useParams } from 'next/navigation';
import { MarkFixApplied } from '@/components/MarkFixApplied';
import { revenueGapForScan, revenueGapForScanBreakdown, REVENUE_CONVERSION_RATE } from '@/lib/scoring';
import { PLATFORMS } from '@/lib/platforms';
import { getBrowserClient } from '@/lib/supabase'
import { getCountryConfig, getRevenueSymbol, inferCountryFromText } from '@/lib/countryConfig';
import { scoreWithOutcome, outcomeShort } from '@/lib/scoreFraming';
import type { UnifiedFix } from '@/lib/fixes';
import { KnowledgePanelCard } from '@/components/KnowledgePanelCard';
import RecommendationSimulator from '@/components/RecommendationSimulator';
import { gradeLabel, MAX_SCORE_CAP, calculateSimulation } from '@/lib/simulator';
import { projectScore, effectiveCap } from '@/lib/projection';
import PlatformBadge from '@/components/PlatformBadge';
import { getAvgCustomerValue } from '@/lib/countryConfig';
import { isBusinessPlan, isPersonalTier, isAdminUser } from '@/lib/planConfig';
import { usePlan } from '@/lib/usePlan';
import { groupCitationSources } from '@/lib/citationOwnership';
import { getTrustedStoredGoogle, getTrustedDisplayName } from '@/lib/enrichment';
import { sanitizeTitleTagSignal } from '@/lib/trust';
import { trustFixGainPoints } from '@/lib/trust';
import { impactRangeForFix } from '@/lib/fixIntelligence';
import { getFixMetadata } from '@/lib/fixQuality';
import { AI_REFRESH_NOTE, aiTimeline } from '@/lib/aiRefreshCopy';
import type { ReportPayload, ReportViewerTier } from '@/lib/reportPayload';
import { execSummaryCacheKey, readExecSummaryCache, legacyExecSummaryCacheKey, shouldRequestExecSummary } from '@/lib/execSummaryCache';
import Logo from '@/components/Logo';
const supabase = getBrowserClient();

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const AMBER  = '#D97706';
const RED    = '#DC2626';
const PURPLE = '#1B17FF';

const scoreCol = (s: number) => s >= 75 ? GREEN : s >= 50 ? AMBER : RED;

// Derive country from a confident location signal in the query first, then the
// scan's saved country_code, then the viewer's cookie (last resort).
const VALID_COUNTRY_CODES = new Set([
  'US','GB','AU','CA','IE','NZ','SG','AE','ZA','NG','KE','GH','IN','PH',
]);

function readCookieCountry(): string {
  if (typeof document === 'undefined') return 'US';
  const match = document.cookie.match(/(?:^|;\s*)rankall_country=([^;]+)/);
  const raw = (match?.[1] || '').toUpperCase().trim();
  return VALID_COUNTRY_CODES.has(raw) ? raw : 'US';
}

// Resolve country for a scan. A confident location signal from the query text
// wins FIRST — more reliable than a saved country_code that may have come from a
// stale country_override/geo cookie during testing (the "Elgin IL shows £" bug).
// Only when the query has no recognisable location do we trust the saved code,
// then finally the cookie.
function resolveCountryForScan(
  savedCode: string | null | undefined,
  location: string,
  input: string,
): string {
  const fromText = inferCountryFromText(location, input);
  if (fromText) return fromText;
  if (savedCode && VALID_COUNTRY_CODES.has(savedCode.toUpperCase()))
    return savedCode.toUpperCase();
  return readCookieCountry();
}

// Country detection test matrix:
// GB scan (country_code='GB') → £, £350 avg, 80 inquiries
// IN scan (country_code='IN') → ₹, ₹2000 avg, 200 inquiries
// AU scan (country_code='AU') → A$, A$450 avg, 60 inquiries
// US scan / default            → $, $800 avg, 120 inquiries
// ZA scan (country_code='ZA') → R, R2800 avg, 40 inquiries

const FIX_IMPACT: Record<string, { seo: string; ai: string }> = {
  faq_schema:       { seo: 'High',   ai: 'Very High' },
  jsonld:           { seo: 'High',   ai: 'High'      },
  directory:        { seo: 'High',   ai: 'Medium'    },
  reviews:          { seo: 'Medium', ai: 'Very High' },
  reddit:           { seo: 'Low',    ai: 'High'      },
  google_business:  { seo: 'High',   ai: 'High'      },
  website_content:  { seo: 'High',   ai: 'Medium'    },
  page_speed:       { seo: 'High',   ai: 'Low'       },
};

function getFixImpact(fixType: string): { seo: string; ai: string } {
  return FIX_IMPACT[fixType] ?? { seo: 'Medium', ai: 'Medium' };
}

// ax7x: ONE share formula, used everywhere on the report: the mention
// rate (mentioned platforms / 12) x 100. The header previously used
// mentioned/total x 40 (a fabricated scale turning 2/11 into ~7%), while
// the share block used the stored recommendation_share and the competitor
// share was capped at 71 (so the split summed to 98, not 100). All three
// now derive from the same mention count over the full 12-platform set.
// b0ff: the competitor clause used to read 'X is recommended more on
// (11 - appearedOn) platforms' — counting every platform that did NOT
// mention you (including ones that never responded) as a competitor win.
// It now only appears when the named competitor's REAL measured mention
// count exists (compScanData), and only when that count beats yours.
function framingText(appearedOn: number, competitorName?: string, competitorMentioned?: number): string {
  const shareApprox = Math.round(appearedOn / 12 * 100);
  const compText = competitorName && typeof competitorMentioned === 'number' && competitorMentioned > appearedOn
    ? ` ${competitorName} was recommended on ${competitorMentioned} platforms — ${competitorMentioned - appearedOn} more than you.`
    : '';
  return `You appear on ${appearedOn} of 12 AI platforms. Your recommendation share is ~${shareApprox}%.${compText}`;
}

interface Scan {
  id: string;
  input: string;
  user_business_name: string | null;
  intent_type: string;
  industry: string;
  location: string;
  country_code?: string | null;
  overall_score: number;
  competitor_name: string;
  mentioned_count: number;
  citation_sources: string[];
  trust_signals: TrustSignalReport;
  enrichment: {
    google?: {
      reviewCount: number | null;
      rating: number | null;
      // azzt: operational status, NOT claim status (Places exposes no
      // claimed field). Legacy `claimed` below is the same boolean under
      // the old wrong name, stored on pre-azzt scans — read only via the
      // `operational ?? claimed` fallback at the Listing-status row.
      operational?: boolean;
      /** @deprecated pre-azzt: the operational boolean, misnamed. Do not use as claimed. */
      claimed?: boolean;
      address: string | null;
      phone: string | null;
      website: string | null;
      hours: string | null;
      photos: number | null;
      category: string | null;
      // Stored Places identity (present in the saved JSON even though the
      // old render never read it) — the field render-time re-validation
      // checks to decide whether this Google data belongs to this scan.
      name: string | null;
      placeId: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    serpData?: {
      localPackPosition: number | null;
      competitorInPack: string | null;
      yelpPresent: boolean;
      healthgradesPresent: boolean;
      facebookPresent: boolean;
    };
    reddit?: {
      mentionCount: number;
      topSubreddits: string[];
      sentiment: string | null;
    };
    dataforSeo?: {
      localRank: number | null;
      citationCount: number | null;
      napConsistency: boolean;
    };
  } | null;
  created_at: string;
}

interface PlatformResult {
  id: string;
  platform: string;
  weight: number;
  score: number;
  mentioned: boolean;
  mention_rate?: number;
  response_text: string;
  error: string;
  // b0fm: set by /api/report — true when the platform answered, even when
  // the response text is withheld from a logged-out viewer.
  responded?: boolean;
}

// Did this platform answer? Prefers the server's flag (response text is
// withheld from logged-out viewers), falls back to the text itself.
const hasResponse = (r: PlatformResult) =>
  typeof r.responded === 'boolean' ? r.responded : !!r.response_text;

interface Fix {
  id: string;
  title: string;
  description: string;
  predicted_impact: number;
  confidence: number;
  effort: string;
  fix_type: string;
  status: 'pending' | 'applied' | 'verified';
  generated_fix_id?: string; // P0e: links to the generated_fixes row when present
  created_at?: string; // CONV-04: for fix-queue staleness
}

interface TrustSignal {
  name: string;
  status: 'good' | 'warning' | 'danger' | 'missing' | 'not_checked';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fixAvailable: boolean;
  consequence?: string;
  pointsImpact?: number;
  // b0fm: logged-out payloads carry the gain precomputed over the full
  // (withheld) signal set, so the badge number matches the signed-in view.
  gainPoints?: number;
}

interface TrustSignalReport {
  technical: TrustSignal[];
  directory: TrustSignal[];
  reviews: TrustSignal[];
  community: TrustSignal[];
  // ax88: present on scans saved after this change; older scans omit it.
  aiPlatforms?: TrustSignal[];
  overall: number;
  // b0fm: logged-out payloads only — count of withheld signals and the two
  // schema statuses the free comparison table reads.
  lockedCount?: number;
  summary?: { faqSchema: string | null; localBusinessSchema: string | null };
}


// ── Fix instructions (shared with trust dashboard) ────────────────────
interface FixInstruction { steps: string[]; timeline: string; }
interface FixCardMetadata {
  estimatedImpact?: string;
  difficulty?: string;
  timeToImplement?: string;
  howToVerify?: string;
  relatedSignals?: string[];
}

const LABEL_MAP_REPORT: Record<string, string> = {
  'FAQ Schema': 'AI-Friendly FAQ on Website', 'FAQPage Schema': 'AI-Friendly FAQ on Website',
  'LocalBusiness JSON-LD': 'Business Data Markup', 'LocalBusiness Schema': 'Business Data Markup',
  'Response rate signals': 'Review Response Rate', 'Review Response Rate': 'Review Response Rate',
  'Multi-platform reviews': 'Reviews on Multiple Sites',
  'Review count': 'Review Count Visibility', 'Review Count': 'Review Count Visibility',
  'HTTPS': 'Secure Website (HTTPS)', 'Meta Description': 'Search Description Tag',
  'Open Graph Tags': 'Social Sharing Preview', 'Twitter Card': 'Twitter/X Preview Card',
  'Canonical URL': 'Preferred Page Address', 'H1 Tag': 'Main Page Heading', 'Title Tag': 'Page Title Tag',
  'Blog or Content Section': 'Blog / Content Section', 'Services Page': 'Services or Products Page',
  'Reviews or Testimonials': 'On-Site Testimonials', 'Structured Data (any schema)': 'Structured Data Present',
  'Image Alt Text': 'Image Descriptions', 'Content Freshness': 'Content Up to Date',
  'Google Business Profile': 'Google Business Profile',
  'Yelp listing': 'Yelp Business Listing', 'Yelp Listing': 'Yelp Business Listing',
  'BBB listing': 'BBB Accreditation', 'BBB Listing': 'BBB Accreditation',
  'Nextdoor mentions': 'Nextdoor Community Presence', 'Reddit mentions': 'Reddit Mentions',
  'Local news citations': 'Local News Coverage', 'Forum mentions': 'Online Forum Mentions',
  'Citation count': 'Business Citation Count', 'NAP consistency': 'Name, Address & Phone Consistency',
};

const FIX_INSTRUCTIONS_REPORT: Record<string, FixInstruction> = {
  'AI-Friendly FAQ on Website': { steps: ['Write 5–8 questions customers ask most often', 'Get your pre-generated FAQPage JSON-LD from rankall.io/dashboard/fix', 'Paste the code just before </head> on your homepage', 'Verify at Google\'s Rich Results Test: search.google.com/test/rich-results'], timeline: AI_REFRESH_NOTE },
  'Business Data Markup': { steps: ['Get your LocalBusiness JSON-LD from rankall.io/dashboard/fix', 'Verify name, address, phone, hours, and website are correct', 'Paste before </head> on your homepage', 'Test at search.google.com/test/rich-results'], timeline: AI_REFRESH_NOTE },
  'Google Business Profile': { steps: ['Go to business.google.com and search your business name', 'Click "Claim this business" or "Add your business"', 'Fill in full details: name, address, phone, hours, category', 'Choose a verification method (postcard 5–7 days, phone/video faster)', 'Add 5+ photos, services list, and description after verifying'], timeline: aiTimeline('Google verifies the listing first (time depends on the method).') },
  'Yelp Business Listing': { steps: ['Search for your business on the primary review directories in your market', 'Claim or add your listing and complete the full profile: hours, phone, website, photos, description', 'Respond to any existing reviews', 'Add your business to the correct categories'], timeline: AI_REFRESH_NOTE },
  'BBB Accreditation': { steps: ['Go to bbb.org → "For Businesses"', 'Search and claim your free listing', 'Fill in full contact details and business description', 'Respond to any existing reviews or complaints', 'Optional: apply for paid Accreditation for stronger AI signal'], timeline: aiTimeline('BBB sets its own listing and accreditation review times.') },
  'Name, Address & Phone Consistency': { steps: ['Search your business on Google — note every site listing your info', 'Check Yelp, Facebook, Apple Maps, Bing Places, industry directories', 'Make name, address, phone identical everywhere (same abbreviations)', 'Update mismatches — prioritise Google, Yelp, Facebook first', 'Run a free audit at whitespark.ca to catch anything missed'], timeline: AI_REFRESH_NOTE },
  'Reddit Mentions': { steps: ['Search Reddit for your city + industry to find 2–3 active subreddits', 'Create a personal account — not a business account', 'Spend a week reading and upvoting before posting', 'Answer genuine questions in your area of expertise first', 'Once established, mention your business naturally when it fits'], timeline: AI_REFRESH_NOTE },
  'Nextdoor Community Presence': { steps: ['Go to nextdoor.com/business and claim your free page', 'Complete profile with photos, hours, services, and description', 'Ask 2–3 local customers who use Nextdoor to recommend you', 'Respond to community posts where your expertise is relevant'], timeline: AI_REFRESH_NOTE },
  'Local News Coverage': { steps: ['Identify 2–3 local news sites or community blogs', 'Email the editor with a story angle: milestone, event, or expert tip', 'Make sure your business name and website appear in the article'], timeline: aiTimeline('Publication timing is up to the editor.') },
  'Online Forum Mentions': { steps: ['Search Quora for questions in your industry', 'Write genuinely helpful answers — no direct promotion', 'Include your business naturally in your bio or at the end', 'Contribute to 1–2 niche forums over 2–4 weeks'], timeline: AI_REFRESH_NOTE },
  'Review Response Rate': { steps: ['Open Google Business Profile and go to Reviews', 'Reply to every unanswered review — even a brief thanks counts', 'For negatives: acknowledge, apologise, offer to resolve offline', 'Set a weekly reminder to reply within 48 hours going forward', 'Do the same on Yelp and Facebook'], timeline: AI_REFRESH_NOTE },
  'Reviews on Multiple Sites': { steps: ['Email last 10–20 customers asking for a Yelp or Facebook review', 'Add review links to your email signature and receipts', 'Ask Google reviewers if they\'d share on one other platform', 'Target 3 platforms: Google, Yelp, and one industry-specific site'], timeline: AI_REFRESH_NOTE },
  'Review Count Visibility': { steps: ['Add a "Leave us a review" link to your email signature', 'Add a QR code on receipts or business cards linking to your review page', 'Ask 5 satisfied customers directly this week — personal asks convert better', 'Reply to all existing reviews to signal activity'], timeline: AI_REFRESH_NOTE },
  'Secure Website (HTTPS)': { steps: ['Log into your web hosting control panel', 'Find "SSL/TLS" or "Let\'s Encrypt" — most hosts offer it free with one click', 'Enable SSL for your domain', 'Set up http:// → https:// redirect', 'Test at ssllabs.com/ssltest'], timeline: aiTimeline('SSL is live as soon as your host enables it.') },
  'Search Description Tag': { steps: ['Write 140–160 chars: what you do, where, and your differentiator', 'Add to homepage: <meta name="description" content="Your text">', 'In WordPress: use Yoast/RankMath "Meta description" field', 'In Squarespace/Wix: find Page SEO settings'], timeline: AI_REFRESH_NOTE },
  'Blog / Content Section': { steps: ['Find 3 questions customers ask most (check reviews or DMs)', 'Write a 400–600 word article answering one question clearly', 'Publish on a /blog or /articles section of your website', 'Include your city and industry in the title naturally', 'Publish one new article per month minimum'], timeline: AI_REFRESH_NOTE },
  'Services or Products Page': { steps: ['Create a /services page listing every service you offer', 'Write a short paragraph per service describing what it includes', 'Add your city naturally in at least one service description', 'Link to it from your homepage navigation'], timeline: AI_REFRESH_NOTE },
  'On-Site Testimonials': { steps: ['Ask 3–5 recent happy customers for a short quote', 'Add a Testimonials section to your homepage', 'Include first name, last initial, and service received', 'Consider adding a star rating graphic alongside each quote'], timeline: AI_REFRESH_NOTE },
  'Content Up to Date': { steps: ['Check your homepage — does it mention current prices, hours, services?', 'Update one thing this week: a price, phone number, or new service', 'Publish a new blog post or refresh an existing article', 'Update the copyright year in your footer'], timeline: AI_REFRESH_NOTE },
  'Image Descriptions': { steps: ['In your website editor, click each image and find the "Alt text" field', 'Write a 5–10 word description of what the image shows', 'Include your city and service in at least 2–3 alt texts', 'In WordPress: edit each image in the Media Library → "Alternative Text"'], timeline: AI_REFRESH_NOTE },
  'Main Page Heading': { steps: ['Make sure your homepage has exactly one H1 — not zero, not two', 'Write it to include your service and city: "Trusted Plumber in Houston, TX"', 'In WordPress page editor: the first "Heading 1" block is your H1', 'In HTML: <h1>Your heading here</h1> near the top of the page'], timeline: AI_REFRESH_NOTE },
  'Page Title Tag': { steps: ['Write a title under 60 chars: "[Business] — [Service] in [City]"', 'Add: <title>Your Title Here</title> in your homepage HTML', 'In WordPress: "SEO Title" in Yoast or RankMath', 'In Squarespace: Page Settings → SEO → Title'], timeline: AI_REFRESH_NOTE },
  'Social Sharing Preview': { steps: ['Add to homepage <head>: <meta property="og:title" content="...">', 'Add: <meta property="og:description" content="...">', 'Add: <meta property="og:image" content="URL to 1200×630px image">', 'Test at developers.facebook.com/tools/debug'], timeline: AI_REFRESH_NOTE },
  'Twitter/X Preview Card': { steps: ['Add to <head>: <meta name="twitter:card" content="summary_large_image">', 'Add: <meta name="twitter:title" content="Your Business Name">', 'Add: <meta name="twitter:description" content="Short description">', 'Test at cards-dev.twitter.com/validator'], timeline: AI_REFRESH_NOTE },
  'Preferred Page Address': { steps: ['Add to <head>: <link rel="canonical" href="https://yourdomain.com/">', 'Ensure URL matches exactly how you want it indexed', 'In WordPress: Yoast/RankMath set this automatically — check it\'s enabled'], timeline: AI_REFRESH_NOTE },
  'Structured Data Present': { steps: ['Get your LocalBusiness JSON-LD from rankall.io/dashboard/fix', 'Paste it before </head> on your homepage', 'Verify at search.google.com/test/rich-results'], timeline: AI_REFRESH_NOTE },
  'Business Citation Count': { steps: ['Submit to Bing Places: bingplaces.com', 'Submit to Apple Maps: mapsconnect.apple.com', 'Submit to Foursquare: business.foursquare.com', 'Submit to Manta: manta.com/claim', 'Submit to Hotfrog: hotfrog.com — use identical NAP on all'], timeline: AI_REFRESH_NOTE },
};

function getFixForReport(name: string): FixInstruction | null {
  const label = LABEL_MAP_REPORT[name] ?? name;
  return FIX_INSTRUCTIONS_REPORT[label] ?? null;
}

// Self-contained "Add to LinkedIn Queue" button for business/agency users.
// Manages its own plan + user resolution so it stays isolated from the report
// page's main state. Inserts a linkedin_queue row pre-filled from the scan.
function AddToLinkedInQueue({ scan, displayName }: { scan: Scan; displayName?: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  // Same ONE source of truth as the report gate — no bespoke metadata reads.
  const { plan, userId, loading } = usePlan();
  const eligible = !loading && !!userId && isBusinessPlan(plan);

  if (!eligible) return null;

  async function add() {
    if (!userId) return;
    setState('saving');
    try {
      await supabase.from('linkedin_queue').insert({
        user_id: userId,
        business_name: displayName || scan.user_business_name || scan.input || 'Business',
        score: scan.overall_score ?? null,
        industry: scan.industry || null,
        city: scan.location || null,
        scan_id: scan.id,
        report_url: `/report/${scan.id}`,
        status: 'pending',
      });
      setState('done');
    } catch {
      setState('idle');
    }
  }

  return (
    <button
      onClick={add}
      disabled={state !== 'idle'}
      style={{ background: state === 'done' ? '#ECFDF5' : '#ECEBFF', color: state === 'done' ? GREEN : PURPLE, border: `1.5px solid ${state === 'done' ? '#A7F3D0' : '#DCDAFF'}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: state === 'idle' ? 'pointer' : 'default', marginBottom: 20 }}
    >
      {state === 'done' ? <><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Added to LinkedIn Queue</> : state === 'saving' ? 'Adding…' : <>Add to LinkedIn Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>}
    </button>
  );
}

// INT-01: CSV export of the scan report + fix plan. Paid plans only — the
// server enforces the gate; the button shows an honest upsell otherwise.
function ExportCsvButton({ scanId }: { scanId: string }) {
  const { plan, userId, loading, isTrialing } = usePlan();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (loading || !userId) return null;
  const isPaid = plan !== 'free';
  const eligible = isPaid && !isTrialing;

  async function exportCsv() {
    setState('busy');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(scanId)}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Export failed. Please try again.');
        setState('error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rankall-report-${scanId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      setErrorMsg('Export failed. Please try again.');
      setState('error');
    }
  }

  if (!eligible) {
    return (
      <p style={{ fontSize: 13, color: LGRAY, margin: '0 0 20px' }}>
        CSV export is a paid-plan feature{isTrialing ? ' and isn\u2019t included during your trial' : ''}.{' '}
        <a href="/pricing" style={{ color: BLUE, fontWeight: 700 }}>Upgrade to export</a>
      </p>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={exportCsv}
        disabled={state === 'busy'}
        style={{ background: W, color: NAVY, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: state === 'busy' ? 'wait' : 'pointer', fontFamily: 'inherit' }}
      >
        {state === 'busy' ? 'Exporting…' : '↓ Export CSV'}
      </button>
      {state === 'error' && errorMsg && (
        <p style={{ fontSize: 13, color: '#DC2626', margin: '8px 0 0' }}>{errorMsg}</p>
      )}
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const [scan, setScan] = useState<Scan | null>(null);
  const [results, setResults] = useState<PlatformResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // ax70: distinguish a genuinely missing report from a failed load, and a
  // failed platform-rows fetch from an empty breakdown. All three used to
  // collapse into "Report not found" or a silent empty list.
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [platformError, setPlatformError] = useState(false);
  // Item 7: true only once the platform rows arrived successfully — the
  // exec summary must never be generated (and cached) from a half-loaded page.
  const [resultsLoaded, setResultsLoaded] = useState(false);
  // b0fm: the tier /api/report filtered the payload for. The UI gates on it
  // too, so a client/server session mismatch can't render withheld fields
  // as empty ("No response") instead of the signup gate.
  const [viewerTier, setViewerTier] = useState<ReportViewerTier>('anon');
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [fixError, setFixError] = useState<Record<string, string>>({});
  const [applyError, setApplyError] = useState<Record<string, string>>({});
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showScoreExplain, setShowScoreExplain] = useState(false);
  const [fixesLoading, setFixesLoading] = useState(false);
  // Ticket 5: fixesReady gates all projection numbers. fixes starts EMPTY —
  // the old FALLBACK_FIXES (5 generic fixes with hardcoded confidence
  // 91/89/94/88/82, never computed for this scan) rendered as if they were
  // the user's personalized fixes whenever the fixes fetch failed (ax70).
  // On fetch failure we now show an error + Retry, never fake fixes.
  const [fixesReady, setFixesReady] = useState(false);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [fixesError, setFixesError] = useState(false);
  const [fixesRetry, setFixesRetry] = useState(0);
  // b0fj: dismiss the sticky bottom CTA so it can't cover buttons beneath it.
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [appliedFix, setAppliedFix] = useState<string | null>(null);
  const [hoveredUndo, setHoveredUndo] = useState<string | null>(null);
  const [generatingFix, setGeneratingFix] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<Record<string, string>>({});
  const [fixMetadata, setFixMetadata] = useState<Record<string, FixCardMetadata>>({});
  const [fixWarning, setFixWarning] = useState<Record<string, string>>({});
  const [showContent, setShowContent] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [compScanLoading, setCompScanLoading] = useState(false);
  const [compScanData, setCompScanData] = useState<{ score: number; mentioned: number; platforms: Array<{ platform: string; mentioned: boolean }> } | null>(null);
  const [compScanError, setCompScanError] = useState<string | null>(null);

  // Currency: resolved from the scan record's country_code (most reliable), then
  // location-text inference, then cookie. Updated once the scan row loads.
  // ax9d: monthly starts null — the old `monthly: 99` initial state flashed a
  // $99 price in CTA microcopy before the scan's country config loaded.
  // No price renders until the real config arrives.
  const [currency, setCurrency] = useState<{ symbol: string; revenueSymbol: string; monthly: number | null }>({ symbol: '$', revenueSymbol: '$', monthly: null });
  // scanCountryCode is set alongside currency so API calls use the scan's country
  const [scanCountryCode, setScanCountryCode] = useState<string>('US');
  const SYM = currency.revenueSymbol; // spend / revenue figures use local currency

  // Spend intelligence state
  const [spendGoogle, setSpendGoogle]   = useState('');
  const [spendMeta, setSpendMeta]       = useState('');
  const [spendSeo, setSpendSeo]         = useState('');
  const [spendReviews, setSpendReviews] = useState('');
  const [spendDirs, setSpendDirs]       = useState('');
  const [spendOther, setSpendOther]     = useState('');
  const [spendLoading, setSpendLoading] = useState(false);
  const [spendAnalysis, setSpendAnalysis] = useState<{
    categories?: Array<{ name: string; amount: number; aiImpact: string; explanation: string }>;
    reallocation?: { moveAmount: number; fromCategory: string; toCategory: string; expectedImprovementPoints: number; gapClosedPercent: number; reasoning: string };
    bestHundred?: { category: string; action: string; expectedImpact: string };
  } | null>(null);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [spendContext, setSpendContext] = useState<{ competitor: string | null; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [trustSignals, setTrustSignals] = useState<TrustSignalReport | null>(null);
  const [gapNarrative, setGapNarrative] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [copiedFixId, setCopiedFixId] = useState<string | null>(null);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  // ONE source of truth for the user's plan — the canonical usePlan() hook, same
  // as the rest of the app. It resolves plan from user_metadata → app_metadata →
  // subscriptions (active/trialing/past_due) → profiles, and refreshes stale JWTs.
  // This replaces the old bespoke isPaid derivation that missed most of those.
  const { plan, loading: authLoading, userId, userEmail } = usePlan();
  const isLoggedIn = !!userId;
  const isAdmin = isAdminUser(userEmail);
  const isPaid = isAdmin || isBusinessPlan(plan); // admins are ALWAYS paid
  // b0fm: the signed-in content (all trust signals, full platform
  // responses) renders only when the SERVER also served the signed-in
  // payload — never empty placeholders for withheld fields.
  const viewerFull = isLoggedIn && viewerTier !== 'anon';

  // Stale-poisoned-report guard (PR #37 follow-up): pre-PR #37 scans stored
  // the first fuzzy Places result with zero validation, so old reports can
  // carry another business's Google data AND heading. Re-validate the stored
  // GBP data at render time against the scan's own query — no DB writes.
  // trustedGoogle is undefined when the stored data fails the check; the GBP
  // card then renders an honest no-match note instead of wrong-business data.
  // displayName falls back to the scan's own input when the stored heading
  // came from a mismatched Google name.
  const trustedGoogle = getTrustedStoredGoogle(scan?.input, scan?.location, scan?.enrichment?.google);
  const googleMismatch = !!scan?.enrichment?.google && !trustedGoogle;
  const displayName = scan
    ? getTrustedDisplayName(scan.input, scan.location, scan.user_business_name, scan.enrichment?.google)
    : '';
  const [compHistory, setCompHistory] = useState<Array<{ your_score: number; competitor_score: number | null; recorded_at: string }>>([]);
  // Phase 19: executive summary (Haiku, cached 24h in localStorage; paid only).
  const [execSummary, setExecSummary] = useState<string[] | null>(null);
  const [execLoading, setExecLoading] = useState(false);

  const runExecSummary = useCallback((force = false) => {
    if (!scan) return;
    // Item 7: versioned key — summaries cached by older code (or from
    // pre-fix data) are ignored and the legacy entry is dropped.
    const key = execSummaryCacheKey(scan.id);
    try { localStorage.removeItem(legacyExecSummaryCacheKey(scan.id)); } catch { /* ignore */ }
    if (!force) {
      try {
        const cached = readExecSummaryCache(localStorage.getItem(key), Date.now());
        if (cached) {
          setExecSummary(cached);
          return;
        }
      } catch { /* ignore cache errors */ }
    }
    const topFix = [...fixes].sort((a, b) => b.predicted_impact - a.predicted_impact)[0]?.title || '';
    // b02a: live mention count + headline score, derived from the
    // per-platform results — the same derivation as recCount /
    // currentScore below (those consts are declared after this
    // callback, so it recomputes them from scan + results).
    const liveMentioned = results.filter(r => hasResponse(r) && r.mentioned).length;
    const liveScore = liveMentioned === 0 ? 0 : (scan.overall_score || 0);
    const cfg = getCountryConfig(scanCountryCode || scan.country_code || 'US');
    // ax80: one revenue model — revenueGapForScan over the platforms
    // that RESPONDED, same as the top-of-report and simulator blocks.
    const gap = revenueGapForScan({
      mentionedCount: liveMentioned,
      respondedPlatforms: results.filter(hasResponse).length,
      avgCustomerValue: getAvgCustomerValue(scan.industry ?? '', scanCountryCode || 'US'),
      monthlyAIInquiries: cfg.monthlyAIInquiries ?? 50,
    });
    setExecLoading(true);
    fetch('/api/report/executive-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: displayName,
        // b02a: the page's derived headline score (0 when nothing
        // mentioned you), not the raw stored score.
        score: liveScore,
        competitorName: scan.competitor_name || '',
        // b029: measured competitor score when the user scanned the
        // competitor (compScanData), else null — never own score + 20.
        competitorScore: compScanData?.score ?? null,
        mentionedCount: liveMentioned,
        industry: scan.industry || '', city: scan.location || '',
        countryCode: scanCountryCode || scan.country_code || 'US',
        topFix, revenueGap: gap, revenueSymbol: currency.revenueSymbol,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.bullets) && d.bullets.length) {
          setExecSummary(d.bullets);
          try { localStorage.setItem(key, JSON.stringify({ bullets: d.bullets, ts: Date.now() })); } catch { /* quota */ }
        }
      })
      .catch(() => {})
      .finally(() => setExecLoading(false));
  }, [scan, fixes, scanCountryCode, currency.revenueSymbol, results, compScanData]);

  // Item 7: request only once platform rows AND the fix queue have settled
  // successfully — the old effect fired as soon as the scan row loaded, so
  // a race could summarise (and cache for 24h) mentionedCount = 0.
  const execReady = shouldRequestExecSummary({
    resultsLoaded,
    platformError,
    fixesSettled: fixesReady || fixesError,
  });
  useEffect(() => {
    if (authLoading || !isPaid || !scan || !execReady) return;
    runExecSummary(false);
  }, [authLoading, isPaid, scan, execReady, runExecSummary]);

  // Plan/auth now come from usePlan() above. This effect only fetches competitor
  // history for the logged-in user (E3). Keyed on userId from usePlan().
  useEffect(() => {
    if (!userId) { setCompHistory([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: snapshots } = await supabase
          .from('competitor_snapshots')
          .select('your_score, competitor_score, recorded_at')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: true })
          .limit(6);
        if (!cancelled) setCompHistory(snapshots || []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // P0a: wait for auth to resolve before loading — the server route
  // derives the viewer from the session cookie, which must be settled.
  useEffect(() => {
    if (authLoading) return;
    async function loadReport() {
      setLoadError(false);
      setNotFound(false);
      setPlatformError(false);
      setResultsLoaded(false);
      try {
        // b0fm + ax8b: one server route (service role, session-aware)
        // returns the report already filtered for this viewer — locked
        // trust-signal details and full AI responses never reach a
        // logged-out browser, and owned scans 404 for anyone but the
        // owner. No anon-key table reads here any more.
        const res = await fetch(`/api/report/${encodeURIComponent(String(id))}`, { cache: 'no-store' });
        // ax70: 404 is "not found"; any other failure is a retryable load error.
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          console.error('Report load error:', res.status);
          setLoadError(true);
          setLoading(false);
          return;
        }
        const payload = (await res.json()) as ReportPayload;
        const scanData = payload.scan as unknown as Scan;
        if (!scanData) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setScan(scanData);
        setViewerTier(payload.viewer?.tier ?? 'anon');
        setViewerIsOwner(!!payload.viewer?.isOwner);

        // Resolve currency from scan's country — NOT the viewer's IP cookie.
        // This is the fix for "GB scan shows ₹ when viewed from India".
        const resolvedCode = resolveCountryForScan(
          scanData.country_code,
          scanData.location,
          scanData.input,
        );
        setScanCountryCode(resolvedCode);
        const resolvedCfg = getCountryConfig(resolvedCode);
        setCurrency({
          symbol: resolvedCfg.symbol,
          revenueSymbol: getRevenueSymbol(resolvedCfg),
          monthly: resolvedCfg.monthly,
        });

        // Report link slug for the share card (from the same payload).
        // b8b8: the old code hardcoded https://www.rankall.io — a share
        // link copied on STAGING pointed at PROD, where the scan does
        // not exist, so the recipient got a 404. The link now uses
        // the current origin (staging shares -> staging, prod -> prod).
        if (payload.shareSlug) {
          setShareSlug(payload.shareSlug);
          setShareLink(`${window.location.origin}/score/${payload.shareSlug}`);
        }

        // Item 8: a failed platform-rows load used to fall through to
        // 0/100, "no AI platforms responded" and the maximum revenue gap.
        // It now renders an honest load-error state (see below) instead.
        if (payload.resultsError) {
          console.error('Platform results load error');
          setPlatformError(true);
          setResults([]);
          setLoading(false);
          return;
        }
        setResults(payload.results || []);
        setResultsLoaded(true);

        if (scanData.trust_signals) {
          setTrustSignals(scanData.trust_signals);
        }

        setLoadingNarrative(true);
        try {
          const narrativeRes = await fetch('/api/gap-narrative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessInput: scanData.input,
              scanId: scanData.id,
              competitor: scanData.competitor_name,
              currentScore: scanData.overall_score,
              mentionedCount: scanData.mentioned_count,
              citationSources: scanData.citation_sources,
              platformCount: (payload.results || []).length || 12,
              trustSignals: scanData.trust_signals,
              country: scanCountryCode,
            }),
          });
          const narrativeData = await narrativeRes.json();
          if (narrativeData.success) {
            setGapNarrative(narrativeData.narrative);
          }
        } catch (err) {
          console.error('Gap narrative error:', err);
        }
        setLoadingNarrative(false);
        setLoading(false);
      } catch (err) {
        // ax70: a throw here (network, etc.) is a failed load, not a
        // missing report. The old code showed "Report not found" for it.
        console.error('Report load error:', err);
        setLoadError(true);
        setLoading(false);
      }
    }

    if (id) loadReport();
  }, [id, authLoading, userId, loadAttempt]);

  // b02c: keep `fixes` impact-ranked — the queue is labelled
  // "Ranked by predicted impact" and the #N badges + lock logic read
  // the position in `fixes` as the impact rank.
  const byImpactDesc = (arr: Fix[]) => [...arr].sort((a, b) => (b.predicted_impact || 0) - (a.predicted_impact || 0));

  // Generate personalised fixes once scan data is available.
  // P0e: generated_fixes is the single source of truth — read the scan's
  // persisted fixes first (deduped). Fall back to on-the-fly generation only
  // when the scan has none yet (e.g. generation failed).
  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    async function loadFixes() {
      setFixesLoading(true);
      setFixesError(false);
      // ax70: true only when a fetch returns real fixes. If neither fetch
      // does, the queue shows an error + Retry — never generic fallback
      // fixes with fake confidence.
      let gotRealFixes = false;
      try {
        const scanRes = await fetch(`/api/fixes/for-scan?scan_id=${id}`);
        const scanData = await scanRes.json();
        if (!cancelled && Array.isArray(scanData.fixes) && scanData.fixes.length > 0) {
          gotRealFixes = true;
          setFixes(byImpactDesc(scanData.fixes.map((r: UnifiedFix): Fix => ({
            id: r.id,
            title: r.fix_title || r.fix_type,
            description: r.why_recommended || (r.generated_content || '').slice(0, 400),
            predicted_impact: Number(r.predicted_impact) || 0,
            confidence: Number(r.confidence) || 0,
            effort: r.time_to_implement || '20 min',
            fix_type: r.fix_type,
            status: r.status === 'applied' ? 'applied' : 'pending',
            created_at: r.created_at,
            generated_fix_id: r.id,
          }))));
          if (!cancelled) { setFixesLoading(false); setFixesReady(true); }
          return;
        }
      } catch (err) {
        console.error('[for-scan] fetch error:', err);
      }
      try {
        const res = await fetch('/api/generate-fixes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessInput:  scan!.input,
            industry:       scan!.industry,
            location:       scan!.location,
            trustSignals:   scan!.trust_signals,
            citationSources: scan!.citation_sources,
            mentionedCount: scan!.mentioned_count,
            competitor:     scan!.competitor_name,
            overallScore:   scan!.overall_score,
            countryCode:    scanCountryCode,
            scanId:         id,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.fixes) && data.fixes.length > 0) {
          gotRealFixes = true;
          setFixes(byImpactDesc(data.fixes));
        }
      } catch (err) {
        console.error('[generate-fixes] fetch error:', err);
      }
      // ax70: neither fetch produced real fixes -> error state, not fake
      // fallback fixes. Clear the list so nothing stale renders as real.
      // b02c: fixesReady is set ONLY when real fixes arrived — never
      // from a failed load, so the projection surfaces below don't
      // render as if fixes existed.
      if (!cancelled) {
        if (!gotRealFixes) {
          setFixes([]);
          setFixesError(true);
        } else {
          setFixesReady(true);
        }
        setFixesLoading(false);
      }
    }
    loadFixes();
    return () => { cancelled = true; };
  }, [scan?.id, fixesRetry]);

  async function handleApplyFix(fix: Fix) {
    setApplyingFix(fix.id);
    setApplyError(prev => { const next = { ...prev }; delete next[fix.id]; return next; });
    try {
      // Canonical apply endpoint: writes fix_predictions (cron source) AND records
      // the verified_outcomes row so the Apply → Verify loop runs end to end.
      // ax70: the old code never checked the response — a 401/500 still
      // flipped the UI to 'applied'. Only flip on a successful response.
      const applyRes = await fetch('/api/fixes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_id: id,
          fix_type: fix.fix_type,
          fix_title: fix.title,
          predicted_impact: fix.predicted_impact,
          confidence: fix.confidence / 100,
          rescan_days: 7,
          generated_fix_id: fix.generated_fix_id,
        }),
      });
      const applyData = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok || applyData.ok === false) {
        throw new Error(applyData.error || `Apply failed (${applyRes.status})`);
      }

      // The n8n webhook is a notification, not the apply itself — its
      // failure must not undo a successful apply.
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_FIX_APPLIED;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scanId: id,
              fixType: fix.fix_type,
              fixTitle: fix.title,
              predictedImpact: fix.predicted_impact,
              appliedAt: new Date().toISOString(),
              businessInput: scan?.input,
              rescheduleIn: '7d',
            }),
          });
        } catch (webhookErr) {
          console.error('Fix-applied webhook error (non-fatal):', webhookErr);
        }
      }

      setFixes(prev => prev.map(f => f.id === fix.id ? { ...f, status: 'applied' } : f));
      setAppliedFix(fix.id);
    } catch (err) {
      // ax70: surface the failure on the fix instead of silently leaving
      // the fix un-applied with no explanation.
      console.error('Fix application error:', err);
      setApplyError(prev => ({ ...prev, [fix.id]: 'Could not mark this fix applied — check your connection and try again.' }));
    }
    setApplyingFix(null);
  }

  async function handleUndoFix(fix: Fix) {
    try {
      await supabase
        .from('fix_predictions')
        .update({ status: 'undone' })
        .eq('scan_id', id)
        .eq('fix_type', fix.fix_type);
      // P0e: also revert the generated_fixes row so the queue/badge stay in sync.
      if (fix.generated_fix_id) {
        await fetch('/api/fixes/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fix.generated_fix_id, action: 'pending_review' }),
        });
      }
      setFixes(prev => prev.map(f => f.id === fix.id ? { ...f, status: 'pending' } : f));
      if (appliedFix === fix.id) setAppliedFix(null);
    } catch (err) {
      console.error('Undo fix error:', err);
    }
  }

  function copyToClipboard(text: string, fixId: string) {
    const done = () => {
      setCopiedFixId(fixId);
      setTimeout(() => setCopiedFixId(null), 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        execCommandCopy(text);
        done();
      });
    } else {
      execCommandCopy(text);
      done();
    }
  }

  function execCommandCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }

  async function handleGenerateFix(fix: Fix) {
    if (generatedContent[fix.id]) {
      setShowContent(showContent === fix.id ? null : fix.id);
      return;
    }
    setGeneratingFix(fix.id);
    try {
      const res = await fetch('/api/generate-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixType: fix.fix_type,
          businessInput: scan?.input,
          industry: scan?.industry,
          location: scan?.location,
          countryCode: scanCountryCode,
        }),
      });
      const data = await res.json();
      // b0fk: success must not be claimed without generated content — the
      // API used to return success:true with content '' (missing key),
      // which flipped the button to 'Hide content' with nothing to show.
      if (data.success && typeof data.content === 'string' && data.content.trim()) {
        setGeneratedContent(prev => ({ ...prev, [fix.id]: data.content }));
        if (data.metadata) setFixMetadata(prev => ({ ...prev, [fix.id]: data.metadata }));
        if (data.warning) setFixWarning(prev => ({ ...prev, [fix.id]: data.warning }));
        setFixError(prev => { const next = { ...prev }; delete next[fix.id]; return next; });
        setShowContent(fix.id);
      } else {
        // ax70: API success:false used to leave no error state — the button
        // just stopped spinning. Surface the failure on the fix.
        setFixError(prev => ({ ...prev, [fix.id]: data.error || 'Could not generate this fix. Try again.' }));
      }
    } catch (err) {
      // ax70: a network throw used to log only. Surface it on the fix.
      console.error('Generate fix error:', err);
      setFixError(prev => ({ ...prev, [fix.id]: 'Could not generate this fix — check your connection and try again.' }));
    }
    setGeneratingFix(null);
  }

  async function handleSpendAnalysis() {
    if (!scan) return;
    const total = [spendGoogle, spendMeta, spendSeo, spendReviews, spendDirs, spendOther]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (total === 0) return;
    setSpendLoading(true);
    setSpendError(null);
    setSpendAnalysis(null);
    try {
      const res = await fetch('/api/intelligence/spend-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleAds:        parseFloat(spendGoogle)  || 0,
          metaAds:          parseFloat(spendMeta)    || 0,
          seoAgency:        parseFloat(spendSeo)     || 0,
          reviewManagement: parseFloat(spendReviews) || 0,
          directories:      parseFloat(spendDirs)    || 0,
          otherMarketing:   parseFloat(spendOther)   || 0,
          scanData: {
            score:        scan.overall_score,
            industry:     scan.industry,
            city:         scan.location,
            competitor:   scan.competitor_name,
            trustSignals: scan.trust_signals ?? null,
            scanId:       scan.id,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Analysis failed');
      setSpendAnalysis(data.analysis);
      setSpendContext(data.context);
    } catch (e) {
      setSpendError(String(e));
    }
    setSpendLoading(false);
  }

  async function handleCompetitorScan() {
    if (!scan?.competitor_name) return;
    setCompScanLoading(true);
    setCompScanError(null);
    setCompScanData(null);
    try {
      const query = `${scan.competitor_name}${scan.location ? ` in ${scan.location}` : ''}${scan.industry ? ` ${scan.industry}` : ''}`;
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Scan failed');
      const platforms: Array<{ platform: string; mentioned: boolean }> = (data.analysis ?? []).map(
        (a: { platform: string; mentioned: boolean }) => ({ platform: a.platform, mentioned: a.mentioned })
      );
      setCompScanData({ score: data.overallScore ?? 0, mentioned: data.mentionedCount ?? 0, platforms });
    } catch (e) {
      setCompScanError(String(e));
    }
    setCompScanLoading(false);
  }

  // Item 2: an OWNED scan's public share surfaces (/score/<slug>, /r/<id>,
  // badge) only render once the owner explicitly shares it. Copying or
  // posting the share link is that explicit act — publish first. Ownerless
  // scans need nothing (their share page is already public). Best-effort:
  // a failure leaves the scan private, never exposes it.
  function publishShare() {
    if (!viewerIsOwner || !scan?.id) return;
    fetch(`/api/report/${encodeURIComponent(scan.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'share' }),
    }).catch(() => { /* stays private */ });
  }

  async function copyShareLink() {
    if (!shareLink) return;
    publishShare();
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareLink;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  }

  async function downloadCard() {
    const el = document.getElementById('score-share-card');
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true });
      const link = document.createElement('a');
      link.download = 'ai-visibility-score.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('Download failed. Try right-clicking the card to save it.');
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: GRAY, fontSize: 15 }}>Loading report...</p>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Report not found</p>
        <p style={{ color: GRAY }}>This report may have expired or the link is incorrect.</p>
      </div>
    </div>
  );

  // ax70: a failed load is retryable — never present it as a dead link.
  if (loadError) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 20px' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Couldn&apos;t load this report</p>
        <p style={{ color: GRAY, marginBottom: 20 }}>The request failed — your report is still there. Check your connection and try again.</p>
        <button onClick={() => { setLoading(true); setLoadAttempt(a => a + 1); }} style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          Retry
        </button>
      </div>
    </div>
  );

  // Item 8: the per-platform rows failed to load. Every number on this
  // report (score, "platforms responded", revenue at stake) derives from
  // them, so rendering the page would show 0/100 + "no AI platforms
  // responded" + the maximum revenue gap — all false. Show an honest,
  // retryable error instead.
  if (platformError) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 440, padding: '0 20px' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Couldn&apos;t load this report&apos;s platform results</p>
        <p style={{ color: GRAY, marginBottom: 20 }}>Your scan is saved, but the per-platform results failed to load, so the score can&apos;t be shown accurately right now. Try again in a moment.</p>
        <button onClick={() => { setLoading(true); setLoadAttempt(a => a + 1); }} style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          Retry
        </button>
      </div>
    </div>
  );

  const totalPlatformsScanned = results.length || 12;

  // ax71: fix queue split — 'Do it yourself' (Easy) first, then 'Send to
  // your web person' (Medium/Hard/unknown difficulty). Within each group
  // the impact ranking is preserved (filter keeps the API's order). The
  // queue render maps orderedFixes but resolves each fix's GLOBAL index
  // for the lock logic and the #N rank badge, so gating is unchanged.
  const fixGroup = (fixType: string | undefined) => getFixMetadata(fixType ?? '').difficulty === 'Easy' ? 'diy' : 'web';
  const orderedFixes = [...fixes.filter(f => fixGroup(f.fix_type) === 'diy'), ...fixes.filter(f => fixGroup(f.fix_type) !== 'diy')];

  // ── PERSONAL PRO LAYOUT ───────────────────────────────────────────────
  const isPersonalScan = scan?.intent_type === 'personal_pro';

  if (isPersonalScan) {
    const score = scan?.overall_score ?? 0;
    const mentionedCount = scan?.mentioned_count ?? 0;
    const isLocalProUser = isLoggedIn && isPaid && isBusinessPlan(plan);
    const isPersonalProUser = isLoggedIn && isPaid && (isAdmin || isPersonalTier(plan));
    const platformList = results.map(r => ({ platform: r.platform, mentioned: r.mentioned }));

    // Fix access logic
    const fixUnlocked = (fixIdx: number) => {
      if (fixIdx === 0) return true; // Fix 1 always free
      if (isPersonalProUser) return true;
      return false;
    };

    const fixCTA = () => {
      if (!isLoggedIn) return { text: <>Create free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>, href: '/signup' };
      if (!isPaid) return { text: <>Upgrade to Personal Brand $15/month <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>, href: '/pricing?plan=personal_pro' };
      return null;
    };

    const cta = fixCTA();

    // ax9d: generic best-practice list, NOT scan-derived — the queue subtitle says so.
    const PERSONAL_FIXES = [
      { label: 'Create/claim Google Knowledge Panel', free: true },
      { label: 'Wikipedia/Wikidata entity page', free: false },
      { label: 'LinkedIn optimization for AI', free: false },
      { label: 'Press mentions strategy', free: false },
      { label: 'Podcast appearances guide', free: false },
    ];

    const PURPLE = '#1B17FF';

    return (
      <div style={{ background: '#F6F6FB', minHeight: '100vh', color: '#0A0A14', fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E7F0', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <Logo variant="dark" height={26} />
            </a>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 100, padding: '5px 14px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1B17FF' }}>Personal Brand Report</span>
            </div>
          </div>
        </div>

        {/* Local Pro banner */}
        {isLocalProUser && (
          <div style={{ background: '#ECEBFF', borderBottom: '1px solid #C9C6FF', padding: '14px 24px' }}>
            <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#1B17FF' }}>
                You scanned a personal brand. <strong>Personal Brand ($15/month)</strong> unlocks full personal brand analysis.
              </p>
              <a href="/pricing?plan=personal_pro" style={{ background: PURPLE, color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>Add Personal Brand <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
            </div>
          </div>
        )}

        <div style={{ maxWidth: 820, margin: '0 auto', padding: '36px 24px' }}>

          {/* Score hero */}
          <div style={{ background: '#FFFFFF', border: '1.5px solid #E7E7F0', borderRadius: 20, padding: '36px', marginBottom: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Personal Brand Score</p>
            <div style={{ fontSize: 80, fontWeight: 900, color: PURPLE, lineHeight: 1, marginBottom: 8 }}>{score}</div>
            <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 16 }}>/ 100</p>
            <p style={{ fontSize: 15, color: '#55556A', lineHeight: 1.6, marginBottom: 0 }}>
              Recognized on <strong style={{ color: '#0A0A14' }}>{mentionedCount} of {totalPlatformsScanned} platforms</strong>{mentionedCount > 0 && <> ({Math.round((mentionedCount / totalPlatformsScanned) * 100)}%)</>}
            </p>
          </div>

          {/* Platform recognition */}
          {platformList.length > 0 && (
            <div style={{ background: '#FFFFFF', border: '1.5px solid #E7E7F0', borderRadius: 16, padding: '28px', marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#0A0A14', marginBottom: 16 }}>Platform Recognition</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {platformList.map(p => (
                  <div key={p.platform} style={{
                    background: p.mentioned ? '#ECFDF5' : '#F8FAFC',
                    border: `1.5px solid ${p.mentioned ? '#6EE7B7' : '#E7E7F0'}`,
                    borderRadius: 10, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 14, display: 'inline-flex', color: p.mentioned ? '#16a34a' : '#DC2626' }}>{p.mentioned ? <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> : <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: p.mentioned ? '#059669' : '#64748B' }}>{p.platform}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personal fix queue */}
          <div style={{ background: '#FFFFFF', border: '1.5px solid #E7E7F0', borderRadius: 16, padding: '28px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0A0A14', marginBottom: 6 }}>Personal Brand Fix Queue</p>
            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 20 }}>General recommendations for personal brands — these are not derived from this scan.</p>
            {PERSONAL_FIXES.map((fix, i) => {
              const unlocked = fixUnlocked(i);
              return (
                <div key={i} style={{
                  background: unlocked ? '#ECFDF5' : '#F8FAFC',
                  border: `1.5px solid ${unlocked ? '#6EE7B7' : '#E7E7F0'}`,
                  borderRadius: 12, padding: '16px 20px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: unlocked ? '#16A34A' : '#E7E7F0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{i + 1}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: unlocked ? '#059669' : '#64748B', margin: 0 }}>
                        {fix.label}
                      </p>
                      <p style={{ fontSize: 11, color: '#4B5563', margin: '2px 0 0' }}>
                        {fix.free ? 'Free — do this now' : 'Personal Brand unlock'}
                      </p>
                    </div>
                  </div>
                  {!unlocked && cta && (
                    <a href={cta.href} style={{
                      background: PURPLE, color: '#fff', borderRadius: 8, padding: '7px 14px',
                      fontSize: 11, fontWeight: 700, textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap',
                    }}>{cta.text}</a>
                  )}
                  {unlocked && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', flexShrink: 0 }}>Unlocked</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reputation box removed (ax9d): "No negative signals detected"
              asserted a measurement with no sentiment / negative-signal data
              source anywhere in this file. Do not re-add without a real source. */}

          {/* Peer comparison placeholder */}
          <div style={{ background: '#FFFFFF', border: '1.5px dashed #E7E7F0', borderRadius: 16, padding: '32px', marginBottom: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 22, margin: "0 0 10px", color: NAVY }}><svg viewBox="0 0 640 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.7C0 239.8 47.8 192 106.7 192l42.7 0c15.9 0 31 3.5 44.6 9.7c-1.3 7.2-1.9 14.7-1.9 22.3c0 38.2 16.8 72.5 43.3 96c-.2 0-.4 0-.7 0L21.3 320C9.6 320 0 310.4 0 298.7zM405.3 320c-.2 0-.4 0-.7 0c26.6-23.5 43.3-57.8 43.3-96c0-7.6-.7-15-1.9-22.3c13.6-6.3 28.7-9.7 44.6-9.7l42.7 0C592.2 192 640 239.8 640 298.7c0 11.8-9.6 21.3-21.3 21.3l-213.3 0zM224 224a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zM128 485.3C128 411.7 187.7 352 261.3 352l117.3 0C452.3 352 512 411.7 512 485.3c0 14.7-11.9 26.7-26.7 26.7l-330.7 0c-14.7 0-26.7-11.9-26.7-26.7z"/></svg></p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0A0A14', margin: '0 0 6px' }}>Peer Comparison</p>
            <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, margin: '0 0 16px' }}>
              See how you rank among other {scan?.industry || 'professionals'} in your field on AI platforms.
            </p>
            {!isPersonalProUser && cta && (
              <a href={cta.href} style={{ background: PURPLE, color: '#fff', borderRadius: 10, padding: '11px 24px', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                {cta.text}
              </a>
            )}
            {isPersonalProUser && (
              <a href="/dashboard/personal-brand" style={{ background: PURPLE, color: '#fff', borderRadius: 10, padding: '11px 24px', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                View Full Dashboard <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
            )}
          </div>

        </div>
      </div>
    );
  }

  const successResults = results.filter(hasResponse);
  // Partial-scan detection: if the saved platform_results expose which platforms
  // responded, derive "completed of 12" + the platforms that failed. A scan is
  // considered partial when fewer than 12 platforms returned a usable response.
  // Falls back to any stored partial flag on the scan row; renders nothing when
  // the data isn't available.
  const PARTIAL_TOTAL_PLATFORMS = totalPlatformsScanned;
  const failedPlatformNames = results
    .filter(r => !hasResponse(r) && (r.error || r.error === ''))
    .map(r => r.platform)
    .filter(Boolean);
  const completedPlatformCount = successResults.length;
  const storedPartialFlag = (scan as any)?.partial === true;
  // ax9c: the old condition also required results.length < total, but
  // saveScan always writes one row per platform (failed ones included), so
  // results.length is always the total and the banner could NEVER fire.
  // Partial = at least one platform responded, at least one did not.
  const isPartialScan =
    storedPartialFlag ||
    (results.length > 0 && completedPlatformCount > 0 && completedPlatformCount < PARTIAL_TOTAL_PLATFORMS);
  const scanDate = scan ? new Date(scan.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '';
  const totalPredictedImpact = fixes.reduce((sum, f) => sum + f.predicted_impact, 0);
  // Live count of platforms that actually mentioned the business, derived from
  // successResults — the same source the score-breakdown panel's table uses.
  // scan?.mentioned_count is a stored column that can go stale relative to the
  // live per-platform results, so both surfaces read from recCount instead.
  const recCount = successResults.filter(r => r.mentioned).length;
  // b02a: appearedOn derives from the live per-platform results, not
  // the stored mentioned_count column, which can go stale relative to
  // the rows and silently diverge every downstream number.
  const appearedOn = recCount;
  const rawScore = scan?.overall_score || 0;
  const currentScore = appearedOn === 0 ? 0 : rawScore;
  // Cap the projection at the shared MAX_SCORE_CAP (lib/simulator.ts) — a
  // perfect 100/100 is unrealistic and erodes trust. Item 4: imported, never
  // a literal here, so the report and simulator can't drift apart.
  // b02b: one projection formula/cap — this is the simulator engine's
  // max endpoint (current + full fix-impact sum, 85 cap; see
  // MAX_SCORE_CAP in lib/simulator.ts). The simulator shows the full
  // 75%–100% range; this card shows its top end, so the two surfaces
  // cannot disagree the way 85 vs 93–100 did.
  const predictedScore = projectScore(currentScore, totalPredictedImpact);
  // b8b2: when the projection cap binds, the per-fix gains (+4, +25…)
  // sum to MORE than the projected total (+1) — the first pass read
  // that as a contradiction. It is the cap: name it where the
  // projection is shown (the "Apply all" line below).
  const projectionCapBinds = totalPredictedImpact > 0 && currentScore + totalPredictedImpact > predictedScore;
  const projectionCap = effectiveCap(currentScore);
  // ax7x: the share comes from the live per-platform results (recCount),
  // not the stored column (which can go stale relative to the results —
  // the same staleness the recCount comment above guards against).
  // No x40 scale, no 71 cap.
  const shareMentions = successResults.length > 0 ? recCount : (scan?.mentioned_count ?? 0);
  const recommendationShare = Math.round(shareMentions / 12 * 100);
  // ax7x (residual): the competitor share is MEASURED from the
  // competitor scan (compScanData.mentioned), NOT the complement
  // (100 - yours). The complement fabricates share: if you're on
  // 2/12 (17%) and the competitor on 5/12 (42%), the other 41% is
  // neither — not the competitor's. Without a competitor scan the
  // share is null ("Not measured"), never invented. (The revenue
  // model's lost-share complement in revenueGapBreakdown below is
  // a different concept — responding platforms that don't recommend you.)
  const competitorShare = compScanData ? Math.round(compScanData.mentioned / 12 * 100) : null;

  // ── Phase 19: derived values for the top-of-report intelligence sections ──
  const revCfg = getCountryConfig(scanCountryCode || scan?.country_code || 'US');
  const avgValueTop = getAvgCustomerValue(scan?.industry ?? '', scanCountryCode || 'US');
  const monthlyInquiriesTop = revCfg.monthlyAIInquiries ?? 50;
  // ax80: one revenue model — revenueGapForScan (lostShare = 1 − mentioned/responded).
    // This block previously used the named competitor's REAL mention count
    // (compScanData) while the exec summary and simulator used the
    // complement, so one scan showed two different gaps ($5,652 vs $6,109).
    const revenueGapTop = revenueGapForScan({
      mentionedCount: appearedOn,
      respondedPlatforms: completedPlatformCount,
      avgCustomerValue: avgValueTop,
      monthlyAIInquiries: monthlyInquiriesTop,
    });
  // b029: measured competitor score only — the old fallback
  // (own score + share gap) invented a competitor score.
  const competitorScoreEst = compScanData?.score ?? null;
  const biggestOpportunity = [...fixes].sort((a, b) => b.predicted_impact - a.predicted_impact)[0];
  const industryLabel = scan?.industry || 'your industry';
  const cityLabel = scan?.location || 'your area';
  const biggestRiskText =
    (competitorScoreEst != null && competitorScoreEst > currentScore + 20)
      ? `Your competitor has a significant lead across AI platforms and is actively capturing customers searching for ${industryLabel} in ${cityLabel}.`
      : currentScore < 30
        ? `Your business is invisible on most AI platforms. When customers ask AI for ${industryLabel} in ${cityLabel}, you are not being recommended.`
        : appearedOn < 3
          ? `You appear on only ${appearedOn} of ${PARTIAL_TOTAL_PLATFORMS} AI platforms. The majority of AI-driven customer searches in your market are sending customers elsewhere.`
          : `Your AI visibility is below the threshold needed to consistently win recommendations over your competitor.`;

  const signalStatusColor = (status: string) => {
    if (status === 'good') return GREEN;
    if (status === 'warning') return AMBER;
    if (status === 'not_checked') return GRAY;
    return RED;
  };

  const impactBg = (impact: string) => {
    if (impact === 'high') return { bg: '#FEF2F2', border: '#FCA5A5', color: RED };
    if (impact === 'medium') return { bg: '#FFFBEB', border: '#FCD34D', color: AMBER };
    return { bg: BG, border: BORDER, color: GRAY };
  };

  // b0fm: logged-out payloads carry only these two statuses (summary), not
  // the full technical signal list.
  const faqStatus = trustSignals?.summary ? trustSignals.summary.faqSchema : trustSignals?.technical?.find(s => s.name === 'FAQ Schema')?.status;
  const lbStatus = trustSignals?.summary ? trustSignals.summary.localBusinessSchema : trustSignals?.technical?.find(s => s.name === 'LocalBusiness JSON-LD')?.status;
  const youRows = [
    { label: 'AI Platform Coverage', value: `${recommendationShare}%`, good: recommendationShare >= 70 },
    { label: 'Trust Score', value: `${trustSignals?.overall ?? 0}/100`, good: (trustSignals?.overall ?? 0) >= 60 },
    { label: 'Platforms Mentioning You', value: `${appearedOn} of 12`, good: appearedOn >= 6 },
    { label: 'AI-Readable FAQ', value: faqStatus === 'good' ? 'Present' : faqStatus === 'not_checked' ? 'Not checked' : 'Missing', good: faqStatus === 'good' },
    { label: 'AI Business Profile', value: lbStatus === 'good' ? 'Present' : lbStatus === 'not_checked' ? 'Not checked' : 'Missing', good: lbStatus === 'good' },
    { label: 'Citation Sources', value: `${scan?.citation_sources?.length || 0} found`, good: (scan?.citation_sources?.length || 0) >= 3 },
  ];

  // ax7z: the competitor column was entirely hardcoded fantasy
  // ('85%+', '65+/100', '7-9 of 9', 'Likely present', '5+ found') — none
  // of it measured. Now: real competitor-scan data when we have it,
  // honest 'Not measured' otherwise. Denominator is 11 (the full platform
  // set), never the partial-scan count.
  const competitorRows = [
    { label: 'AI Platform Coverage', value: compScanData ? `${Math.round(compScanData.mentioned / 12 * 100)}%` : 'Not measured' },
    { label: 'Trust Score', value: 'Not measured' },
    { label: 'Platforms Mentioning Them', value: compScanData ? `${compScanData.mentioned} of 12` : 'Not measured' },
    { label: 'AI-Readable FAQ', value: 'Not measured' },
    { label: 'AI Business Profile', value: 'Not measured' },
    { label: 'Citation Sources', value: 'Not measured' },
  ];

  return (
    <div style={{ background: BG, minHeight: '100vh', color: NAVY, fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif", paddingBottom: !isLoggedIn && !authLoading ? 80 : 0 }}>
      <style>{`
        .fix-card:hover { border-color: #C9C6FF !important; box-shadow: 0 4px 16px rgba(27,23,255,0.08) !important; }
        .apply-btn:hover { background: #1D4ED8 !important; transform: translateY(-1px); }
        .gen-btn:hover { color: #1B17FF !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .platform-tabs { flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .platform-tabs::-webkit-scrollbar { display: none; }
          .platform-tabs button { flex-shrink: 0; }
          .fix-card { width: 100% !important; box-sizing: border-box !important; }
        }
      `}</style>

      {/* HEADER */}
      <div style={{ background: W, borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <Logo variant="dark" height={26} />
            </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '5px 14px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: GREEN }}>AI Visibility Report</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 24px' }}>

        {/* SCORE CARD */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>AI Visibility Report</p>
          <h1 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, color: NAVY, marginBottom: 6 }}>{displayName}</h1>
          <p style={{ fontSize: 13, color: LGRAY, marginBottom: 16 }}>Scanned {scanDate}</p>
          {scan && <AddToLinkedInQueue scan={scan} displayName={displayName} />}
          {scan && <ExportCsvButton scanId={scan.id} />}
          {successResults.length === 0 && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#991B1B', margin: 0 }}>This scan could not be measured — no AI platforms responded.</p>
              <p style={{ fontSize: 13, color: '#7F1D1D', margin: '6px 0 0' }}>The scores below are not meaningful. Run a new scan for a real result.</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
            {/* THE single headline metric — overall_score (Phase 18 weighted
                recommendation score), shown as /100, not the old coverage %. */}
            <div style={{ textAlign: 'center', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 16px' }}>
              <p style={{ fontSize: 44, fontWeight: 900, color: BLUE, lineHeight: 1, marginBottom: 4 }}>{currentScore}<span style={{ fontSize: 20, color: GRAY }}>/100</span></p>
              <p style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>AI Visibility Score</p>
              <p style={{ fontSize: 11, color: GRAY, marginTop: 6, lineHeight: 1.4 }}>
                {framingText(shareMentions, scan?.competitor_name, compScanData?.mentioned)}
              </p>
            </div>
            <div style={{ textAlign: 'center', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 16px' }}>
              <p style={{ fontSize: 44, fontWeight: 900, color: BLUE, lineHeight: 1, marginBottom: 4 }}>{successResults.length}<span style={{ fontSize: 20, color: GRAY }}> of {PARTIAL_TOTAL_PLATFORMS}</span></p>
              <p style={{ fontSize: 12, color: GRAY, fontWeight: 600 }}>Platforms Responded</p>
            </div>
            <div style={{ textAlign: 'center', background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 14, padding: '20px 16px' }}>
              <p style={{ fontSize: 44, fontWeight: 900, color: GREEN, lineHeight: 1, marginBottom: 4 }}>{fixesError ? '—' : fixesReady ? predictedScore : '\u2026'}</p>
              <p style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>After fixes (projected)</p>
            </div>
            {trustSignals && (
              <div style={{ textAlign: 'center', background: '#ECEBFF', border: '1.5px solid #DCDAFF', borderRadius: 14, padding: '20px 16px' }}>
                <p style={{ fontSize: 44, fontWeight: 900, color: scoreCol(trustSignals.overall), lineHeight: 1, marginBottom: 4 }}>{trustSignals.overall}<span style={{ fontSize: 20, color: GRAY }}>/100</span></p>
                <p style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>Trust Layer Health</p>
              </div>
            )}
          </div>

          {/* Shareable score card — public endpoint, works logged-out too.
              b8b7: the card loads the scan server-side from scan_id —
              client-supplied ?score= params are gone (anyone could mint
              a "score 100" card). */}
          <a
            href={`/score-card?scan_id=${encodeURIComponent(String(id))}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1B17FF', color: 'white', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600, marginTop: 16 }}
          >
            <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Download Score Card
          </a>

          {/* Social share buttons — visible to every visitor, logged in or out,
              free or paid. Everyone can share their score. */}
          {(() => {
            const shareText = encodeURIComponent(
              `My AI Visibility Score is ${currentScore}/100. ` +
              `Is your business visible on ChatGPT, Gemini + 9 AI platforms? ` +
              `Check your score free at rankall.io`
            );
            const shareUrl = encodeURIComponent(shareLink || `https://www.rankall.io/report/${id}`);
            return (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <a
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                  onClick={publishShare}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#000000', color: 'white', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                  𝕏 Share on X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                  onClick={publishShare}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0077b5', color: 'white', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                  in Share on LinkedIn
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  onClick={publishShare}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1877f2', color: 'white', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                >
                  f Share on Facebook
                </a>
              </div>
            );
          })()}

          {isPartialScan && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E', marginTop: 8, marginBottom: 12 }}>
              <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg> {completedPlatformCount} of {PARTIAL_TOTAL_PLATFORMS} platforms completed.{failedPlatformNames.length > 0 ? ` ${failedPlatformNames.join(', ')} ${failedPlatformNames.length === 1 ? 'is' : 'are'} temporarily unavailable.` : ' Some platforms were temporarily unavailable.'}
            </div>
          )}

          {/* P0b: score explanation panel — collapsible. One formula everywhere:
              canonical weights from lib/platforms.ts, fractional impacts, and the
              responding-weight normalization shown explicitly. Derives everything
              from data already on the page. No new API/DB calls. */}
          {(() => {
            // P0b: one formula everywhere. Weights come from lib/platforms.ts
            // (canonical single source — includes future platforms like Meta AI,
            // so the hardcoded map is gone). Impacts are fractional
            // (weight x mentionRate). ax9d: the '=' line below only renders
            // when the live-row recomputation matches the recorded (stored)
            // score within rounding — a stored score and a live recomputation
            // can diverge (rows change after the scan, weights evolve), and a
            // false equation is worse than showing both numbers honestly.
            const CANONICAL_WEIGHTS: Record<string, number> = Object.fromEntries(
              PLATFORMS.map(p => [p.name, p.weight]),
            );
            const rows = successResults.map(r => {
              const weight = CANONICAL_WEIGHTS[r.platform] ?? r.weight ?? 0;
              const mentionRate =
                typeof r.mention_rate === 'number' ? r.mention_rate : r.mentioned ? 1 : 0;
              return { platform: r.platform, weight, mentionRate };
            });
            const respondingWeight = rows.reduce((s, r) => s + r.weight, 0);
            const weightedPoints = rows.reduce((s, r) => s + r.weight * r.mentionRate * 100, 0);
            const recomputedScore = respondingWeight > 0 ? weightedPoints / respondingWeight : 0;
            const reconciles = Math.round(recomputedScore) === currentScore;
            const resultLabel = (mr: number) =>
              mr >= 0.75 ? <><svg viewBox="0 0 512 512" width="12" height="12" fill="#16a34a" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Recommended</> : mr > 0 ? <><svg viewBox="0 0 512 512" width="12" height="12" fill="#D97706" aria-hidden="true"><path d="M448 256c0-106-86-192-192-192l0 384c106 0 192-86 192-192zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg> Partly mentioned</> : <><svg viewBox="0 0 512 512" width="12" height="12" fill="#DC2626" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg> Not mentioned</>;
            return (
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setShowScoreExplain(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                >
                  <span><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg> How is this score calculated?</span>
                  <span style={{ marginLeft: 'auto', color: GRAY, display: 'inline-flex' }}>{showScoreExplain ? <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> : <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>}</span>
                </button>
                {showScoreExplain && (
                  <div style={{ border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px', fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
                    <p style={{ marginBottom: 12 }}>
                      Your AI Visibility Score reflects how often AI platforms recommend your
                      business when customers search for {scan?.industry || 'your category'}
                      {scan?.location ? ` in ${scan.location}` : ''}.
                    </p>
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>Score breakdown</p>
                    <ul style={{ margin: '0 0 12px 18px', color: GRAY }}>
                      <li>{completedPlatformCount} of {PARTIAL_TOTAL_PLATFORMS} platforms responded</li>
                      <li>Appeared on {recCount} of {PARTIAL_TOTAL_PLATFORMS} AI platforms</li>
                      {respondingWeight === 0 ? (
                        <li>No platforms responded, so no score could be computed from this scan.</li>
                      ) : reconciles ? (
                        <li>Weighted score: {weightedPoints.toFixed(1)} pts ÷ {respondingWeight.toFixed(2)} responding weight = {(weightedPoints / respondingWeight).toFixed(1)}%, rounded to <strong style={{ color: NAVY }}>{currentScore}%</strong></li>
                      ) : (
                        <li>Recorded score: <strong style={{ color: NAVY }}>{currentScore}%</strong> — the breakdown below recomputes to {recomputedScore.toFixed(1)}% from live platform rows; the recorded score is the scan&apos;s stored result.</li>
                      )}
                      <li style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
                        Score reflects how prominently AI recommends you, not just whether you appear.
                      </li>
                    </ul>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: GRAY }}>
                            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>Platform</th>
                            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>Weight</th>
                            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>Result</th>
                            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => {
                            const pts = r.weight * r.mentionRate * 100;
                            const tone = r.mentionRate >= 0.75 ? GREEN : r.mentionRate > 0 ? '#b45309' : GRAY;
                            return (
                              <tr key={r.platform}>
                                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}><PlatformBadge platform={r.platform} size="sm" /></td>
                                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}` }}>{Math.round(r.weight * 100)}%</td>
                                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}`, color: tone }}>{resultLabel(r.mentionRate)}{r.mentionRate > 0 && r.mentionRate < 0.75 ? ` (${Math.round(r.mentionRate * 100)}%)` : ''}</td>
                                <td style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}`, color: tone }}>+{pts.toFixed(1)} pts</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ marginTop: 12, color: GRAY, fontSize: 12 }}>
                      Platforms that timed out or failed are excluded from your score — your
                      score only reflects platforms that actually responded.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{ background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
            <p style={{ fontSize: 14, color: NAVY, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
              {scoreWithOutcome(currentScore, recCount, PARTIAL_TOTAL_PLATFORMS, completedPlatformCount)}
            </p>
          </div>
          {/* b0fj: the old unconditional line read 'Apply all 0 fixes' while
              the queue was still loading / had failed. Only show it once
              there are fixes to apply. */}
          {fixes.length > 0 && (
          <div style={{ background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 12, padding: '14px 18px' }}>
            <p style={{ fontSize: 13, color: BLUE, fontWeight: 600, margin: 0 }}>
              Apply all {fixes.length} fixes → estimated score {currentScore} → {fixesReady ? predictedScore : '\u2026'} once AI platforms refresh (their timing, not ours — Rankall rescans to verify){fixesReady && projectionCapBinds ? ` — individual fix gains sum to +${Math.round(totalPredictedImpact)}, projection capped at ${projectionCap}` : ''}
            </p>
          </div>
          )}
        </div>

        {/* ═══════ PHASE 19: REPORT INTELLIGENCE (top-of-report summary) ═══════ */}

        {/* SECTION 1 — EXECUTIVE SUMMARY */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E7E7F0', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M192 0c-41.8 0-77.4 26.7-90.5 64L64 64C28.7 64 0 92.7 0 128L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64l-37.5 0C269.4 26.7 233.8 0 192 0zm0 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM72 272a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm104-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zM72 368a24 24 0 1 1 48 0 24 24 0 1 1 -48 0zm88 0c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg> Your Situation at a Glance</p>
          {isPaid ? (
            <>
              {execLoading && !execSummary && <p style={{ color: '#94a3b8', fontSize: 14 }}>Generating your consultant summary…</p>}
              {(execSummary ?? []).map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <span style={{ color: '#1B17FF', flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 14, color: '#0A0A14', lineHeight: 1.6 }}>{line}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>Generated by Rankall AI</span>
                <button onClick={() => runExecSummary(true)} disabled={execLoading} style={{ background: 'transparent', color: '#1B17FF', border: '1px solid #1B17FF', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: execLoading ? 'default' : 'pointer' }}>
                  {execLoading ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </>
          ) : (
            // ax9d: the old blurred block showed three hardcoded bullets that
            // read as this scan's real summary behind a blur. The teaser now
            // describes what the summary contains — no fabricated content.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 14, color: '#0A0A14', lineHeight: 1.6, margin: 0 }}>
                Your AI consultant summary explains your score in plain language: your biggest gap, why it matters, and the single fastest win.
              </p>
              <div>
                <a href={isLoggedIn ? '/pricing?plan=business' : '/signup'} style={{ background: '#1B17FF', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Upgrade to see your AI consultant summary <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2 — BIGGEST OPPORTUNITY (deterministic, from fix queue; gated on fixesReady so it never renders before real fixes arrive) */}
        {fixesReady && biggestOpportunity && (
          <div style={{ background: W, border: `1px solid ${BORDER}`, borderLeft: '4px solid #22c55e', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"/></svg> Biggest Opportunity</p>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>{biggestOpportunity.title}</h3>
            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 12px' }}>Free · {biggestOpportunity.effort || '20 minutes'}</p>
            <p style={{ fontSize: 14, color: NAVY, lineHeight: 1.6, margin: '0 0 16px' }}>
              Implementing this fix is projected to improve your score by +{biggestOpportunity.predicted_impact} points and increase the number of AI platforms that recommend you.
            </p>
            <a href={`/dashboard/fix?signal=${biggestOpportunity.fix_type}`} style={{ display: 'inline-block', background: '#22c55e', color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Get Fix Code <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
          </div>
        )}

        {/* SECTION 3 — BIGGEST RISK (deterministic) */}
        <div style={{ background: W, border: `1px solid ${BORDER}`, borderLeft: '4px solid #ef4444', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Biggest Risk</p>
          <p style={{ fontSize: 14, color: NAVY, lineHeight: 1.6, margin: '0 0 12px' }}>{biggestRiskText}</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 6px' }}>Estimated monthly revenue at stake: <strong style={{ color: '#dc2626' }}>{SYM}{revenueGapTop.toLocaleString()}/month</strong></p>
          {(() => {
            // b0fg: show the full chain behind the gap — the bare number
            // vs the displayed inputs (inquiries x value) looked 10x off
            // because the 10% conversion assumption was unstated.
            const bd = revenueGapForScanBreakdown({
              mentionedCount: appearedOn,
              respondedPlatforms: completedPlatformCount,
              avgCustomerValue: avgValueTop,
              monthlyAIInquiries: monthlyInquiriesTop,
            });
            return (
              // Item 4: the inputs are benchmark ASSUMPTIONS (country config),
              // not measurements of this business — label them that way.
              <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>Estimate, not a measurement. Assumes ~{bd.monthlyAIInquiries.toLocaleString()} AI-assisted inquiries a month in your market, ~{SYM}{bd.avgCustomerValue.toLocaleString()} average customer value and a {Math.round(REVENUE_CONVERSION_RATE * 100)}% inquiry-to-customer rate (industry benchmarks, not your data). The {Math.round(bd.lostShare * 100)}% share at stake is the AI platforms that answered in this scan but didn&apos;t recommend you ({completedPlatformCount - appearedOn} of {completedPlatformCount}): {Math.round(bd.lostShare * 100)}% &times; {bd.monthlyAIInquiries.toLocaleString()} inquiries &times; {Math.round(REVENUE_CONVERSION_RATE * 100)}% &times; {SYM}{bd.avgCustomerValue.toLocaleString()}.</p>
            );
          })()}
        </div>

        {/* SECTION 4 — WHY COMPETITOR WINS (paid + competitor detected; existing data only) */}
        {isPaid && scan?.competitor_name && compScanData && (
          <div style={{ background: W, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${PURPLE}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg> Why {scan.competitor_name} Wins</p>
            <p style={{ fontSize: 14, color: NAVY, margin: '0 0 12px' }}>
              They appear on <strong>{Math.max(0, compScanData.mentioned - appearedOn)}</strong> more platform{Math.max(0, compScanData.mentioned - appearedOn) === 1 ? '' : 's'} than you.
            </p>
            {(() => {
              const lost = compScanData.platforms.filter(p => p.mentioned && !results.some(r => r.platform === p.platform && r.mentioned));
              return lost.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Platform advantage</p>
                  {lost.slice(0, 6).map(p => (
                    <div key={p.platform} style={{ fontSize: 13, color: NAVY, padding: '3px 0' }}>{p.platform} <span style={{ color: '#16a34a', fontWeight: 700 }}>{<svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>} them</span> · <span style={{ color: '#dc2626', fontWeight: 700 }}>{<svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>} you</span></div>
                  ))}
                </div>
              ) : null;
            })()}
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>
              Score gap: <strong style={{ color: NAVY }}>{Math.max(0, compScanData.score - currentScore)} points</strong> · Estimated monthly revenue at stake: <strong style={{ color: '#dc2626' }}>{SYM}{revenueGapTop.toLocaleString()}/mo</strong> <span style={{ fontSize: 11 }}>(estimate from your own platform gap, not {scan.competitor_name}&apos;s revenue)</span>
            </p>
          </div>
        )}

        {/* SECTION 5 — 30-DAY ROADMAP (paid; deterministic, impact-sorted to match
            Section 2 so the biggest opportunity is what you tackle FIRST) */}
        {isPaid && fixes.length >= 3 && (() => {
          // b86q: the plan's schedule comes from the SAME engine as
          // the projection timeline (calculateSimulation fix
          // projections: week windows + canonical gains), so a fix
          // can never be "Week 2-3" here and "Week 3-4" there. The
          // old plan used fixed slots by impact rank while the
          // timeline used per-fix durations — two schedulers, two
          // answers.
          const planSim = calculateSimulation({
            currentScore,
            industry: scan?.industry ?? '',
            city: scan?.location ?? '',
            countryCode: (scan?.country_code ?? 'US') as string,
            competitorScore: null,
            platformsCovered: 12,
            fixes: fixes.map(f => ({ id: f.id, title: f.title, fix_type: f.fix_type, predicted_impact: f.predicted_impact })),
            revenueGap: 0,
            revenueSymbol: SYM,
          });
          const projByType = new Map(planSim.fixProjections.map(p => [p.fixType, p]));
          const roadmapFixes = [...fixes]
            .sort((a, b) => (b.predicted_impact || 0) - (a.predicted_impact || 0))
            .slice(0, 3)
            .map(fix => ({ fix, proj: projByType.get(fix.fix_type) }));
          return (
          <div style={{ background: W, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${PURPLE}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg> Your Fix Plan</p>
            {roadmapFixes.map(({ fix, proj }) => {
              const wk = proj
                ? (proj.weekStart === proj.weekEnd ? `Week ${proj.weekStart}` : `Week ${proj.weekStart}–${proj.weekEnd}`)
                : '—';
              return (
              <div key={wk} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE }}>{wk}</span>
                  <span style={{ flex: 1, height: 1, background: BORDER }} />
                </div>
                <p style={{ fontSize: 14, color: NAVY, margin: 0 }}>{fix.title} <span style={{ color: GRAY, fontSize: 12 }}>· {fix.effort || '20 min'}</span></p>
              </div>
              );
            })}
            <div style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE }}>Then</span>
                <span style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
              <p style={{ fontSize: 14, color: NAVY, margin: 0 }}>Rescan → verify your improvement</p>
            </div>
          </div>
          );
        })()}

        {/* ═══════ END PHASE 19 ═══════ */}

        {/* ENTITY VERIFICATION / KNOWLEDGE PANEL */}
        {(() => {
          // b02d: no knowledge_panel_data means the panel was NEVER
          // CHECKED for this scan — not a measured "not found" and
          // never +25. Match the lib's empty score (0) and carry
          // error 'not checked' so the card renders its not-checked
          // state with no measured-verdict findings list.
          const kpData = (scan as any)?.knowledge_panel_data ?? {
            exists: false, claimed: false, completeness: 0, title: null,
            missingFields: [],
            score_contribution: 0, error: 'not checked',
          };
          return (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>
                Entity Verification Status
              </h3>
              <KnowledgePanelCard
                exists={kpData.exists ?? false}
                claimed={kpData.claimed ?? false}
                completeness={kpData.completeness ?? 0}
                title={kpData.title ?? null}
                missingFields={kpData.missingFields ?? []}
                score_contribution={kpData.score_contribution ?? 0}
                error={kpData.error ?? null}
                isPro={isPaid}
                photoUrl={kpData.photoUrl ?? null}
              />
              {!kpData.exists && !kpData.error && scan?.competitor_name && (
                <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, margin: '8px 0 0' }}>
                  <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> This may be a core reason {scan.competitor_name} outranks you on AI platforms.
                </p>
              )}
            </div>
          );
        })()}

        {/* AI Citation Authority removed (ax9d): it read scan.citation_score,
            but rankall_scans has no such column, so it always rendered a
            fabricated 0% vs a hardcoded 12% average, plus a "Fix #3" claim
            that assumed fix-queue order. Citation-source counts (real data)
            still appear in the trust panel. Do not re-add without a real
            citation_score data source. */}

        {/* Share of Voice pie removed — it was computed on a different basis
            than Share of Recommendation below and the two contradicted each
            other (e.g. 55/45 vs 15/71). Share of Recommendation (mention-
            weighted, matching the score) is the single source of truth. */}

        {/* B3/B4 SHARE OF RECOMMENDATION HERO */}
        <div style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Your Share of Recommendation™
          </p>

          {/* You bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#0A0A14', fontWeight: 600 }}>You</span>
              <span style={{ fontSize: 13, color: '#1B17FF', fontWeight: 700 }}>{recommendationShare}%</span>
            </div>
            <div style={{ height: 12, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${recommendationShare}%`, background: '#1B17FF', borderRadius: 6, transition: 'width 0.8s ease' }} />
            </div>
          </div>

          {/* Competitor bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#0A0A14', fontWeight: 600 }}>{scan?.competitor_name || 'Others'}</span>
              <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 700 }}>{competitorShare != null ? `${competitorShare}%` : 'Not measured'}</span>
            </div>
            <div style={{ height: 12, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${competitorShare ?? 0}%`, background: '#DC2626', borderRadius: 6, transition: 'width 0.8s ease' }} />
            </div>
          </div>

          <p style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>
            Share counts all 12 platforms — a platform that didn&apos;t respond counts as not recommending you.
          </p>

          {/* E3: Competitor trend */}
          {compHistory && compHistory.length >= 2 && (
            <div style={{ marginTop: 24, padding: 16, background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#6d28d9', margin: '0 0 8px' }}>
                Score trend ({compHistory.length} scans)
              </p>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 40 }}>
                {compHistory.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                    <div style={{ width: '100%', background: '#1B17FF', height: `${(h.your_score/100)*36}px`, borderRadius: 2 }} />
                    {h.competitor_score && <div style={{ width: '100%', background: '#fca5a5', height: `${(h.competitor_score/100)*12}px`, borderRadius: 2 }} />}
                  </div>
                ))}
              </div>
              {(() => {
                const first = compHistory[0];
                const last = compHistory[compHistory.length - 1];
                const gap = (last.competitor_score ?? 0) - last.your_score;
                const prevGap = (first.competitor_score ?? 0) - first.your_score;
                const closing = prevGap - gap;
                return closing > 0 ? (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#059669' }}>
                    <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> You&apos;re closing the gap — {closing} pts closer than when you started.
                  </p>
                ) : closing < 0 ? (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>
                    <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Gap widened by {Math.abs(closing)} pts. Apply fixes to reverse this.
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {/* D1/D2 COMPETITOR INTELLIGENCE */}
          {scan?.competitor_name && (
            <div style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 16, padding: '20px 24px', marginTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 12 }}>
                <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Why {scan.competitor_name} may be winning recommendations:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* ax9d: these are common factors, NOT measurements of this
                    competitor — we have not verified their reviews, profiles,
                    schema, or mentions. Never present them as the reasons. */}
                {[
                  `${scan.competitor_name} may have more verified reviews on key AI data sources`,
                  'Their business directory profiles may be more complete (Google, Yelp, industry-specific)',
                  'They may have stronger schema markup signaling their category to AI',
                  'They may get more mentions in local forums, Reddit, and news articles',
                ].map((reason, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: '#92400E', fontWeight: 700, flexShrink: 0 }}>•</span>
                    <span style={{ fontSize: 13, color: '#78350F' }}>{reason}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#92400E', margin: '12px 0 0', fontStyle: 'italic' }}>
                These are common factors, not verified facts about {scan.competitor_name} — we haven&apos;t measured their reviews, profiles, schema, or mentions.
              </p>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #FED7AA' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                  Competitive Gap: {competitorShare != null ? `-${Math.max(0, competitorShare - recommendationShare)} pts recommendation share` : 'not measured — no competitor scan'}
                </span>
                <span style={{ fontSize: 12, color: '#92400E', marginLeft: 8 }}>
                  Close this gap to start winning recommendations.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* CONV-06: warm-channel variant header (influencer/agency) */}
        <WarmVariant />

        {/* CONV-04: honest urgency — real data only, no fake timers */}
        <HonestUrgency
          history={compHistory}
          scanCreatedAt={scan?.created_at}
          pendingFixes={fixes.map((f) => ({ id: f.id, title: f.title, created_at: f.created_at }))}
          competitorName={scan?.competitor_name || undefined}
        />

        {/* SHARE YOUR SCORE */}
        {shareLink && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Share Your Score</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 20 }}>Show the world your AI visibility ranking</p>

            {/* Score card visual */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div
                id="score-share-card"
                style={{
                  width: 320, background: '#0A0A14', borderRadius: 20, padding: '32px 28px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                }}
              >
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>AI Visibility Score</p>
                <div style={{ position: 'relative', width: 120, height: 120 }}>
                  {(() => {
                    const sc = currentScore; const r = 48; const c = 2 * Math.PI * r;
                    const col = sc >= 71 ? '#22C55E' : sc >= 51 ? '#EAB308' : sc >= 31 ? '#F97316' : '#EF4444';
                    // b02b: one grade-band table — the shared gradeLabel
                    // (same thresholds the simulator grades with).
                    const lbl = gradeLabel(sc);
                    return (
                      <>
                        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
                          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                          <circle cx="60" cy="60" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(sc/100)*c} ${c}`} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 36, fontWeight: 900, color: col, lineHeight: 1 }}>{sc}</span>
                          <span style={{ fontSize: 9, color: col, fontWeight: 700 }}>{lbl}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', margin: 0, textAlign: 'center', maxWidth: 220, lineHeight: 1.3 }}>
                  {displayName.split(' in ')[0] || 'My Business'}
                </p>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', width: '100%', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Logo variant="white" height={14} />
                </div>
              </div>
            </div>

            {/* Share text */}
            <div style={{ background: BG, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: GRAY, fontStyle: 'italic', textAlign: 'center' }}>
              &quot;My Share of AI Recommendations: {recommendationShare}% — I appear on {appearedOn} of {PARTIAL_TOTAL_PLATFORMS} AI platforms. What&apos;s yours? rankall.io&quot;
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={copyShareLink}
                style={{ background: shareLinkCopied ? GREEN : BLUE, border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {shareLinkCopied ? <><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Link Copied!</> : <><svg viewBox="0 0 640 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg> Copy Link</>}
              </button>
              <button
                onClick={downloadCard}
                style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg> Download Card
              </button>
              <button
                onClick={() => {
                  publishShare();
                  const text = `My Share of AI Recommendations: ${recommendationShare}% — I appear on ${appearedOn} of ${PARTIAL_TOTAL_PLATFORMS} AI platforms. What's yours? https://rankall.io`;
                  if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text });
                  else if (typeof navigator !== 'undefined') { navigator.clipboard.writeText(text); alert('Copied to clipboard!'); }
                }}
                style={{ background: '#1B17FF', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Share My Score
              </button>
            </div>
          </div>
        )}

        {/* GAP NARRATIVE — shown to every report visitor (ax70). The
            You-vs-Competitor comparison + narrative are the wound content:
            an outreach recipient opening their report link without an
            account must see them. Ownership is enforced earlier (P0a) —
            strangers still can't open someone else's owned scan. */}
        {(gapNarrative || loadingNarrative) && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, color: '#92400E' }}><svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>AI Visibility Diagnosis</p>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>{scan?.competitor_name && compScanData && compScanData.score > currentScore
                  ? `Why you are losing to ${scan.competitor_name}`
                  : scan?.competitor_name
                    ? `Your AI visibility gap — ${scan.competitor_name} is the business AI named instead`
                    : 'Your AI visibility gap'}</h2>
              </div>
            </div>

            {loadingNarrative ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: GRAY }}>
                <div style={{ width: 16, height: 16, border: `2px solid ${BORDER}`, borderTop: `2px solid ${BLUE}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 14 }}>Analysing your visibility gap...</span>
              </div>
            ) : (
              <>
                {/* YOU VS COMPETITOR COMPARISON */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

                  {/* YOU column */}
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ background: RED, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>YOU</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName.split(' in ')[0] || 'Your Business'}</span>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {youRows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < youRows.length - 1 ? '1px solid #FCA5A5' : 'none' }}>
                          <span style={{ fontSize: 12, color: GRAY }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: row.good ? GREEN : RED }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* COMPETITOR column */}
                  <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ background: GREEN, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>WINNING</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan?.competitor_name || 'Competitor'}</span>
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      {competitorRows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < competitorRows.length - 1 ? '1px solid #A7F3D0' : 'none' }}>
                          <span style={{ fontSize: 12, color: GRAY }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: row.value === 'Not measured' ? GRAY : GREEN }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* STD-07: citation intelligence — where AI answers cite the business from */}
                {(() => {
                  const groups = groupCitationSources(scan?.citation_sources ?? []);
                  if (groups.length === 0) return null;
                  return (
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>Where AI cites you from</p>
                      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px', lineHeight: 1.6 }}>
                        The sources AI answers referenced when mentioning your business, grouped by type.
                      </p>
                      {groups.map(g => (
                        <div key={g.category} style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>{g.label}</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {g.sources.map(s => (
                              <span key={s.name} style={{ fontSize: 13, background: BG, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '6px 14px', color: NAVY }}>
                                {s.name}{s.count > 1 ? <span style={{ color: GRAY, fontWeight: 600 }}> ×{s.count}</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Narrative */}
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
                  {gapNarrative?.split('\n\n').filter(p => !p.startsWith('#')).map((para, i, arr) => (
                    <p key={i} style={{ fontSize: 14, color: NAVY, lineHeight: 1.85, marginBottom: i < arr.length - 1 ? 14 : 0, fontWeight: i === 0 ? 600 : 400 }}>
                      {para}
                    </p>
                  ))}
                </div>

                {/* COMPETITOR CLAIM — scan competitor button */}
                {scan?.competitor_name && !compScanData && (
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={handleCompetitorScan}
                      disabled={compScanLoading}
                      style={{ background: compScanLoading ? GRAY : NAVY, border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: compScanLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      {compScanLoading ? (
                        <>
                          <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          Scanning {scan.competitor_name} across {PARTIAL_TOTAL_PLATFORMS} platforms...
                        </>
                      ) : (
                        <><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg> Scan {scan.competitor_name} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>
                      )}
                    </button>
                    {compScanError && <p style={{ fontSize: 12, color: RED, marginTop: 8 }}>{compScanError}</p>}
                  </div>
                )}

                {/* COMPETITOR SCAN RESULTS */}
                {compScanData && scan?.competitor_name && (
                  <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{scan.competitor_name} — Live Scan</p>
                        <p style={{ fontSize: 12, color: GRAY }}>Score: <strong style={{ color: compScanData.score > currentScore ? RED : GREEN }}>{compScanData.score}/100</strong> · Mentioned on {compScanData.mentioned} platforms</p>
                      </div>
                      <div style={{ background: compScanData.score > currentScore ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${compScanData.score > currentScore ? '#FCA5A5' : '#A7F3D0'}`, borderRadius: 8, padding: '6px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: compScanData.score > currentScore ? RED : GREEN }}>
                          {compScanData.score > currentScore ? `${compScanData.score - currentScore} pts ahead` : `You lead by ${currentScore - compScanData.score} pts`}
                        </span>
                      </div>
                    </div>

                    {/* Platform breakdown side by side */}
                    <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Platform comparison</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 16 }}>
                      {compScanData.platforms.map(p => {
                        const youMentioned = results.some(r => r.platform === p.platform && r.mentioned);
                        return (
                          <div key={p.platform} style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{p.platform}</p>
                            <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 700 }}>
                              <span style={{ color: youMentioned ? GREEN : RED }}>You: {youMentioned ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>}</span>
                              <span style={{ color: p.mentioned ? RED : GREEN }}>{scan.competitor_name}: {p.mentioned ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                      Platforms where {scan.competitor_name} beats you:
                    </p>
                    <ul style={{ paddingLeft: 18, margin: '0 0 16px', fontSize: 13, color: GRAY, lineHeight: 1.8 }}>
                      {compScanData.platforms
                        .filter(p => p.mentioned && !results.some(r => r.platform === p.platform && r.mentioned))
                        .map(p => <li key={p.platform}>{p.platform} — they appear, you don&apos;t</li>)
                      }
                      {compScanData.platforms.filter(p => p.mentioned && !results.some(r => r.platform === p.platform && r.mentioned)).length === 0 && (
                        <li style={{ color: GREEN }}>You match or beat {scan.competitor_name} on every platform</li>
                      )}
                    </ul>

                    {/* CTA */}
                    {!isPaid && !authLoading && (
                      <div style={{ background: NAVY, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Get the full fix plan to close this gap</p>
                        <a href={isLoggedIn ? '/pricing?plan=business' : '/signup'} style={{ background: BLUE, borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {isLoggedIn ? <>Upgrade to Local Pro <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></> : <>Get full fix plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MARKETING SPEND INTELLIGENCE */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, color: '#92400E' }}><svg viewBox="0 0 576 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M0 112.5L0 422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4l0-309.9c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c35.3 0 64 28.7 64 64l-64 0 0-64zm64-208c0 35.3-28.7 64-64 64l0-64 64 0zM512 304l0 64-64 0c0-35.3 28.7-64 64-64zM448 96l64 0 0 64c-35.3 0-64-28.7-64-64z"/></svg></div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Marketing Intelligence</p>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY, margin: 0 }}>Is your marketing spend helping your AI visibility?</h2>
            </div>
          </div>
          <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.65, marginBottom: 20 }}>
            Enter your monthly spend to see where your budget is working and where it&apos;s not.
          </p>

          {/* Educational context box */}
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.6, margin: 0 }}>
              Many businesses spend {SYM}2,000–5,000/month on Google Ads, SEO, and reviews without knowing which spend drives AI recommendations. Enter yours to find out.
            </p>
          </div>

          {/* Spend input grid */}
          {(() => {
            const spendFields: Array<{ label: string; value: string; setter: (v: string) => void }> = [
              { label: 'Google Ads',          value: spendGoogle,  setter: setSpendGoogle },
              { label: 'Meta / Facebook Ads', value: spendMeta,    setter: setSpendMeta },
              { label: 'SEO Agency',          value: spendSeo,     setter: setSpendSeo },
              { label: 'Review Management',   value: spendReviews, setter: setSpendReviews },
              { label: 'Directory Listings',  value: spendDirs,    setter: setSpendDirs },
              { label: 'Other Marketing',     value: spendOther,   setter: setSpendOther },
            ];
            const totalSpend = spendFields.reduce((s, f) => s + (parseFloat(f.value) || 0), 0);
            const AI_IMPACT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
              'None':      { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
              'Low':       { color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
              'Medium':    { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
              'High':      { color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
              'Very High': { color: '#1B17FF', bg: '#ECEBFF', border: '#93C5FD' },
            };
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {spendFields.map(f => (
                    <div key={f.label}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 5 }}>{f.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${BORDER}`, borderRadius: 10, background: BG, overflow: 'hidden' }}>
                        <span style={{ padding: '0 10px', fontSize: 13, color: GRAY, borderRight: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', background: '#F1F5F9', height: '100%' }}>{SYM}</span>
                        <input
                          type="number"
                          value={f.value}
                          onChange={e => f.setter(e.target.value)}
                          placeholder="0"
                          min="0"
                          style={{ flex: 1, border: 'none', padding: '9px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div style={{ background: totalSpend > 0 ? '#ECEBFF' : BG, border: `1.5px solid ${totalSpend > 0 ? '#C9C6FF' : BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Total Monthly Spend</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: totalSpend > 0 ? BLUE : LGRAY }}>{SYM}{totalSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo</span>
                </div>

                <button
                  onClick={handleSpendAnalysis}
                  disabled={spendLoading || totalSpend === 0}
                  style={{ width: '100%', background: spendLoading || totalSpend === 0 ? GRAY : NAVY, border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: spendLoading || totalSpend === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {spendLoading ? (
                    <>
                      <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Analyzing with Claude Haiku...
                    </>
                  ) : <>Analyze My Spend <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>}
                </button>
                {spendError && <p style={{ fontSize: 13, color: RED, marginTop: 10 }}>{spendError}</p>}

                {/* Results */}
                {spendAnalysis && (
                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Spend Breakdown */}
                    {(spendAnalysis.categories ?? []).filter(c => c.amount > 0).length > 0 && (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Spend Breakdown</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {(spendAnalysis.categories ?? []).filter(c => c.amount > 0).map((cat, i) => {
                            const cfg = AI_IMPACT_CONFIG[cat.aiImpact] ?? AI_IMPACT_CONFIG['None'];
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: BG, borderRadius: 12, border: `1px solid ${BORDER}` }}>
                                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 64 }}>
                                  <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: 0 }}>{SYM}{cat.amount.toLocaleString()}</p>
                                  <p style={{ fontSize: 10, color: LGRAY, margin: 0 }}>/mo</p>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{cat.name}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>{cat.aiImpact} AI Impact</span>
                                  </div>
                                  <p style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: 1.5 }}>{cat.explanation}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reallocation */}
                    {spendAnalysis.reallocation && (
                      <div style={{ background: '#FFFFFF', border: '1.5px solid #E7E7F0', borderRadius: 14, padding: '20px 22px' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Reallocation Recommendation</p>
                        <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 10, padding: '14px 16px', marginBottom: 14, textAlign: 'center' }}>
                          <p style={{ fontSize: 15, fontWeight: 800, color: '#0A0A14', lineHeight: 1.4, margin: 0 }}>
                            Move <span style={{ color: '#8D8BFF' }}>{SYM}{spendAnalysis.reallocation.moveAmount.toLocaleString()}/mo</span> from <span style={{ color: '#FCA5A5' }}>{spendAnalysis.reallocation.fromCategory}</span> to <span style={{ color: '#6EE7B7' }}>{spendAnalysis.reallocation.toCategory}</span>
                          </p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                            <p style={{ fontSize: 20, fontWeight: 900, color: '#22C55E', margin: 0 }}>+{spendAnalysis.reallocation.expectedImprovementPoints}</p>
                            <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>AI score points</p>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                            <p style={{ fontSize: 20, fontWeight: 900, color: '#8D8BFF', margin: 0 }}>{spendAnalysis.reallocation.gapClosedPercent}%</p>
                            <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>gap with {spendContext?.competitor ?? 'competitor'} closed</p>
                          </div>
                        </div>
                        <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.65, margin: 0 }}>{spendAnalysis.reallocation.reasoning}</p>
                      </div>
                    )}

                    {/* Best $100 */}
                    {spendAnalysis.bestHundred && (
                      <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '18px 20px' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}><svg viewBox="0 0 384 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M272 384c9.6-31.9 29.5-59.1 49.2-86.2c0 0 0 0 0 0c5.2-7.1 10.4-14.2 15.4-21.4c19.8-28.5 31.4-63 31.4-100.3C368 78.8 289.2 0 192 0S16 78.8 16 176c0 37.3 11.6 71.9 31.4 100.3c5 7.2 10.2 14.3 15.4 21.4c0 0 0 0 0 0c19.8 27.1 39.7 54.4 49.2 86.2l160 0zM192 512c44.2 0 80-35.8 80-80l0-16-160 0 0 16c0 44.2 35.8 80 80 80zM112 176c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-61.9 50.1-112 112-112c8.8 0 16 7.2 16 16s-7.2 16-16 16c-44.2 0-80 35.8-80 80z"/></svg> Your best {SYM}100/month AI investment</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: BLUE, marginBottom: 4 }}>{spendAnalysis.bestHundred.category}</p>
                        <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 6 }}>{spendAnalysis.bestHundred.action}</p>
                        <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>{spendAnalysis.bestHundred.expectedImpact}</p>
                      </div>
                    )}

                    {/* Upgrade CTA for free/anon users */}
                    {!isPaid && !authLoading && (
                      <div style={{ background: NAVY, borderRadius: 14, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Get weekly spend intelligence with your Local Pro plan</p>
                        <a href={isLoggedIn ? '/pricing?plan=business' : '/signup'} style={{ background: BLUE, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {isLoggedIn ? <>Upgrade to Local Pro <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></> : <>Create free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Google Business Intelligence — gated on trustedGoogle, NOT the raw
            stored data: pre-PR #37 scans stored the first fuzzy Places result
            with zero validation, so old reports can carry another business's
            Google data. serpData/reddit are separate sources with honest
            framing, so they render independently of the GBP check. */}
        {(trustedGoogle || scan?.enrichment?.serpData || scan?.enrichment?.reddit) && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            {trustedGoogle ? (
              <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Google Business Intelligence</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Real data from Google Places API</p>
              </div>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: GREEN }}>{<svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>} Verified</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {(() => {
                // azzt: legacy scans stored the operational boolean under
                // the wrong name `claimed`; new scans store `operational`.
                const listingOperational = trustedGoogle.operational ?? trustedGoogle.claimed ?? null;
                return [
                { label: 'Google reviews', value: trustedGoogle.reviewCount?.toLocaleString() || '—' },
                { label: 'Star rating', value: trustedGoogle.rating ? <>{trustedGoogle.rating} <svg viewBox="0 0 576 512" width="12" height="12" fill="#D97706" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg></> : '—' },
                { label: 'Photos uploaded', value: trustedGoogle.photos?.toString() || '—' },
                { label: 'Hours listed', value: trustedGoogle.hours ? <><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Yes</> : <><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg> No</>, color: trustedGoogle.hours ? GREEN : RED },
                { label: 'Category', value: trustedGoogle.category || '—' },
                { label: 'Listing status', value: listingOperational === null ? '—' : listingOperational ? 'Operational' : 'Not operational', color: listingOperational === null ? NAVY : listingOperational ? GREEN : RED },
              ].map((item, i) => (
                <div key={i} style={{ background: BG, borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: (item as any).color || NAVY, lineHeight: 1, marginBottom: 4 }}>{item.value}</p>
                  <p style={{ fontSize: 11, color: LGRAY }}>{item.label}</p>
                </div>
              ))
              })()}
            </div>
            <p style={{ fontSize: 12, color: LGRAY, marginTop: 10 }}>Google Places does not expose claim status — this is the listing&apos;s operational status, not a claim check. Verify claim status in Google Business Profile.</p>
            {trustedGoogle.address && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: BG, borderRadius: 8, fontSize: 13, color: GRAY }}>
                <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg> {trustedGoogle.address} {trustedGoogle.phone && <>· <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/></svg> {trustedGoogle.phone}</>}
              </div>
            )}
            </>
            ) : googleMismatch ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Google Business Intelligence</p>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>Google Business data is not shown for this report — no confident match was found for this business, so another business's listing is not displayed instead.</p>
              </div>
            ) : null}
            {scan?.enrichment?.serpData && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#ECEBFF', borderRadius: 8, fontSize: 13, color: BLUE, fontWeight: 500 }}>
                <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg> Competitor in local pack: <strong>{scan?.enrichment?.serpData.competitorInPack || scan?.competitor_name || 'Unknown'}</strong>
                {scan?.enrichment?.serpData.yelpPresent && <> · <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Yelp listed</>}
                {scan?.enrichment?.serpData.healthgradesPresent && <> · <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Healthgrades listed</>}
              </div>
            )}
            {scan?.enrichment?.reddit && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: scan?.enrichment?.reddit.mentionCount > 0 ? '#ECFDF5' : '#FEF2F2', borderRadius: 8, fontSize: 13, color: scan?.enrichment?.reddit.mentionCount > 0 ? GREEN : RED, fontWeight: 500 }}>
                Reddit mentions: <strong>{scan?.enrichment?.reddit.mentionCount}</strong>
                {scan?.enrichment?.reddit.topSubreddits.length > 0 && ` · ${scan?.enrichment?.reddit.topSubreddits.join(', ')}`}
              </div>
            )}
          </div>
        )}

        {/* TRUST SIGNALS */}
        {trustSignals && (() => {
          const allSignals = [
            // Stale-poisoned-report guard (PR #39 follow-up): when the stored
            // GBP data fails re-validation, a quoted Title tag may belong to
            // another business — sanitize it, never quote it.
            ...(trustSignals.technical || []).map(s => ({ ...sanitizeTitleTagSignal(s, googleMismatch), category: 'Technical' })),
            ...(trustSignals.directory || []).map(s => ({ ...s, category: 'Directory' })),
            ...(trustSignals.reviews   || []).map(s => ({ ...s, category: 'Reviews' })),
            ...(trustSignals.community || []).map(s => ({ ...s, category: 'Community' })),
            ...(trustSignals.aiPlatforms || []).map(s => ({ ...s, category: 'AI Platforms' })),
          ];
          // b0fn: while auth is loading, show NO signals — the old code
          // showed ALL of them until auth resolved, so a logged-out
          // visitor saw the full (gated) trust panel flash and then
          // disappear when the gate snapped in. Skeletons below.
          // b0fm: a logged-out payload already contains only the first 3
          // signals; the withheld ones arrive as a COUNT (lockedCount).
          const visibleSignals = viewerFull ? allSignals : allSignals.slice(0, 3);
          const hiddenCount = viewerFull ? 0 : Math.max(0, allSignals.length - 3) + (trustSignals.lockedCount ?? 0);
          const totalSignalCount = visibleSignals.length + hiddenCount;
          const gainFor = (signal: TrustSignal) => signal.gainPoints ?? trustFixGainPoints(signal, allSignals);

          const renderSignal = (signal: TrustSignal & { category: string }, idx: number) => {
            const isGood = signal.status === 'good';
            const isBad = signal.status === 'missing' || signal.status === 'danger';
            // b0fh: 'not_checked' is neither good nor bad — show the
            // honest value ('Not checked — website not located') in
            // neutral gray, with no fix button and no points promise.
            const isNotChecked = signal.status === 'not_checked';
            const displayText = isGood
              ? signal.value
              : (isBad && signal.consequence)
                ? signal.consequence
                : signal.value;
            const textColor = isGood ? GREEN : isBad ? '#B91C1C' : isNotChecked ? GRAY : AMBER;
            const sigKey = `${signal.category}-${signal.name}`;
            const fixData = (!isGood && !isNotChecked) ? getFixForReport(signal.name) : null;
            const isExpanded = expandedSignal === sigKey;
            return (
              <div key={sigKey} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: signalStatusColor(signal.status) }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.07em', background: '#ECEBFF', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{signal.category}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{signal.name}</span>
                      </div>
                      <p style={{ fontSize: 12, color: textColor, lineHeight: 1.5, margin: 0, fontWeight: isGood ? 500 : 600 }}>{displayText}</p>
                      {/* How to fix — expandable */}
                      {fixData && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={() => setExpandedSignal(prev => prev === sigKey ? null : sigKey)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: BLUE, background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg> How to fix this {isExpanded ? <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> : <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>}
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: 8, background: W, border: '1px solid #C9C6FF', borderRadius: 10, padding: '12px 14px' }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Steps</p>
                              <ol style={{ paddingLeft: 16, margin: 0 }}>
                                {fixData.steps.map((step, i) => (
                                  <li key={i} style={{ fontSize: 12, color: NAVY, lineHeight: 1.6, marginBottom: 5 }}>{step}</li>
                                ))}
                              </ol>
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: AMBER, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 100, padding: '3px 10px', lineHeight: 1.45 }}>
                                  <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg> {fixData.timeline}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '3px 10px' }}>
                                  <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg> {`+${gainFor(signal)} trust pts`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {!isGood && signal.pointsImpact ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                        Fix <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg> +{gainFor(signal)} trust pts
                      </span>
                    ) : isGood ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                        <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Passing
                      </span>
                    ) : null}
                    <span style={{ fontSize: 15, fontWeight: 800, color: signalStatusColor(signal.status), minWidth: 16, textAlign: 'center' }}>
                      {signal.status === 'good' ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : signal.status === 'warning' ? <svg viewBox="0 0 512 512" width="12" height="12" fill="#D97706" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg> : signal.status === 'not_checked' ? <span style={{ color: GRAY, fontSize: 14, lineHeight: 1 }}>—</span> : <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>}
                    </span>
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Trust Signal Snapshot</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: BG, border: `1px solid ${BORDER}`, borderRadius: 100, padding: '6px 14px' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: scoreCol(trustSignals.overall) }}>{trustSignals.overall}</span>
                  <span style={{ fontSize: 12, color: GRAY }}>/100 trust score</span>
                </div>
              </div>
              {/* b882: the trust formula, shown only when it
                  reconciles with the stored score (same honesty
                  pattern as the score breakdown above). */}
              {(() => {
                const good = allSignals.filter(s => s.status === 'good').length;
                const partial = allSignals.filter(s => s.status === 'warning').length;
                const total = allSignals.length;
                const computed = total > 0 ? Math.round(((good + partial / 2) / total) * 100) : null;
                return (
                  <p style={{ fontSize: 12, color: GRAY, margin: '-8px 0 16px', lineHeight: 1.6 }}>
                    {computed !== null && computed === trustSignals.overall
                      ? <>Trust score: ({good} passing × 1 + {partial} partial × ½) ÷ {total} signals = {trustSignals.overall}/100, from this scan&apos;s stored signal report.</>
                      : <>Trust score: {trustSignals.overall}/100, from this scan&apos;s stored signal report.</>}
                  </p>
                );
              })()}

              {/* While auth resolves, skeleton rows — neither the full
                  state (logged-out flash) nor the gated state (logged-in
                  flash) appears before we know who is viewing. */}
              {authLoading ? (
                <div aria-hidden="true">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ borderBottom: `1px solid ${BORDER}`, padding: '12px 0', display: 'flex', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: BORDER, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 14, width: '35%', background: BORDER, borderRadius: 6, marginBottom: 8 }} />
                        <div style={{ height: 12, width: '70%', background: BORDER, borderRadius: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <>
              {/* Always-visible first 3 signals */}
              {visibleSignals.map(renderSignal)}

              {/* Gate for logged-out users. b0fm: the old blurred block
                  rendered every hidden signal's full text in the DOM
                  (readable via view-source / DevTools) — the gate was
                  visual-only. Gated signals are NOT rendered now; the
                  skeleton rows below carry no content. */}
              {hiddenCount > 0 && (
                <div style={{ position: 'relative', marginTop: 0 }}>
                  <div aria-hidden="true">
                    {Array.from({ length: Math.min(hiddenCount, 6) }).map((_, i) => (
                      <div key={i} style={{ borderBottom: `1px solid ${BORDER}`, padding: '12px 0' }}>
                        <div style={{ height: 14, width: '35%', background: BG, borderRadius: 6, marginBottom: 8 }} />
                        <div style={{ height: 12, width: '70%', background: BG, borderRadius: 6 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '16px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 340 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                        +{hiddenCount} more signals hidden
                      </p>
                      <p style={{ fontSize: 12, color: GRAY, marginBottom: 14 }}>Sign up free to see all {totalSignalCount} trust signals</p>
                      <a href="/signup" style={{ display: 'inline-block', background: BLUE, borderRadius: 9, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                        Sign up free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}
              </>)}
            </div>
          );
        })()}

        {/* FIX QUEUE */}
        <div id="fixes" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Your Fix Queue</h2>
              {fixesLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 100, padding: '4px 12px' }}>
                  <div style={{ width: 12, height: 12, border: `2px solid #C9C6FF`, borderTop: `2px solid ${BLUE}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>Personalising fixes…</span>
                </div>
              )}
            </div>
            <span style={{ fontSize: 12, color: GRAY, background: BG, border: `1px solid ${BORDER}`, borderRadius: 100, padding: '4px 12px' }}>
              {fixesLoading ? 'Analysing your trust gaps' : 'Ranked by predicted impact'}
            </span>
          </div>
          {(fixesLoading || authLoading) ? (
            // Skeleton cards while fixes OR the plan are still loading — the gate/lock
            // logic must never run before we know the user's plan (prevents the
            // upgrade gate flashing for a paid user during plan resolution).
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: BORDER }} />
                  <div style={{ height: 16, width: `${40 + i * 8}%`, background: BORDER, borderRadius: 6 }} />
                </div>
                <div style={{ paddingLeft: 34 }}>
                  <div style={{ height: 13, width: '80%', background: BORDER, borderRadius: 6, marginBottom: 6 }} />
                  <div style={{ height: 13, width: '55%', background: BORDER, borderRadius: 6 }} />
                </div>
              </div>
            ))
          ) : fixesError ? (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', marginBottom: 6 }}>Couldn&apos;t load your personalized fixes</p>
              <p style={{ fontSize: 13, color: '#7F1D1D', marginBottom: 14 }}>The fix list failed to load. Your scan is unaffected.</p>
              <button onClick={() => setFixesRetry(r => r + 1)} style={{ background: '#DC2626', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                Retry
              </button>
            </div>
          ) : fixes.length === 0 ? (
            <p style={{ fontSize: 13, color: GRAY, textAlign: 'center', padding: '12px 0' }}>No fixes available for this scan yet.</p>
          ) : orderedFixes.map((fix, orderIdx) => {
            // Global index (impact rank) — the queue is split into DIY /
            // web-person groups, but locking and the #N badge still use
            // the fix's position in the full impact-ranked list.
            const i = fixes.findIndex(f => f.id === fix.id);
            const group = fixGroup(fix.fix_type);
            const prevGroup = orderIdx > 0 ? fixGroup(orderedFixes[orderIdx - 1].fix_type) : null;
            // While auth is loading, show all fixes to avoid flash of lock state for logged-in users
            const locked = !authLoading && !isLoggedIn && i > 0;
            const freeLocked = !authLoading && isLoggedIn && !isPaid && i > 0;
            return (locked || freeLocked) ? null : (
            <Fragment key={fix.id}>
            {/* CONV-02: FREE FIX banner — the first fix is done for you, visibly free */}
            {i === 0 && !isLoggedIn && !authLoading && (
              <div style={{ background: '#ECFDF5', border: '2px solid #059669', borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#059669', borderRadius: 100, padding: '4px 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Free fix — done for you
                  </span>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0A0A14', margin: '0 0 6px' }}>
                  We already did the work on your highest-impact fix.
                </p>
                <p style={{ fontSize: 13, color: '#55556A', margin: '0 0 14px', lineHeight: 1.6 }}>
                  The complete fix is below — copy, paste, done. {fixes.length - 1 > 0 ? `${fixes.length - 1} more fix${fixes.length - 1 > 1 ? 'es' : ''} waiting inside.` : ''}
                </p>
                <button
                  onClick={() => { const f = fixes[0]; if (f) handleGenerateFix(f); }}
                  style={{ background: '#059669', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Get my free fix
                </button>
              </div>
            )}
            {group !== prevGroup && (
              <div style={{ margin: '8px 0 12px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>{group === 'diy' ? 'Do it yourself' : 'Send to your web person'}</h3>
                <p style={{ fontSize: 12.5, color: GRAY, margin: 0 }}>{group === 'diy' ? 'No technical skills needed — follow the steps on each card.' : 'These need website or technical changes — copy the instructions from each card and send them to your web person.'}</p>
              </div>
            )}
            <div className="fix-card" style={{ background: BG, border: `1.5px solid ${fix.status === 'applied' ? '#A7F3D0' : BORDER}`, borderRadius: 14, padding: '18px 20px', marginBottom: 12, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: fix.status === 'applied' ? '#ECFDF5' : '#ECEBFF', border: `1px solid ${fix.status === 'applied' ? '#A7F3D0' : '#C9C6FF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: fix.status === 'applied' ? GREEN : BLUE }}>
                        {fix.status === 'applied' ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : `#${i + 1}`}
                      </span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{fix.title}</span>
                    {fix.status === 'applied' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 10px' }}>
                        Applied · Verification rescan in ~7 days
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65, marginBottom: 10, paddingLeft: 34 }}>{fix.description}</p>
                  <div style={{ display: 'flex', gap: 14, paddingLeft: 34, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: GRAY }}>
                      <span style={{ fontWeight: 700, color: GREEN }}>+{fix.predicted_impact} pts</span> predicted
                    </span>
                    <span style={{ fontSize: 12, color: GRAY }}>
                      <span style={{ fontWeight: 700, color: NAVY }}>{fix.confidence}%</span> confidence
                    </span>
                    <span style={{ fontSize: 12, color: GRAY }}>
                      <span style={{ fontWeight: 700, color: NAVY }}>{fix.effort}</span> effort
                    </span>
                    {(() => {
                      const imp = getFixImpact(fix.fix_type);
                      const seoStyle = imp.seo === 'Very High' ? { color: '#1D4ED8', bg: '#ECEBFF', border: '#93C5FD' }
                                     : imp.seo === 'High'     ? { color: '#1B17FF', bg: '#ECEBFF', border: '#C9C6FF' }
                                     : imp.seo === 'Medium'   ? { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' }
                                                               : { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' };
                      const aiStyle  = imp.ai === 'Very High'  ? { color: '#1B17FF', bg: '#ECEBFF', border: '#C4B5FD' }
                                     : imp.ai === 'High'       ? { color: '#1B17FF', bg: '#ECEBFF', border: '#DCDAFF' }
                                     : imp.ai === 'Medium'     ? { color: '#1B17FF', bg: '#ECEBFF', border: '#E9D5FF' }
                                                                : { color: '#8D8BFF', bg: '#ECEBFF', border: '#EDE9FE' };
                      return (
                        <>
                          <span style={{ fontSize: 10, fontWeight: 700, color: seoStyle.color, background: seoStyle.bg, border: `1px solid ${seoStyle.border}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            SEO: {imp.seo}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: aiStyle.color, background: aiStyle.bg, border: `1px solid ${aiStyle.border}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            AI: {imp.ai}
                          </span>
                        </>
                      );
                    })()}
                    <button
                      className="gen-btn"
                      onClick={() => handleGenerateFix(fix)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 700, color: PURPLE, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.2s' }}
                    >
                      {generatingFix === fix.id ? <><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9L192 301.3l67.9 67.9c4.6 4.6 8.6 9.6 12.1 14.9L112 384z"/></svg> Generating...</> : showContent === fix.id ? <><svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> Hide content</> : <><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M464 6.1c9.5-8.5 24-8.1 33 .9l8 8c9 9 9.4 23.5 .9 33l-85.8 95.9c-2.6 2.9-4.1 6.7-4.1 10.7l0 21.4c0 8.8-7.2 16-16 16l-15.8 0c-4.6 0-8.9 1.9-11.9 5.3L100.7 500.9C94.3 508 85.3 512 75.8 512c-8.8 0-17.3-3.5-23.5-9.8L9.7 459.7C3.5 453.4 0 445 0 436.2c0-9.5 4-18.5 11.1-24.8l111.6-99.8c3.4-3 5.3-7.4 5.3-11.9l0-27.6c0-8.8 7.2-16 16-16l34.6 0c3.9 0 7.7-1.5 10.7-4.1L464 6.1zM432 288c3.6 0 6.7 2.4 7.7 5.8l14.8 51.7 51.7 14.8c3.4 1 5.8 4.1 5.8 7.7s-2.4 6.7-5.8 7.7l-51.7 14.8-14.8 51.7c-1 3.4-4.1 5.8-7.7 5.8s-6.7-2.4-7.7-5.8l-14.8-51.7-51.7-14.8c-3.4-1-5.8-4.1-5.8-7.7s2.4-6.7 5.8-7.7l51.7-14.8 14.8-51.7c1-3.4 4.1-5.8 7.7-5.8zM87.7 69.8l14.8 51.7 51.7 14.8c3.4 1 5.8 4.1 5.8 7.7s-2.4 6.7-5.8 7.7l-51.7 14.8L87.7 218.2c-1 3.4-4.1 5.8-7.7 5.8s-6.7-2.4-7.7-5.8L57.5 166.5 5.8 151.7c-3.4-1-5.8-4.1-5.8-7.7s2.4-6.7 5.8-7.7l51.7-14.8L72.3 69.8c1-3.4 4.1-5.8 7.7-5.8s6.7 2.4 7.7 5.8zM208 0c3.7 0 6.9 2.5 7.8 6.1l6.8 27.3 27.3 6.8c3.6 .9 6.1 4.1 6.1 7.8s-2.5 6.9-6.1 7.8l-27.3 6.8-6.8 27.3c-.9 3.6-4.1 6.1-7.8 6.1s-6.9-2.5-7.8-6.1l-6.8-27.3-27.3-6.8c-3.6-.9-6.1-4.1-6.1-7.8s2.5-6.9 6.1-7.8l27.3-6.8 6.8-27.3c.9-3.6 4.1-6.1 7.8-6.1z"/></svg> View generated content</>}
                    </button>
                  </div>
                  {scan?.id && (
                    <div style={{ paddingLeft: 34 }}>
                      <MarkFixApplied scanId={scan.id} fixType={fix.fix_type ?? 'general'} />
                    </div>
                  )}
                  {fixError[fix.id] && (
                    <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginTop: 10, marginLeft: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 12.5, color: '#991B1B', fontWeight: 600, margin: 0 }}>{fixError[fix.id]}</p>
                      <button onClick={() => handleGenerateFix(fix)} style={{ background: '#DC2626', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        Retry
                      </button>
                    </div>
                  )}
                  {showContent === fix.id && generatedContent[fix.id] && (
                    <div style={{ marginTop: 14, paddingLeft: 34 }}>
                      {fixWarning[fix.id] && (
                        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1.5px solid #F59E0B', borderRadius: 10, padding: '12px 16px', marginBottom: 10, fontSize: 13, color: '#B45309', fontWeight: 600 }}>
                          {fixWarning[fix.id]}
                        </div>
                      )}
                      <div style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Generated for: {scan?.input}
                          </span>
                          <button
                            onClick={() => copyToClipboard(generatedContent[fix.id], fix.id)}
                            style={{ background: copiedFixId === fix.id ? '#059669' : BLUE, border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}
                          >
                            {copiedFixId === fix.id ? <>Copied! <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></> : <>Copy <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>}
                          </button>
                        </div>
                        <pre style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>
                          {generatedContent[fix.id]}
                        </pre>
                      </div>

                      {/* Impact / quality metadata card */}
                      {fixMetadata[fix.id] && (
                        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px', marginTop: 10 }}>
                          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12 }}>
                            {fixMetadata[fix.id].estimatedImpact && (
                              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg> Expected Impact: <span style={{ color: '#059669' }}>{fixMetadata[fix.id].estimatedImpact}</span></span>
                            )}
                            {fixMetadata[fix.id].timeToImplement && (
                              <span style={{ fontSize: 13, fontWeight: 600, color: GRAY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg> Time: {fixMetadata[fix.id].timeToImplement}</span>
                            )}
                            {fixMetadata[fix.id].difficulty && (
                              <span style={{ fontSize: 13, fontWeight: 600, color: GRAY }}><svg viewBox="0 0 640 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M96 64c0-17.7 14.3-32 32-32l32 0c17.7 0 32 14.3 32 32l0 160 0 64 0 160c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-64-32 0c-17.7 0-32-14.3-32-32l0-64c-17.7 0-32-14.3-32-32s14.3-32 32-32l0-64c0-17.7 14.3-32 32-32l32 0 0-64zm448 0l0 64 32 0c17.7 0 32 14.3 32 32l0 64c17.7 0 32 14.3 32 32s-14.3 32-32 32l0 64c0 17.7-14.3 32-32 32l-32 0 0 64c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-160 0-64 0-160c0-17.7 14.3-32 32-32l32 0c17.7 0 32 14.3 32 32zM416 224l0 64-192 0 0-64 192 0z"/></svg> Difficulty: {fixMetadata[fix.id].difficulty}</span>
                            )}
                          </div>
                          {fixMetadata[fix.id].howToVerify && (
                            <p style={{ fontSize: 12.5, color: GRAY, lineHeight: 1.6, marginBottom: 12 }}>
                              <strong style={{ color: NAVY }}>How to verify:</strong> {fixMetadata[fix.id].howToVerify}
                            </p>
                          )}
                          {fixMetadata[fix.id].relatedSignals && fixMetadata[fix.id].relatedSignals!.length > 0 && (
                            <div>
                              <p style={{ fontSize: 12.5, fontWeight: 700, color: NAVY, marginBottom: 6 }}>This fix improves these Trust Layer signals:</p>
                              <ul style={{ margin: '0 0 12px 18px', padding: 0 }}>
                                {fixMetadata[fix.id].relatedSignals!.map((sig, i) => (
                                  <li key={i} style={{ fontSize: 12.5, color: GRAY, lineHeight: 1.7 }}>{sig}</li>
                                ))}
                              </ul>
                              <a href="/dashboard/trust" style={{ fontSize: 12.5, fontWeight: 700, color: BLUE, textDecoration: 'none' }}>View in Trust Layer <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* How to add this to your site */}
                      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px', marginTop: 10 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 12 }}>How to add this to your site</p>
                        <div className="platform-tabs" style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                          {(['HTML Site', 'WordPress', 'Webflow / Squarespace', 'Shopify'] as const).map(tab => (
                            <button
                              key={tab}
                              onClick={() => setActiveTab(prev => ({ ...prev, [fix.id]: tab }))}
                              style={{
                                background: (activeTab[fix.id] || 'HTML Site') === tab ? NAVY : BG,
                                color: (activeTab[fix.id] || 'HTML Site') === tab ? '#fff' : GRAY,
                                border: `1.5px solid ${(activeTab[fix.id] || 'HTML Site') === tab ? NAVY : BORDER}`,
                                borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                              }}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        {(activeTab[fix.id] || 'HTML Site') === 'HTML Site' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Copy the code above using the Copy → button.',
                              'Open your HTML file in a text editor.',
                              'Paste the code inside the <head> tag (before </head>).',
                              'Save and re-upload the file to your server.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {(activeTab[fix.id] || 'HTML Site') === 'WordPress' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Copy the code above using the Copy → button.',
                              'In WordPress, go to Appearance → Theme File Editor (or use a plugin like Insert Headers and Footers).',
                              'Open your theme\'s header.php and paste the code just before </head>.',
                              'Click Update File to save.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {(activeTab[fix.id] || 'HTML Site') === 'Webflow / Squarespace' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Copy the code above using the Copy → button.',
                              'Webflow: go to Project Settings → Custom Code → paste into the Head Code section. Click Save.',
                              'Squarespace: go to Settings → Advanced → Code Injection → paste into the Header section. Click Save.',
                              'Publish your site for the changes to go live.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {(activeTab[fix.id] || 'HTML Site') === 'Shopify' && fix.fix_type === 'directory' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Identify the top 2–3 directories AI platforms cite most in your market (check your trust signals above).',
                              'Search for your business on each directory.',
                              'Claim your listing and verify ownership.',
                              'Complete the full profile: services, photos, hours, description, and contact details.',
                              'Build your review presence on the platforms AI cites most in your market.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {(activeTab[fix.id] || 'HTML Site') === 'Shopify' && fix.fix_type === 'reddit' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Find relevant subreddits for your industry and city.',
                              'Participate genuinely for 2 weeks before promoting.',
                              'Answer questions related to your expertise.',
                              'Mention your business only when directly relevant.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {(activeTab[fix.id] || 'HTML Site') === 'Shopify' && fix.fix_type !== 'directory' && fix.fix_type !== 'reddit' && (
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {[
                              'Copy the code above using the Copy → button.',
                              'In Shopify, go to Online Store → Themes → Edit Code.',
                              'Open theme.liquid.',
                              'Paste the code before the closing </head> tag.',
                              'Click Save.',
                            ].map((step, i) => (
                              <li key={i} style={{ fontSize: 13, color: GRAY, lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {fix.status === 'pending' ? (
                    <>
                    <button
                      className="apply-btn"
                      onClick={() => handleApplyFix(fix)}
                      disabled={applyingFix === fix.id}
                      style={{ background: applyingFix === fix.id ? LGRAY : BLUE, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: applyingFix === fix.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                    >
                      {applyingFix === fix.id ? 'Saving...' : <>I applied this fix <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></>}
                    </button>
                    {applyError[fix.id] && (
                      <p style={{ fontSize: 12, color: RED, fontWeight: 600, margin: '8px 0 0' }}>{applyError[fix.id]}</p>
                    )}
                    </>
                  ) : (
                    <button
                      onClick={() => handleUndoFix(fix)}
                      onMouseEnter={() => setHoveredUndo(fix.id)}
                      onMouseLeave={() => setHoveredUndo(null)}
                      style={{
                        background: hoveredUndo === fix.id ? '#FEF2F2' : '#ECFDF5',
                        border: `1px solid ${hoveredUndo === fix.id ? '#FCA5A5' : '#A7F3D0'}`,
                        borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700,
                        color: hoveredUndo === fix.id ? RED : GREEN,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      {hoveredUndo === fix.id ? <>Undo <svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></> : <><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Applied</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </Fragment>
            );
          })}

          {/* GATE CARD — shown to logged-out users after fix #1 (suppressed while auth is loading) */}
          {!isLoggedIn && !authLoading && !fixesLoading && fixes.length > 0 && (
            <>
              {/* Gated fixes #2–5. b0fm: the old blurred block rendered
                  every locked fix's title, description, impact and
                  confidence in the DOM — readable via view-source. Gated
                  fixes are NOT rendered now; skeleton cards carry no content. */}
              <div style={{ position: 'relative' }}>
                <div aria-hidden="true">
                  {Array.from({ length: Math.min(fixes.length - 1, 3) }).map((_, i) => (
                    <div key={i} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: BORDER }} />
                        <div style={{ height: 15, width: '45%', background: BORDER, borderRadius: 6 }} />
                      </div>
                      <div style={{ height: 13, width: '80%', background: BORDER, borderRadius: 6, marginBottom: 6, marginLeft: 34 }} />
                      <div style={{ height: 13, width: '55%', background: BORDER, borderRadius: 6, marginLeft: 34 }} />
                    </div>
                  ))}
                </div>
                {/* Lock overlay with gate card */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: NAVY, borderRadius: 20, padding: '32px 36px', maxWidth: 520, width: '90%', textAlign: 'center', boxShadow: '0 8px 40px rgba(15,23,42,0.35)' }}>
                    <div style={{ width: 48, height: 48, background: BLUE, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, color: '#fff' }}><svg viewBox="0 0 448 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg></div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(27,23,255,0.2)', border: '1px solid rgba(27,23,255,0.4)', borderRadius: 100, padding: '4px 14px', marginBottom: 14 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8D8BFF' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Free to unlock</span>
                    </div>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>Unlock your full fix queue + all platform responses</h3>
                    <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20, lineHeight: 1.7 }}>Create a free account to see all {fixes.length} personalised fixes, the full platform breakdown, and generated fix content.</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                      {[`${fixes.length} personalised fixes`, 'Full platform breakdown', 'Generated fix content', 'Verification rescans'].map(item => (
                        <span key={item} style={{ fontSize: 12, fontWeight: 600, color: '#8D8BFF', background: 'rgba(27,23,255,0.15)', border: '1px solid rgba(27,23,255,0.3)', borderRadius: 100, padding: '4px 12px' }}>{item}</span>
                      ))}
                    </div>
                    <a href="/signup" style={{ display: 'block', background: BLUE, borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', marginBottom: 12, boxShadow: '0 4px 16px rgba(27,23,255,0.5)' }}>
                      Create free account — see all {fixes.length} fixes free
                    </a>
                    {/* CONV-03: risk reversal at every CTA */}
                    <RiskReversal compact />
                    <a href="/login" style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'none' }}>
                      Already have an account? <span style={{ color: '#8D8BFF', fontWeight: 600 }}>Log in</span>
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* GATE CARD — shown to logged-in free users after fix #1 (suppressed while auth is loading) */}
          {isLoggedIn && !isPaid && !authLoading && !fixesLoading && fixes.length > 1 && (
            <div style={{ background: '#ECEBFF', border: '2px solid #1B17FF', borderRadius: 14, padding: '24px', textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0A0A14', marginBottom: 6 }}>{<svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg>} {fixes.length - 1} more fix{fixes.length - 1 > 1 ? 'es' : ''} available</p>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Unlock the complete fix queue with AI-generated content ready to paste.</p>
              <a href="/pricing?plan=business" style={{ background: '#1B17FF', color: '#fff', borderRadius: 10, padding: '12px 24px', textDecoration: 'none', fontSize: 14, fontWeight: 700, display: 'inline-block' }}>
                Upgrade to Local Pro <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
              {/* CONV-03: risk reversal at every CTA */}
              <RiskReversal compact />
            </div>
          )}

          <div style={{ background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 12, padding: '14px 20px', marginTop: 4, display: fixesLoading || !isLoggedIn || fixesError ? 'none' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Total predicted improvement</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>{currentScore} → {fixesReady ? predictedScore : '\u2026'} (estimate)</span>
            </div>
          </div>
        </div>

        {/* RECOMMENDATION SIMULATOR */}
        {scan && !fixesLoading && fixes.length > 0 && (() => {
          const simCountryCode = scanCountryCode || scan.country_code || 'US';
          const avgValue = getAvgCustomerValue(scan.industry ?? '', simCountryCode);
          const platformsCovered = appearedOn;
          // ax80: one revenue model — revenueGapForScan (1 − mentioned/responded),
          // the same helper the top-of-report and exec-summary blocks use.
          const cfg = getCountryConfig(simCountryCode);
          const monthlyInquiries = cfg.monthlyAIInquiries ?? 50;
          const revenueGap = revenueGapForScan({
            mentionedCount: platformsCovered,
            respondedPlatforms: completedPlatformCount,
            avgCustomerValue: avgValue,
            monthlyAIInquiries: monthlyInquiries,
          });
          return (
            <RecommendationSimulator
              currentScore={currentScore}
              industry={scan.industry ?? ''}
              city={scan.location ?? ''}
              countryCode={simCountryCode}
              // b029: measured competitor score when the scan recorded
              // one; never a fallback (lib/simulator.ts contract).
              competitorScore={compScanData?.score ?? null}
              platformsCovered={platformsCovered}
              fixes={fixes.map(f => ({ id: f.id, title: f.title, fix_type: f.fix_type, predicted_impact: f.predicted_impact }))}
              revenueGap={revenueGap}
              revenueSymbol={SYM}
              scanId={scan.id}
              userId={userId}
            />
          );
        })()}

        {/* SUCCESS NOTIFICATION */}
        {appliedFix && (
          <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, background: GREEN, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 18 }}><svg viewBox="0 0 448 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Fix recorded — verification rescan in ~7 days</p>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65, marginBottom: 14 }}>We will automatically rescan your business in about 7 days to verify the fix and send you the before/after comparison. If your score improves we will generate a verified proof card.</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>What to expect:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { range: 'Now',       desc: 'Fix recorded — keep it live on your site or profile' },
                    { range: 'Day 7',     desc: 'Verification rescan (or the date you chose) measures the real before/after' },
                    { range: 'Varies',    desc: "Each AI platform reflects changes on its own refresh cycle — some sooner, some later" },
                  ].map(({ range, desc }) => (
                    <div key={range} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{range}</span>
                      <span style={{ fontSize: 12, color: GRAY, lineHeight: 1.5 }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PLATFORM RESPONSES — logged-in only (suppressed while auth is loading to avoid flash) */}
        {!authLoading && !viewerFull ? (
          <div style={{ background: NAVY, borderRadius: 20, padding: '28px 32px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Platform Breakdown</p>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 6 }}>See what every AI platform says about you</p>
              <p style={{ fontSize: 13, color: '#94A3B8' }}>Full responses from all {results.length > 0 ? results.length : 12} platforms — free with an account</p>
            </div>
            <a href="/signup" style={{ background: BLUE, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
              Create free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </a>
          </div>
        ) : viewerFull ? (
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 20 }}>Full AI Platform Responses</h2>
          {results.map((r, i) => (
            <div key={r.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < results.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{r.platform}</span>
                {hasResponse(r)
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '3px 10px' }}>Responded</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, color: RED, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 100, padding: '3px 10px' }}>No response</span>
                }
              </div>
              {r.response_text && (
                <div>
                  <div style={{ background: BG, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BLUE}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                    <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                      "{expandedIdx === i ? r.response_text : r.response_text.slice(0, 200) + (r.response_text.length > 200 ? '...' : '')}"
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600, color: BLUE, fontFamily: 'inherit' }}
                  >
                    {expandedIdx === i ? <><svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> Hide full response</> : <><svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg> View full response</>}
                  </button>
                  {expandedIdx === i && (
                    <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 12, padding: '20px 24px', marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #C9C6FF' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Full response · {r.platform}</span>
                        <span style={{ fontSize: 11, color: LGRAY }}>{scanDate}</span>
                      </div>
                      <div style={{ fontSize: 14, color: NAVY, lineHeight: 1.85 }}>
                        {r.response_text.split('\n').map((line, lineIdx) => {
                          const parts = line.split(/\*\*(.*?)\*\*/g);
                          return (
                            <p key={lineIdx} style={{ marginBottom: line.trim() === '' ? 0 : 10 }}>
                              {parts.map((part, partIdx) =>
                                partIdx % 2 === 1
                                  ? <strong key={partIdx} style={{ fontWeight: 700, color: BLUE }}>{part}</strong>
                                  : part
                              )}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        ) : null}

        {/* TIER 3 — Paid features: rescan history, proof card, ROI calculator */}
        {isPaid && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, background: '#ECEBFF', border: '1.5px solid #DCDAFF', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color: PURPLE }}><svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg></div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Included in your plan</p>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>Score History & Proof Cards</h2>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
              <a href="/dashboard/score-history" style={{ background: '#ECEBFF', border: '1.5px solid #DCDAFF', borderRadius: 14, padding: '18px', textDecoration: 'none', display: 'block' }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: PURPLE, marginBottom: 4 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg></p>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Score History</p>
                <p style={{ fontSize: 12, color: GRAY }}>See your progress over time with every rescan</p>
              </a>
              <a href="/dashboard/fix" style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 14, padding: '18px', textDecoration: 'none', display: 'block' }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: GREEN, marginBottom: 4 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></p>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Verified Proof Cards</p>
                <p style={{ fontSize: 12, color: GRAY }}>Before/after proof for every fix you apply</p>
              </a>
              <a href="/dashboard/roi" style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '18px', textDecoration: 'none', display: 'block' }}>
                <p style={{ fontSize: 22, fontWeight: 900, color: BLUE, marginBottom: 4 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M320 96L192 96 144.6 24.9C137.5 14.2 145.1 0 157.9 0L354.1 0c12.8 0 20.4 14.2 13.3 24.9L320 96zM192 128l128 0c3.8 2.5 8.1 5.3 13 8.4C389.7 172.7 512 250.9 512 416c0 53-43 96-96 96L96 512c-53 0-96-43-96-96C0 250.9 122.3 172.7 179 136.4c0 0 0 0 0 0s0 0 0 0c4.8-3.1 9.2-5.9 13-8.4zm84 88c0-11-9-20-20-20s-20 9-20 20l0 14c-7.6 1.7-15.2 4.4-22.2 8.5c-13.9 8.3-25.9 22.8-25.8 43.9c.1 20.3 12 33.1 24.7 40.7c11 6.6 24.7 10.8 35.6 14l1.7 .5c12.6 3.8 21.8 6.8 28 10.7c5.1 3.2 5.8 5.4 5.9 8.2c.1 5-1.8 8-5.9 10.5c-5 3.1-12.9 5-21.4 4.7c-11.1-.4-21.5-3.9-35.1-8.5c-2.3-.8-4.7-1.6-7.2-2.4c-10.5-3.5-21.8 2.2-25.3 12.6s2.2 21.8 12.6 25.3c1.9 .6 4 1.3 6.1 2.1c0 0 0 0 0 0s0 0 0 0c8.3 2.9 17.9 6.2 28.2 8.4l0 14.6c0 11 9 20 20 20s20-9 20-20l0-13.8c8-1.7 16-4.5 23.2-9c14.3-8.9 25.1-24.1 24.8-45c-.3-20.3-11.7-33.4-24.6-41.6c-11.5-7.2-25.9-11.6-37.1-15c0 0 0 0 0 0l-.7-.2c-12.8-3.9-21.9-6.7-28.3-10.5c-5.2-3.1-5.3-4.9-5.3-6.7c0-3.7 1.4-6.5 6.2-9.3c5.4-3.2 13.6-5.1 21.5-5c9.6 .1 20.2 2.2 31.2 5.2c10.7 2.8 21.6-3.5 24.5-14.2s-3.5-21.6-14.2-24.5c-6.5-1.7-13.7-3.4-21.1-4.7l0-13.9z"/></svg></p>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>ROI Calculator</p>
                <p style={{ fontSize: 12, color: GRAY }}>Estimate new patient / client value from AI visibility</p>
              </a>
            </div>
          </div>
        )}

        {/* DASHBOARD BANNER — logged-in users only */}
        {isLoggedIn && (
          <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 16, padding: '20px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>This report is saved to your dashboard.</p>
              <p style={{ fontSize: 13, color: GRAY }}>Your score history updates whenever a scan or rescan runs, and fixes are verified by a rescan after you apply them.</p>
            </div>
            <a href="/dashboard" style={{ background: BLUE, borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
              View Dashboard <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </a>
          </div>
        )}

        {/* BOTTOM CTA — context-aware: changes based on auth state */}
        {!authLoading && (
          <div style={{ background: NAVY, borderRadius: 20, padding: '40px', textAlign: 'center' }}>
            {isPaid ? (
              // Paid user — go to dashboard
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Your account</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>
                  Track your progress in the dashboard
                </p>
                <p style={{ fontSize: 15, color: '#94A3B8', marginBottom: 28, lineHeight: 1.7 }}>
                  Verification rescans. Verified proof cards. Full fix history.<br />
                  Everything is saved to your account.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href="/dashboard" style={{ background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
                    Go to Dashboard <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                  </a>
                  <a href="/" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                    Scan another business
                  </a>
                </div>
              </>
            ) : isPersonalTier(plan) ? (
              // Personal pro user — switch to local
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Switch to Local Business Optimization</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>
                  Switch to Local Pro for business optimization
                </p>
                <p style={{ fontSize: 15, color: '#94A3B8', marginBottom: 28, lineHeight: 1.7 }}>
                  You have Personal Brand. For local business AI visibility, Local Pro gives you competitor intel, fix engine, and revenue gap calculator.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href="/pricing?plan=business" style={{ background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
                    Switch to Local Pro for business optimization <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                  </a>
                </div>
              </>
            ) : isLoggedIn ? (
              // Logged in free user — upgrade CTA
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Upgrade your plan</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>
                  Unlock the full fix queue
                </p>
                <p style={{ fontSize: 15, color: '#94A3B8', marginBottom: 28, lineHeight: 1.7 }}>
                  Verification rescans. Generated fix content. Verified proof of improvement.<br />
                  One price. Everything included.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href="/pricing?plan=business" style={{ background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
                    Upgrade to Local Pro <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                  </a>
                  <a href="/dashboard" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                    Go to Dashboard
                  </a>
                </div>
                <p style={{ fontSize: 12, color: '#475569', marginTop: 16 }}>Card required · Cancel any time{currency.monthly != null ? ` · ${currency.symbol}${currency.monthly}/month after trial` : ''}</p>
              </>
            ) : (
              // Logged out — signup CTA
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Start fixing today</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>
                  Get your verified baseline free
                </p>
                <p style={{ fontSize: 15, color: '#94A3B8', marginBottom: 28, lineHeight: 1.7 }}>
                  Verification rescans. Generated fix content. Verified proof of improvement.<br />
                  One price. Everything included.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href="/signup" style={{ background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(27,23,255,0.4)' }}>
                    Create free account <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                  </a>
                  <a href="/" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 32px', fontSize: 15, fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                    Scan another business
                  </a>
                </div>
                <p style={{ fontSize: 12, color: '#475569', marginTop: 16 }}>Card required · Cancel any time{currency.monthly != null ? ` · ${currency.symbol}${currency.monthly}/month after trial` : ''}</p>
              </>
            )}
          </div>
        )}

      </div>

      {/* Sticky outreach CTA — shown only to non-logged-in visitors (e.g. from
          an outreach link). Suppressed while auth is still resolving.
          b0fj: dismissible — the fixed bar sits over the bottom of the
          viewport and could cover buttons beneath it (e.g. the fix-queue
          Retry). The user can close it for this page view. */}
      {!isLoggedIn && !authLoading && !ctaDismissed && !fixesLoading && fixes.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#1B17FF', padding: '14px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 1000, boxShadow: '0 -4px 20px rgba(124,58,237,0.4)',
        }}>
          <div>
            <p style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 600 }}>
              Unlock all {fixes.length} fixes and start improving your AI visibility
            </p>
            <p style={{ color: '#c4b5fd', margin: '2px 0 0', fontSize: 13 }}>
              7-day free trial · Card required
            </p>
          </div>
          <button
            onClick={() => setCtaDismissed(true)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: '#c4b5fd', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px 4px 4px 12px', marginLeft: 8, flexShrink: 0 }}
          >
            ×
          </button>
          <a
            href={`/signup?next=/report/${id}`}
            style={{
              background: 'white', color: '#1B17FF', padding: '12px 24px',
              borderRadius: 8, textDecoration: 'none', fontWeight: 700,
              fontSize: 14, whiteSpace: 'nowrap', marginLeft: 16,
            }}>
            Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
        </div>
      )}
    </div>
  );
}
