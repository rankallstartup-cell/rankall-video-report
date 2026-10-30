// ── Alina tool layer (spec §2–§3) ───────────────────────────────────────────
// One validated function per tool. Tools run SERVER-SIDE only, inside the
// chat route — the model never calls a database or an API directly, and no
// tool accepts a userId argument from the model or the client (identity
// for signed-in tools comes from the session on the server).
//
// A3 starts the layer with get_pricing (deterministic, no model
// judgement). A6 adds the tool loop + the remaining tools. A3 also wires
// a DETERMINISTIC pricing-intent trigger in the chat route: until A6's
// tool loop exists, the route attaches a PricingCard block whenever the
// visitor's message is a pricing question. The block is server-computed
// ground truth, so it renders even when the model call fails — the
// visitor asked a pricing question and still gets the true price.
//
// PRICES: every price comes from lib/publicStats.ts (FOUNDER_PRICING_USD).
// No price literal lives in this file. Signup links use ONLY the ?plan=
// keys the signup page accepts (app/signup/page.tsx): local_pro,
// personal_pro, product_pro, agency, free. Tiers without a signup key
// (Enterprise, Government, SEO, Global Brand Intelligence) get a
// /contact CTA, mirroring the pricing page's Enterprise "Contact Us".
import { NextRequest } from 'next/server';
import { FOUNDER_PRICING_USD, PLATFORMS_SCANNED } from './publicStats';
import { TRIAL_DAYS } from './trial';
import { TRIAL_MAX_LOCATIONS } from './trialCaps';
// A4: capture_lead delivers through the same pipeline as /api/contact —
// sendEmail (Resend) to the team inbox hello@rankall.io. Same honest
// failure semantics: sendEmail returns false (never throws) when the key
// is missing or Resend rejects, and captureLead reports { captured: false }
// so the widget shows the hello@rankall.io fallback, never a fake
// confirmation.
import { sendEmail } from './emailTemplates';

// ── Types ───────────────────────────────────────────────────────────────────

export type PricingNeed =
  | 'local' | 'personal' | 'product' | 'agency'
  | 'enterprise' | 'government' | 'seo' | 'global';

export type PricingTier = {
  name: string;
  monthly: number;
  blurb: string;
  /** CTA for this tier: signup with the plan pre-selected, or /contact. */
  cta: { label: string; href: string };
};

export type PricingResult = {
  tiers: PricingTier[];
  trial: { days: number; cardRequired: boolean; locations: number };
};

/** The block the chat route returns and the widget renders (PricingCard). */
export type PricingBlock = { kind: 'pricing' } & PricingResult;

export type ScanPlatform = {
  name: string;
  status: 'mentioned' | 'not_mentioned' | 'not_responded';
  mentionRate: number;
  weight: number;
};

export type ScanCardData = {
  scanId: string;
  businessName: string;
  score: number;
  mentionedCount: number;
  totalPlatforms: number;
  respondedCount: number;
  partial: boolean;
  missingPlatforms: string[];
  platforms: ScanPlatform[];
  topCompetitors: Array<{ name: string; score: number | null }>;
  reportUrl: string;
};

export type ScanBlock = { kind: 'scan'; scan: ScanCardData };

export type FixPlanItem = {
  title: string;
  fixType: string;
  /** Canonical impact (metadata midpoint) — the same number the report queue shows.
   *  null when the fix type has no metadata range: unknown impact is OMITTED,
   *  never printed as +0 (ax6v). The real Royal Lane scan has a bing_places
   *  fix with exactly this shape. */
  impact: number | null;
  effort: string;
  group: 'diy' | 'web';
};

export type FixPlanData = {
  scanId: string;
  fixes: FixPlanItem[];
  totalPending: number;
  reportUrl: string;
};

export type FixPlanBlock = { kind: 'fix_plan'; plan: FixPlanData };

export type DraftData = {
  scanId: string;
  fixType: string;
  title: string;
  content: string;
  /** True only when the draft is persisted for a signed-in visitor. */
  saved: boolean;
  /** Signup CTA for anonymous visitors (draft shown on-screen, not saved). */
  signupUrl: string | null;
};

export type DraftBlock = { kind: 'draft'; draft: DraftData };

export type VerificationData = {
  scanId: string;
  state: 'none' | 'pending' | 'done';
  /** Days until the verification rescan (pending only; 0 = due now). */
  dueInDays: number | null;
  beforeScore: number | null;
  afterScore: number | null;
  reportUrl: string;
};

export type VerificationBlock = { kind: 'verification'; verification: VerificationData };

/** All blocks the chat route can return. */
export type ChatBlock = PricingBlock | LeadBlock | ScanBlock | FixPlanBlock | DraftBlock | VerificationBlock;

// ── Scan tools (A7) ────────────────────────────────────────────────────────
// start_free_scan dispatches to the REAL scan route, in-process, with the
// visitor's own cookies + trusted client IP — so a chat scan is metered,
// attributed, and gated exactly like a homepage scan (anonymous cap
// 3/day/IP, business-not-found gate, cache). The scan route's own
// 45s master timeout bounds the call; the chat route's maxDuration is
// 60 for the same reason. get_scan_summary / explain_score read the
// stored scan row + platform rows (service_role) — never trust the
// model's numbers. Ownership: a scan with an owner is visible only to
// that owner (or an admin); ownerless scans are share-link scans.
// Not-found and not-owned return the SAME message (no enumeration).
import { getSupabaseAdmin } from './supabase';
import { isAdminUser } from './planConfig';
// A8: the fix plan reads through the single reader (lib/fixes.ts) —
// the same canonical-impact, deduped, impact-ranked list the report
// queue shows. Grouping uses the report's own rule (ax71): metadata
// difficulty Easy -> "Do it yourself", anything else -> web person.
import { getFixesForScan } from './fixes';
import { getFixMetadata } from './fixQuality';
// A10: draft content comes from the product's own single-fix generator
// (lib/generateFix.ts) — deterministic for crawler_access / bing_places,
// Anthropic otherwise, throws (never empty) on failure.
import { generateFixContent } from './generateFix';

const SCAN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredScan = {
  id: string;
  user_id: string | null;
  input: string;
  overall_score: number | null;
  mentioned_count: number | null;
  competitor_name: string | null;
  competitor_score: number | null;
  recommendation_share: number | null;
  failed_platforms: string[] | null;
  scan_reliable: boolean | null;
  user_business_name: string | null;
  business_city: string | null;
  location: string | null;
  created_at: string | null;
  industry: string | null;
  country_code: string | null;
};

type StoredPlatformRow = {
  platform: string;
  weight: number | null;
  mentioned: boolean | null;
  mention_rate: number | null;
  error: string | null;
};

function toScanPlatform(row: StoredPlatformRow): ScanPlatform {
  return {
    name: row.platform,
    status: row.error ? 'not_responded' : row.mentioned ? 'mentioned' : 'not_mentioned',
    mentionRate: typeof row.mention_rate === 'number' ? row.mention_rate : row.mentioned ? 1 : 0,
    weight: typeof row.weight === 'number' ? row.weight : 0,
  };
}

async function readScan(scanId: string, identity: ToolIdentity): Promise<
  | { scan: StoredScan; platforms: ScanPlatform[] }
  | { error: string }
> {
  const NOT_FOUND = 'Scan not found.';
  if (!SCAN_ID_RE.test(scanId)) return { error: NOT_FOUND };
  try {
    const admin = getSupabaseAdmin();
    const { data: scan, error: scanError } = await admin
      .from('rankall_scans')
      .select('id,user_id,input,overall_score,mentioned_count,competitor_name,competitor_score,recommendation_share,failed_platforms,scan_reliable,user_business_name,business_city,location,created_at,industry,country_code')
      .eq('id', scanId)
      .maybeSingle();
    if (scanError || !scan) return { error: NOT_FOUND };
    const row = scan as unknown as StoredScan;
    if (row.user_id && row.user_id !== identity.userId && !isAdminUser(identity.email ?? null)) {
      return { error: NOT_FOUND };
    }
    let platforms: ScanPlatform[] = [];
    try {
      const { data: rows, error: rowsError } = await admin
        .from('rankall_platform_results')
        .select('platform,weight,mentioned,mention_rate,error')
        .eq('scan_id', scanId);
      if (!rowsError && Array.isArray(rows)) {
        platforms = (rows as unknown as StoredPlatformRow[]).map(toScanPlatform);
      }
    } catch {
      platforms = [];
    }
    return { scan: row, platforms };
  } catch {
    return { error: NOT_FOUND };
  }
}

function summarizeScan(scan: StoredScan, platforms: ScanPlatform[]): ScanCardData {
  const responded = platforms.filter((p) => p.status !== 'not_responded');
  const missing = Array.from(
    new Set([
      ...platforms.filter((p) => p.status === 'not_responded').map((p) => p.name),
      ...(scan.failed_platforms ?? []),
    ]),
  );
  return {
    scanId: scan.id,
    businessName: scan.user_business_name || scan.input,
    score: typeof scan.overall_score === 'number' ? scan.overall_score : 0,
    mentionedCount: platforms.filter((p) => p.status === 'mentioned').length,
    totalPlatforms: PLATFORMS_SCANNED,
    respondedCount: responded.length,
    partial: missing.length > 0 || responded.length < PLATFORMS_SCANNED,
    missingPlatforms: missing,
    platforms,
    topCompetitors: scan.competitor_name
      ? [{ name: scan.competitor_name, score: typeof scan.competitor_score === 'number' ? scan.competitor_score : null }]
      : [],
    reportUrl: `/report/${scan.id}`,
  };
}

async function runScan(input: {
  businessName?: string;
  category?: string;
  city: string;
  websiteUrl?: string;
}, ctx: ToolRequestContext | undefined): Promise<ExecutedToolPartial> {
  if (!ctx) return { ok: false as const, error: 'Scan dispatch unavailable.' };
  const businessName = (input.businessName ?? '').trim().slice(0, 120);
  const category = (input.category ?? '').trim().slice(0, 60);
  const city = (input.city ?? '').trim().slice(0, 60);
  const websiteUrl = (input.websiteUrl ?? '').trim().slice(0, 2048);
  if (!city) return { ok: false as const, error: 'start_free_scan needs a city.' };
  if (!businessName && !category) {
    return { ok: false as const, error: 'start_free_scan needs a business name or a category + city.' };
  }
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
    return { ok: false as const, error: 'start_free_scan websiteUrl must start with http:// or https://.' };
  }
  // Same input shape the homepage form produces. Kept under the scan
  // route's 200-char query cap by the slices above.
  const query = businessName
    ? `${businessName}, ${city}`
    : `best ${category} in ${city}`;
  try {
    // Lazy import: the scan route pulls the whole scan dependency graph
    // (Sentry, analyser, platforms). Only load it when a scan runs.
    const { POST: scanPOST } = await import('@/app/api/scan/route');
    const scanReq = new NextRequest('http://localhost/api/scan', {
      method: 'POST',
      headers: {
        ...ctx.headers,
        'x-forwarded-for': ctx.clientIp,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: query,
        websiteUrl: websiteUrl || undefined,
        detectedCity: city,
        detectedCategory: category || undefined,
      }),
    });
    const res = await scanPOST(scanReq);
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 404 && (payload as { error?: string } | null)?.error === 'business_not_found') {
      return {
        ok: false as const,
        error: 'business_not_found',
        message: `${(payload as { message?: string }).message ?? 'We could not verify that business.'} The visitor's original message is preserved in the conversation — ask only for the exact name + city correction, never for everything again.`,
      };
    }
    if (res.status === 429) {
      return {
        ok: false as const,
        error: 'rate_limited',
        retryAfterHours: 24,
        message: `${(payload as { error?: string })?.error ?? 'Free scan limit reached.'} Say so honestly and do not claim a scan started.`,
      };
    }
    if (!res.ok || !payload || (payload as { success?: boolean }).success !== true) {
      return {
        ok: false as const,
        error: 'scan_failed',
        message: (payload as { error?: string; message?: string })?.message
          ?? (payload as { error?: string })?.error
          ?? 'The scan could not be started. Ask the visitor to try the homepage scan form.',
      };
    }
    const p = payload as {
      scanId: string; overallScore: number; mentionedCount: number;
      partial: boolean; platformsCompleted: number; platformsTotal: number;
      failedPlatforms: string[]; competitor: string | null;
    };
    const card: ScanCardData = {
      scanId: p.scanId,
      businessName: businessName || query,
      score: typeof p.overallScore === 'number' ? p.overallScore : 0,
      mentionedCount: typeof p.mentionedCount === 'number' ? p.mentionedCount : 0,
      totalPlatforms: typeof p.platformsTotal === 'number' ? p.platformsTotal : PLATFORMS_SCANNED,
      respondedCount: typeof p.platformsCompleted === 'number' ? p.platformsCompleted : 0,
      partial: !!p.partial,
      missingPlatforms: Array.isArray(p.failedPlatforms) ? p.failedPlatforms : [],
      platforms: [],
      topCompetitors: typeof p.competitor === 'string' && p.competitor ? [{ name: p.competitor, score: null }] : [],
      reportUrl: `/report/${p.scanId}`,
    };
    return { ok: true as const, data: card, scanCard: card };
  } catch (err) {
    return {
      ok: false as const,
      error: 'scan_failed',
      message: `The scan request failed (${err instanceof Error ? err.message : 'unknown error'}). Ask the visitor to try the homepage scan form.`,
    };
  }
}

// The executor's per-tool result before it is wrapped into a tool_result.
type ExecutedToolPartial =
  | { ok: true; data: unknown; scanCard?: ScanCardData }
  | { ok: false; error: string; message?: string; retryAfterHours?: number };

// ── Tool loop (A6) ─────────────────────────────────────────────────────────
// The model NEVER calls a database or an API directly. It emits tool_use
// blocks; the route executes them here, server-side, and feeds typed
// results back. One validated function per tool; max 3 tool calls per
// reply (enforced by the route loop).
//
// IDENTITY: tools NEVER accept a userId from the model or the client.
// The executor takes a server-derived identity (from the session —
// lib/apiAuth.getSessionUser) and passes it to handlers. Tools that need
// ownership (A7/A8/A10) use it; get_pricing / capture_lead ignore it.
// A client-supplied userId in the request body is rejected with 403 by
// the route BEFORE any tool runs; a userId hallucinated into a tool
// input is stripped and ignored.

export type ToolIdentity = { userId: string | null; email: string | null };

/** Request context a tool needs to dispatch faithfully (A7): the real
 *  visitor's headers (session cookie, country) + trusted client IP, so a
 *  scan started from chat is metered and attributed exactly like a scan
 *  started from the homepage form. */
export type ToolRequestContext = { headers: Record<string, string>; clientIp: string };

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export type ToolUse = { id: string; name: string; input: unknown };

export type ExecutedTool = {
  toolUseId: string;
  toolName: string;
  /** JSON string for the tool_result content. */
  content: string;
  isError: boolean;
  /** Set when get_pricing ran — the route turns it into a PricingCard block. */
  pricingData?: PricingResult;
  /** Set when capture_lead ran — the route logs the lead row + outcome. */
  capturedLead?: { lead: LeadInput; captured: boolean };
  /** Set when start_free_scan completed — the route turns it into a ScanCard block. */
  scanCard?: ScanCardData;
  /** Set when get_fix_plan ran — the route turns it into a FixPlanCard block. */
  fixPlan?: FixPlanData;
  /** Set when draft_fix_content ran — the route turns it into a DraftCard block. */
  draft?: DraftData;
  /** Set when get_verification_status ran — the route turns it into a VerificationCard block. */
  verification?: VerificationData;
};

const TOOL_NAMES = ['get_pricing', 'capture_lead', 'start_free_scan', 'get_scan_summary', 'explain_score', 'get_fix_plan', 'draft_fix_content', 'get_verification_status'] as const;

export const ALINA_TOOL_DEFS = [
  {
    name: 'get_pricing',
    description:
      'Get Rankall pricing. Use for any price, plan, or "which plan fits me" question. Prices come from the founder-set list — never invent a tier, discount, or bundle.',
    input_schema: {
      type: 'object',
      properties: {
        need: {
          type: 'string',
          enum: ['local', 'personal', 'product', 'agency', 'enterprise', 'government', 'seo', 'global'],
          description: 'Which tier the visitor needs. Omit to return all tiers.',
        },
      },
      required: [],
    },
  },
  {
    name: 'capture_lead',
    description:
      'Capture a lead for a demo request, enterprise/government question, billing/refund problem, bug report, or frustrated visitor. Only call when the visitor has given a name, an email, and a one-line summary. Never promise a response time.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Visitor's full name." },
        email: { type: 'string', description: "Visitor's email address." },
        business: { type: 'string', description: 'Business name, if given.' },
        summary: { type: 'string', description: 'One-line summary of what they need.' },
        reason: { type: 'string', enum: ['demo', 'enterprise', 'billing', 'bug', 'other'] },
      },
      required: ['name', 'email', 'summary', 'reason'],
    },
  },
  {
    name: 'start_free_scan',
    description:
      'Start a free AI-visibility scan for a business. Use when the visitor names a business (with a city) or asks for a scan. The scan checks 12 AI platforms and takes up to about a minute. Counts against the free scan limit (3/day per visitor) — if it returns rate_limited, say so honestly and do NOT claim a scan started. If it returns business_not_found, ask for the exact business name + city; the visitor’s original message is preserved in the conversation, so ask only for the correction, never for everything again. Never invent a score.',
    input_schema: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Exact business name, if the visitor gave one.' },
        category: { type: 'string', description: 'Business category (e.g. "dentist") for a category scan, or to disambiguate the business.' },
        city: { type: 'string', description: 'City (with state/country when the visitor gave one). REQUIRED.' },
        websiteUrl: { type: 'string', description: 'Business website URL, if the visitor gave one.' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_scan_summary',
    description:
      'Get the summary of a completed scan by its scan ID: score, how many of the 12 platforms mentioned the business, which platforms did not respond, and the top measured competitor. Use when the visitor asks about a scan result, or after start_free_scan returns a scan ID.',
    input_schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: 'The scan ID from start_free_scan or a report URL.' },
      },
      required: ['scanId'],
    },
  },
  {
    name: 'explain_score',
    description:
      'Explain a scan’s score from its own stored platform data: per-platform weight × mention rate, the responding-weight denominator, and the recomputed score. Use when the visitor asks why a score is what it is, or how it is calculated. Never explain from a guessed formula — only from the tool result.',
    input_schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: 'The scan ID to explain.' },
      },
      required: ['scanId'],
    },
  },
  {
    name: 'get_fix_plan',
    description:
      'Get the top fix plan for a scan: the highest-impact pending fixes with their canonical impact, effort, and do-it-yourself / send-to-web-person grouping. READ-ONLY — this tool never applies a fix, and Alina must never claim a fix was applied. Use when the visitor asks what to fix first or how to improve their score. Never invent fixes, impacts, or effort.',
    input_schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: 'The scan ID to get the fix plan for.' },
        limit: { type: 'number', description: 'How many top fixes to return (default 3, max 3).' },
      },
      required: ['scanId'],
    },
  },
  {
    name: 'draft_fix_content',
    description:
      'Draft the content for ONE fix from the scan’s fix plan (the fix’s own generated content, or generated on demand when the fix has none). Only draft fixes from the fix plan — call get_fix_plan first if you do not know the fix types; never invent a fix type. The draft is shown on-screen for everyone; it is SAVED only for a signed-in visitor. Never claim a fix was applied — drafting is not applying.',
    input_schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: 'The scan ID the fix belongs to.' },
        fixType: { type: 'string', description: 'The fix_type from the fix plan (e.g. faq_schema, bing_places).' },
      },
      required: ['scanId', 'fixType'],
    },
  },
  {
    name: 'get_verification_status',
    description:
      'Get the verification status for a scan’s applied fixes: none (no fix marked applied), pending (verification rescan due about 7 days after the fix was marked applied), or done (verification rescan ran, with before/after scores). Signed-in owner only — the scan’s ownership check applies. Never say a fix is verified unless the tool returns state done; never use weekly/automatic-rescan language.',
    input_schema: {
      type: 'object',
      properties: {
        scanId: { type: 'string', description: 'The scan ID to check verification for.' },
      },
      required: ['scanId'],
    },
  },
];

/** Keep ONLY the declared fields — strips a hallucinated userId and any other extra. */
function cleanInput(name: string, input: unknown): Record<string, unknown> {
  const o = (input ?? {}) as Record<string, unknown>;
  if (name === 'get_pricing') return { need: o.need };
  if (name === 'capture_lead') {
    return { name: o.name, email: o.email, business: o.business, summary: o.summary, reason: o.reason };
  }
  if (name === 'start_free_scan') {
    return { businessName: o.businessName, category: o.category, city: o.city, websiteUrl: o.websiteUrl };
  }
  if (name === 'get_scan_summary' || name === 'explain_score') return { scanId: o.scanId };
  if (name === 'get_fix_plan') return { scanId: o.scanId, limit: o.limit };
  if (name === 'draft_fix_content') return { scanId: o.scanId, fixType: o.fixType };
  if (name === 'get_verification_status') return { scanId: o.scanId };
  return {};
}

export async function executeAlinaTool(
  use: ToolUse,
  identity: ToolIdentity,
  ctx?: ToolRequestContext,
): Promise<ExecutedTool> {
  const { id, name } = use;
  const fail = (payload: { error: string; message?: string; retryAfterHours?: number }): ExecutedTool => ({
    toolUseId: id,
    toolName: name,
    content: JSON.stringify({ ok: false, ...payload }),
    isError: true,
  });
  if (!(TOOL_NAMES as readonly string[]).includes(name)) {
    return fail({ error: `Unknown tool: ${name}` });
  }
  if (name === 'get_pricing') {
    const { need } = cleanInput(name, use.input);
    if (need !== undefined && need !== null && typeof need !== 'string') {
      return fail({ error: 'get_pricing need must be a tier name string.' });
    }
    const needValue = (need as PricingNeed | null | undefined) ?? null;
    if (needValue !== null && !(Object.values(NEED_BY_TIER_NAME) as string[]).includes(needValue)) {
      return fail({ error: `get_pricing: unknown tier need "${needValue}".` });
    }
    const pricingData = getPricing(needValue);
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({ ok: true, data: pricingData }),
      isError: false,
      pricingData,
    };
  }
  if (name === 'capture_lead') {
    // identity is deliberately NOT read from the input.
    const validated = validateLead(cleanInput(name, use.input));
    if (!validated.ok) return fail({ error: `capture_lead: ${validated.error}` });
    const result = await captureLead(validated.lead);
    if (!result.captured) {
      return {
        toolUseId: id,
        toolName: name,
        content: JSON.stringify({ ok: false, error: 'Could not send the lead. Ask the visitor to email hello@rankall.io directly.' }),
        isError: true,
        capturedLead: { lead: validated.lead, captured: false },
      };
    }
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({ ok: true, data: { captured: true } }),
      isError: false,
      capturedLead: { lead: validated.lead, captured: true },
    };
  }
  if (name === 'start_free_scan') {
    const cleaned = cleanInput(name, use.input) as {
      businessName?: unknown; category?: unknown; city?: unknown; websiteUrl?: unknown;
    };
    const result = await runScan(
      {
        businessName: typeof cleaned.businessName === 'string' ? cleaned.businessName : undefined,
        category: typeof cleaned.category === 'string' ? cleaned.category : undefined,
        city: typeof cleaned.city === 'string' ? cleaned.city : '',
        websiteUrl: typeof cleaned.websiteUrl === 'string' ? cleaned.websiteUrl : undefined,
      },
      ctx,
    );
    if (!result.ok) {
      return fail({ error: result.error, message: result.message, retryAfterHours: result.retryAfterHours });
    }
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({ ok: true, data: result.data }),
      isError: false,
      scanCard: result.scanCard,
    };
  }
  if (name === 'get_fix_plan') {
    const { scanId, limit } = cleanInput(name, use.input);
    if (typeof scanId !== 'string' || !scanId) {
      return fail({ error: 'get_fix_plan needs a scanId.' });
    }
    // Ownership first (same rule as the scan tools) — then the single
    // reader. Read-only: nothing here writes, applies, or mutates.
    const owned = await readScan(scanId, identity);
    if ('error' in owned) return fail({ error: owned.error });
    // Cap at 3: parity with the free report teaser (top 3 fix cards)
    // and the A8 acceptance. The reader already returns impact-ranked.
    const requested = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 3;
    const take = Math.max(1, Math.min(3, requested));
    const all = await getFixesForScan(scanId);
    const pending = all.filter((f) => f.status === 'pending_review');
    const items: FixPlanItem[] = pending.slice(0, take).map((f) => {
      const difficulty = getFixMetadata(f.fix_type).difficulty ?? f.difficulty ?? null;
      return {
        title: f.fix_title || f.fix_type,
        fixType: f.fix_type,
        impact: typeof f.predicted_impact === 'number' ? f.predicted_impact : null,
        effort: difficulty ?? 'Unknown',
        group: getFixMetadata(f.fix_type).difficulty === 'Easy' ? 'diy' : 'web',
      };
    });
    const plan: FixPlanData = {
      scanId,
      fixes: items,
      totalPending: pending.length,
      reportUrl: `/report/${scanId}`,
    };
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({ ok: true, data: plan }),
      isError: false,
      fixPlan: plan,
    };
  }
  if (name === 'draft_fix_content') {
    const { scanId, fixType } = cleanInput(name, use.input);
    if (typeof scanId !== 'string' || !scanId) {
      return fail({ error: 'draft_fix_content needs a scanId.' });
    }
    if (typeof fixType !== 'string' || !fixType.trim()) {
      return fail({ error: 'draft_fix_content needs a fixType from the fix plan. Call get_fix_plan first if you do not know the fix types.' });
    }
    // Ownership first (same rule as the other scan tools).
    const owned = await readScan(scanId, identity);
    if ('error' in owned) return fail({ error: owned.error });
    const fixes = await getFixesForScan(scanId);
    const fix = fixes.find((f) => f.fix_type === fixType.trim());
    if (!fix) {
      return fail({ error: `No fix of type "${fixType}" for this scan. Call get_fix_plan first and draft only a fix from that plan.` });
    }
    const signedIn = !!identity.userId;
    // The fix's own stored content when it has any — that IS the draft.
    let content = (fix.generated_content ?? '').trim();
    let generated = false;
    if (!content) {
      try {
        content = (await generateFixContent({
          fixType: fix.fix_type,
          businessName: owned.scan.user_business_name || owned.scan.input,
          industry: owned.scan.industry ?? undefined,
          location: owned.scan.business_city || owned.scan.location || undefined,
          countryCode: owned.scan.country_code || 'US',
        })).trim();
        generated = true;
      } catch {
        return fail({ error: 'The draft could not be generated right now. Ask the visitor to try the fix on the report page.' });
      }
      if (!content) {
        return fail({ error: 'The draft could not be generated right now. Ask the visitor to try the fix on the report page.' });
      }
    }
    // Saved only for a signed-in visitor: persist generated content to
    // the fix's own row. Anonymous visitors get the on-screen draft +
    // a signup CTA, never a persisted draft.
    let saved = false;
    if (signedIn && generated) {
      try {
        const admin = getSupabaseAdmin();
        const { error: updateError } = await admin
          .from('generated_fixes')
          .update({ generated_content: content })
          .eq('id', fix.id);
        saved = !updateError;
      } catch {
        saved = false;
      }
    } else if (signedIn) {
      saved = true; // content already lives in the fix row
    }
    const draft: DraftData = {
      scanId,
      fixType: fix.fix_type,
      title: fix.fix_title || fix.fix_type,
      content,
      saved,
      signupUrl: signedIn ? null : '/signup',
    };
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({ ok: true, data: draft }),
      isError: false,
      draft,
    };
  }
  if (name === 'get_verification_status') {
    const { scanId } = cleanInput(name, use.input);
    if (typeof scanId !== 'string' || !scanId) {
      return fail({ error: 'get_verification_status needs a scanId.' });
    }
    // Ownership first — effectively signed-in owner only: owned scans
    // pass only for the owner/admin, and ownerless scans have no applied
    // fixes, so they read 'none'.
    const owned = await readScan(scanId, identity);
    if ('error' in owned) return fail({ error: owned.error });
    const admin = getSupabaseAdmin();
    let outcomes: Array<{
      fix_type: string; score_before: number | null; score_after: number | null;
      is_verified: boolean | null; verified_at: string | null; created_at: string | null;
    }> = [];
    try {
      const { data, error } = await admin
        .from('verified_outcomes')
        .select('fix_type,score_before,score_after,is_verified,verified_at,created_at')
        .eq('scan_id_before', scanId)
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) outcomes = data as unknown as typeof outcomes;
    } catch {
      outcomes = [];
    }
    if (!outcomes.length) {
      const verification: VerificationData = {
        scanId, state: 'none', dueInDays: null, beforeScore: null, afterScore: null,
        reportUrl: `/report/${scanId}`,
      };
      return {
        toolUseId: id, toolName: name,
        content: JSON.stringify({ ok: true, data: verification }),
        isError: false, verification,
      };
    }
    const done = outcomes.filter((o) => o.is_verified).sort((a, b) =>
      new Date(b.verified_at ?? 0).getTime() - new Date(a.verified_at ?? 0).getTime())[0];
    if (done) {
      const verification: VerificationData = {
        scanId, state: 'done', dueInDays: null,
        beforeScore: typeof done.score_before === 'number' ? done.score_before : null,
        afterScore: typeof done.score_after === 'number' ? done.score_after : null,
        reportUrl: `/report/${scanId}`,
      };
      return {
        toolUseId: id, toolName: name,
        content: JSON.stringify({ ok: true, data: verification }),
        isError: false, verification,
      };
    }
    // Pending: due from the open scheduled_rescans row (the delay the
    // user picked, default 7 days). If the schedule table is missing
    // (migration unrun) fall back to outcome created_at + 7 days — the
    // product's own rule (selectDueFixes rule 3). Never claim a date
    // the data does not support.
    const DAY_MS = 24 * 60 * 60 * 1000;
    let dueInDays: number | null = null;
    try {
      const { data: schedules, error: schedError } = await admin
        .from('scheduled_rescans')
        .select('scheduled_for,completed_at,completed')
        .eq('scan_id', scanId);
      if (!schedError && Array.isArray(schedules)) {
        const open = (schedules as Array<{ scheduled_for: string | null; completed_at: string | null; completed: boolean | null }>)
          .filter((s) => !s.completed_at && s.completed !== true && s.scheduled_for)
          .map((s) => new Date(s.scheduled_for as string).getTime())
          .filter((t) => Number.isFinite(t));
        if (open.length) {
          dueInDays = Math.max(0, Math.ceil((Math.min(...open) - Date.now()) / DAY_MS));
        }
      }
    } catch {
      dueInDays = null;
    }
    if (dueInDays === null) {
      const oldest = outcomes[outcomes.length - 1];
      const created = oldest?.created_at ? new Date(oldest.created_at).getTime() : NaN;
      if (Number.isFinite(created)) {
        dueInDays = Math.max(0, Math.ceil((created + 7 * DAY_MS - Date.now()) / DAY_MS));
      }
    }
    const verification: VerificationData = {
      scanId, state: 'pending', dueInDays,
      beforeScore: null, afterScore: null,
      reportUrl: `/report/${scanId}`,
    };
    return {
      toolUseId: id, toolName: name,
      content: JSON.stringify({ ok: true, data: verification }),
      isError: false, verification,
    };
  }
  if (name === 'get_scan_summary' || name === 'explain_score') {
    const { scanId } = cleanInput(name, use.input);
    if (typeof scanId !== 'string' || !scanId) {
      return fail({ error: `${name} needs a scanId.` });
    }
    const read = await readScan(scanId, identity);
    if ('error' in read) return fail({ error: read.error });
    const summary = summarizeScan(read.scan, read.platforms);
    if (name === 'get_scan_summary') {
      return {
        toolUseId: id,
        toolName: name,
        content: JSON.stringify({ ok: true, data: summary }),
        isError: false,
        scanCard: summary,
      };
    }
    // explain_score — re-derive the score from the stored platform rows
    // (same formula as lib/scoring.ts) and report BOTH the stored and the
    // recomputed number, so a mismatch surfaces instead of being hidden.
    const responded = read.platforms.filter((p) => p.status !== 'not_responded');
    const respondingWeight = responded.reduce((sum, p) => sum + p.weight, 0);
    const weightedSum = responded.reduce((sum, p) => sum + p.weight * p.mentionRate, 0);
    const recomputedScore = respondingWeight > 0 ? Math.round((weightedSum / respondingWeight) * 100) : 0;
    return {
      toolUseId: id,
      toolName: name,
      content: JSON.stringify({
        ok: true,
        data: {
          ...summary,
          storedScore: summary.score,
          recomputedScore,
          respondingWeight,
          weightedSum,
          match: recomputedScore === summary.score,
          platforms: read.platforms.map((p) => ({
            ...p,
            contribution: Math.round(p.weight * p.mentionRate * 100) / 100,
          })),
          formula: 'score = round(sum(weight × mentionRate over responding platforms) / sum(responding weights) × 100). Non-responding platforms are excluded from both numerator and denominator.',
        },
      }),
      isError: false,
      scanCard: summary,
    };
  }
  return fail({ error: `Unknown tool: ${name}` });
}

// ── capture_lead (spec Appendix B) ─────────────────────────────────────────
// in: { name, email, business?, summary, reason } — out: { captured }.
// captured === false → the widget shows the hello@rankall.io fallback.
// NEVER promise a response time: no staffed response time exists to quote,
// so neither the tool, the route, nor the widget ever states one.

export type LeadReason = 'demo' | 'enterprise' | 'billing' | 'bug' | 'other';

export type LeadInput = {
  name: string;
  email: string;
  business?: string;
  summary: string;
  reason: LeadReason;
};

export type LeadResult = { captured: boolean };

/** The block the chat route returns and the widget renders (LeadForm). */
export type LeadBlock = { kind: 'lead'; reason: LeadReason; summary: string };

const LEAD_REASONS: LeadReason[] = ['demo', 'enterprise', 'billing', 'bug', 'other'];

const LEAD_REASON_LABELS: Record<LeadReason, string> = {
  demo: 'Demo request',
  enterprise: 'Enterprise / Government',
  billing: 'Billing / Refund',
  bug: 'Bug report',
  other: 'Escalation',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateLead(input: unknown): { ok: true; lead: LeadInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Lead details are required.' };
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const email = typeof o.email === 'string' ? o.email.trim() : '';
  const business = typeof o.business === 'string' ? o.business.trim() : '';
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const reason = o.reason;
  if (!name || name.length > 200) return { ok: false, error: 'Name is required (max 200 characters).' };
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) return { ok: false, error: 'A valid email address is required.' };
  if (!summary || summary.length > 5000) return { ok: false, error: 'A short summary is required (max 5000 characters).' };
  if (business.length > 300) return { ok: false, error: 'Business must be at most 300 characters.' };
  if (typeof reason !== 'string' || !(LEAD_REASONS as string[]).includes(reason)) {
    return { ok: false, error: 'A valid reason is required.' };
  }
  return { ok: true, lead: { name, email, business: business || undefined, summary, reason: reason as LeadReason } };
}

export async function captureLead(input: LeadInput): Promise<LeadResult> {
  const { name, email, business, summary, reason } = input;
  const label = LEAD_REASON_LABELS[reason];
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#1B17FF;padding:28px 32px">
      <span style="color:#fff;font-weight:800;font-size:16px">rankall.io</span>
      <h1 style="color:#fff;font-size:20px;font-weight:800;margin:12px 0 0">Alina lead: ${escapeHtml(label)}</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Reason:</strong> ${escapeHtml(label)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 4px"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 16px"><strong>Business:</strong> ${escapeHtml(business || '—')}</p>
      <p style="font-size:14px;color:#0F172A;margin:0 0 8px"><strong>Summary:</strong></p>
      <p style="font-size:14px;color:#334155;margin:0;white-space:pre-wrap;line-height:1.6">${escapeHtml(summary)}</p>
      <p style="font-size:12px;color:#64748B;margin:16px 0 0">Source: Alina chat widget.</p>
    </div>
  </div>
</body>
</html>`;
  try {
    const sent = await sendEmail({
      to: 'hello@rankall.io',
      subject: `Alina lead: ${label} — ${name}`,
      html,
      from: 'Rankall.io <hello@rankall.io>',
      replyTo: email,
    });
    return { captured: sent };
  } catch (err) {
    // sendEmail promises never to throw, but a lead must never become a
    // fake confirmation because of an unexpected throw.
    console.error('[alinaTools] captureLead failed', err instanceof Error ? err.message : err);
    return { captured: false };
  }
}

// ── Deterministic escalation detection (interim, until A6) ──────────────────
// A6's tool loop replaces this with real model tool calls. Until then,
// these pure functions decide when the route attaches a LeadForm block.
// The route checks pricing FIRST (A3): "Enterprise pricing" gets a
// pricing card, not a lead form.

const ESCALATION_PATTERNS: Array<[LeadReason, RegExp]> = [
  ['demo', /\b(demo|book a demo|see a demo|walkthrough|book a call|talk to (sales|someone|a human))\b/i],
  ['enterprise', /\b(enterprise|government|public[- ]sector)\b/i],
  ['billing', /\b(billing|refund|charge[ds]?|charged|invoice|payment|money[- ]back|cancel.*subscription|subscription.*cancel)\b/i],
  ['bug', /\b(bug|broken|not working|doesn'?t work|isn'?t working|error|crash(ed)?|glitch)\b/i],
  ['other', /\b(frustrated|angry|terrible|awful|useless|disappointed|waste of|scam)\b/i],
];

export function detectEscalation(text: string): LeadReason | null {
  for (const [reason, re] of ESCALATION_PATTERNS) {
    if (re.test(text)) return reason;
  }
  return null;
}

/** LeadForm block for a visitor message, or null when it isn't an escalation. */
export function getLeadBlock(messageText: string): LeadBlock | null {
  const reason = detectEscalation(messageText);
  if (!reason) return null;
  return { kind: 'lead', reason, summary: messageText.slice(0, 500) };
}

// ── Signup mapping ──────────────────────────────────────────────────────────
// Mirrors the signup page's ?plan= map exactly. Unknown keys show a visible
// "We don't offer…" notice on signup — so a tier without a key MUST NOT
// get a /signup?plan= link.
const SIGNUP_PLAN_KEYS: Record<string, string> = {
  'Local Pro': 'local_pro',
  'Personal Brand Pro': 'personal_pro',
  'Product Pro': 'product_pro',
  'Agency': 'agency',
};

const NEED_BY_TIER_NAME: Record<string, PricingNeed> = {
  'Local Pro': 'local',
  'Personal Brand Pro': 'personal',
  'Product Pro': 'product',
  'Agency': 'agency',
  'Enterprise': 'enterprise',
  'Government': 'government',
  'SEO': 'seo',
  'Global Brand Intelligence': 'global',
};

// ── get_pricing (spec Appendix B) ───────────────────────────────────────────
// in: { need?: PricingNeed } — out: { tiers, trial }.
// No need → all 8 founder tiers. A need narrows to the matching tier.
// Never invents a tier, discount, or bundle: tiers come only from
// FOUNDER_PRICING_USD.
export function getPricing(need?: PricingNeed | null): PricingResult {
  const tiers = FOUNDER_PRICING_USD
    .filter((t) => !need || NEED_BY_TIER_NAME[t.name] === need)
    .map((t) => {
      const key = SIGNUP_PLAN_KEYS[t.name];
      return {
        name: t.name,
        monthly: t.monthly,
        blurb: t.blurb,
        cta: key
          ? { label: 'Start free trial', href: `/signup?plan=${key}` }
          : { label: 'Contact Us', href: '/contact' },
      };
    });
  return {
    tiers,
    trial: { days: TRIAL_DAYS, cardRequired: true, locations: TRIAL_MAX_LOCATIONS },
  };
}

// ── Deterministic intent + need detection (interim, until A6) ──────────────
// A6's tool loop replaces this with real model tool calls. Until then,
// these pure functions decide when the route attaches a PricingCard.

const PRICING_INTENT =
  /\b(price|pricing|cost|how much|per month|trial|which plan|what plan|plan fits|plan for me)\b/i;

const NEED_PATTERNS: Array<[PricingNeed, RegExp]> = [
  ['personal', /\bpersonal(\s+brand)?\b/i],
  ['product', /\bproduct\b/i],
  ['agency', /\bagenc(y|ies)\b/i],
  ['enterprise', /\benterprise\b/i],
  ['government', /\bgovernment|public[- ]sector\b/i],
  ['global', /\bglobal(\s+brand)?\b/i],
  ['seo', /\bseo\b/i],
  // Broadest — checked last so "local bakery" still wins over nothing,
  // but a message naming another tier never falls through to local.
  ['local', /\blocal(\s+business)?\b/i],
];

export function detectPricingIntent(text: string): boolean {
  return PRICING_INTENT.test(text);
}

export function detectPricingNeed(text: string): PricingNeed | null {
  for (const [need, re] of NEED_PATTERNS) {
    if (re.test(text)) return need;
  }
  return null;
}

/** Pricing block for a visitor message, or null when it isn't pricing. */
export function getPricingBlock(messageText: string): PricingBlock | null {
  if (!detectPricingIntent(messageText)) return null;
  return { kind: 'pricing', ...getPricing(detectPricingNeed(messageText)) };
}
