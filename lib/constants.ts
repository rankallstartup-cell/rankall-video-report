// ── COLORS ────────────────────────────────────────────────────────────────────
export const NAVY   = "#060D1A";
export const CARD   = "#0D1829";
export const BORDER = "#1E2D45";
export const BLUE   = "#2563EB";
export const BLUE_D = "#1D4ED8";
export const GREEN  = "#10B981";
export const AMBER  = "#F59E0B";
export const RED    = "#EF4444";
export const PURPLE = "#7C3AED";
export const WHITE  = "#F1F5F9";
export const GRAY   = "#94A3B8";
export const DIM    = "#64748B";

// ── PLATFORMS ─────────────────────────────────────────────────────────────────
export const PLATFORMS = [
  { name:"ChatGPT",    color:"#10A37F", l:"G", score:71, w:"25%", trend:+8  },
  { name:"Gemini",     color:"#4285F4", l:"G", score:58, w:"18%", trend:+3  },
  { name:"Copilot",    color:"#0078D4", l:"C", score:63, w:"13%", trend:+5  },
  { name:"Perplexity", color:"#20B2AA", l:"P", score:64, w:"11%", trend:+12 },
  { name:"Grok",       color:"#1DA1F2", l:"X", score:52, w:"8%",  trend:-2  },
  { name:"Claude",     color:"#D4774A", l:"A", score:67, w:"7%",  trend:+6  },
  { name:"DeepSeek",   color:"#6366F1", l:"D", score:44, w:"6%",  trend:+5  },
  { name:"Mistral",    color:"#FF7000", l:"M", score:61, w:"5%",  trend:+1  },
  { name:"Kimi",       color:"#A855F7", l:"K", score:38, w:"4%",  trend:0   },
  { name:"Groq",       color:"#059669", l:"L", score:55, w:"3%",  trend:+4  },
];

// ── TRUST SIGNALS ─────────────────────────────────────────────────────────────
export const TRUST_DATA = [
  { name:"Google Business", score:82, icon:"🔍", status:"good",    note:"+3 this week"  },
  { name:"Yelp",            score:61, icon:"⭐", status:"warning", note:"Declining"      },
  { name:"Reddit",          score:44, icon:"🟠", status:"warning", note:"2 mentions"     },
  { name:"Trustpilot",      score:71, icon:"✅", status:"good",    note:"+8 this month" },
  { name:"Facebook",        score:55, icon:"📘", status:"warning", note:"Stale profile" },
  { name:"TikTok",          score:28, icon:"🎵", status:"danger",  note:"Not present"   },
  { name:"Healthgrades",    score:91, icon:"🏥", status:"good",    note:"Top rated"     },
  { name:"Tripadvisor",     score:0,  icon:"✈️", status:"danger",  note:"Missing"       },
];

// ── INDUSTRY SUGGESTIONS ──────────────────────────────────────────────────────
export const INDUSTRY_SUGG = [
  "Dentist","Lawyer","Restaurant","Doctor","Accountant","Plumber",
  "Marketing Agency","Gym","Hair Salon","Real Estate Agent","Architect",
  "Financial Advisor","Photographer","Catering Company","Physiotherapist",
];

// ── TICKER ────────────────────────────────────────────────────────────────────
export const TICKER = [
  '"best dentist in Chicago"',
  '"top agency in Austin"',
  '"emergency plumber near me"',
  '"best personal injury lawyer NYC"',
  '"Trek road bikes"',
  '"Starbucks London"',
  '"best CRM for small business"',
  '"Nike sustainability"',
];

// ── CASE STUDIES ──────────────────────────────────────────────────────────────
// ILLUSTRATIVE composites only — no real customer, quote, timeline or
// measured result. Each fix carries a fix_type; the page shows that type's
// canonical impact (lib/fixIntelligence) and projects "after" with the shared
// projection cap (lib/projection), so these numbers match the product's own
// estimates instead of hand-typed ones.
export const CASES: ReadonlyArray<{
  ind: string; loc: string; icon: string; before: number; color: string;
  headline: string; summary: string;
  fixes: ReadonlyArray<{ fix: string; fixType: string; desc: string }>;
}> = [
  {
    ind:"Dental Practice", loc:"Example · US city", icon:"🦷",
    before:24, color:"#2563EB",
    headline:"A low-visibility dental practice and its first three fixes",
    summary:"A family dental practice that AI platforms rarely named for local dental queries. These are the fixes a practice like this would typically apply first.",
    fixes:[
      { fix:"FAQ Schema",            fixType:"faq_schema",            desc:"FAQ pairs answering the questions patients actually ask, marked up with FAQPage schema." },
      { fix:"LocalBusiness JSON-LD", fixType:"local_business_schema", desc:"Complete structured business data — name, address, hours, services — that AI can verify." },
      { fix:"Authority Citations",   fixType:"citation_finder",       desc:"Listings on the health directories and associations AI platforms draw on." },
    ],
  },
  {
    ind:"Law Firm", loc:"Example · US city", icon:"⚖️",
    before:31, color:"#F59E0B",
    headline:"Strong SEO, weak AI visibility",
    summary:"A firm with solid traditional SEO but no AI-specific optimisation, often outranked by smaller firms in AI answers.",
    fixes:[
      { fix:"Practice Area Pages",     fixType:"content_optimizer", desc:"Practice pages rewritten to answer the questions clients ask AI." },
      { fix:"Google Business Profile", fixType:"gbp_optimizer",     desc:"Complete categories, services and descriptions on the firm's profile." },
      { fix:"Legal Directory Profiles", fixType:"citation_finder",  desc:"Complete profiles on the legal directories AI platforms cite." },
    ],
  },
  {
    ind:"E-Commerce Brand", loc:"Example · US city", icon:"🛍️",
    before:38, color:"#10B981",
    headline:"One brand, several channels, inconsistent signals",
    summary:"A brand selling across its own site and marketplaces whose descriptions and structured data differed by channel.",
    fixes:[
      { fix:"Structured Data",      fixType:"local_business_schema", desc:"Consistent structured data on the brand's own site." },
      { fix:"Unified Descriptions", fixType:"content_optimizer",     desc:"One consistent brand description across every channel." },
      { fix:"Review Responses",     fixType:"review_response",       desc:"A steady habit of responding to reviews on each channel." },
    ],
  },
];

// ── ALINA CHATBOT PROMPT ──────────────────────────────────────────────────────
// Built SERVER-SIDE by app/api/chat/route.ts from lib/publicStats.ts (the
// single source of truth for prices/counts) — no price literal lives here.
// The case studies in CASES above are ILLUSTRATIVE composites, so the bot
// must never present them as real customer results.
//
// A2: this is the Appendix A replacement prompt from the Alina upgrade
// spec — job-first (scan / fix plan / signup-or-lead), tool-use rules,
// length by intent, escalation triggers, honesty clauses. The tools it
// names land in A3–A9 (the tool loop itself in A6): until then the model
// has no actual tools, so the TOOLS section is aspirational — Alina may
// say she will run a scan she cannot yet run. That interim gap closes
// with A6; do not "fix" it by weakening the prompt.
export type AlinaPromptInput = {
  tiers: Array<{ name: string; monthly: number }>;
  platformsScanned: number;
  trustSignalsLabel: string;
  scanTimeLabel: string;
};

export function buildAlinaPrompt(i: AlinaPromptInput): string {
  const pricing = i.tiers.map((t) => `- ${t.name}: $${t.monthly.toLocaleString('en-US')}/mo`).join('\n');
  return `You are Alina, the AI assistant for Rankall.io.

YOUR JOB

Your job is to move every visitor to one of three outcomes: 1) a free scan started, 2) a fix plan shown for a real scan, or 3) a signup or a captured lead. Answer questions briefly and steer back to one of those outcomes. You are friendly and plain-spoken. You never use hype and you never pressure.

WHAT RANKALL IS

Rankall.io tracks how businesses, products and brands appear across ${i.platformsScanned} major AI platforms — ChatGPT, Gemini, Google AI Overview, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi and Groq. Meta AI support is coming soon — never say it is live.

A scan takes ${i.scanTimeLabel} and checks ${i.trustSignalsLabel} trust signals. When a user marks a fix as applied, Rankall runs a verification rescan about 7 days later. Never promise weekly or automatic rescans.

PRICING (USD, founder-set — only ever quote prices returned by the get_pricing tool or listed here; never invent a tier, a discount or a bundle):

${pricing}

Paid plans start with a 7-day free trial. A card is required upfront; nothing is charged until the trial ends. On trial: 1 business location, reduced scan limits, and no report exports or white-label until the plan converts. There is also a Free plan: $0, 3 scans per month, no card required.

TOOLS — USE THEM, DO NOT GUESS

- get_pricing: for any price, plan or "which plan fits me" question.
- start_free_scan: when the visitor names a business and a city, or a category and a city. If the city is missing, ask for it once, then run the scan.
- get_scan_summary and explain_score: for any question about a score. Only ever discuss a score that a tool returned for a real scan. If there is no scan yet, offer to run one.
- get_fix_plan: after a scan, or when asked "what do I fix first". Present the top 3 fixes with their impact and effort, then link the full plan.
- draft_fix_content: only when the visitor asks to see or draft a specific fix. Drafts are drafts — say so.
- capture_lead: for demo requests, enterprise or government questions, billing or refund problems, bug reports, and any visitor who is frustrated. Capture name, email and business, include a one-line summary, and confirm honestly that the team has it. Never promise a response time.
- search_help_docs: for how-it-works questions not covered here. If it returns nothing, say you do not know and offer hello@rankall.io. Do not improvise an answer.

HONESTY RULES (never break these)

- You have NO verified customer results. The case studies on this website are illustrative composites, not real customers — if asked, say exactly that. Never quote a score improvement, a timeline or a percentage as an outcome anyone will get.
- Never invent a score, a competitor, a review count, a platform result or a citation. Missing data is "not checked" or "—", never 0 and never a guess.
- If a scan is partial, name the platforms that did not respond and say the score is based on the ones that did.
- Never ask for a password, a card number or an API key.

STYLE

Simple questions get 2–4 short sentences. Explaining a real scan or a fix plan may use a short heading and up to 5 short list items. End with one clear next step: run a scan, see the fix plan, start a trial, or leave an email. One next step, not three.`;
}