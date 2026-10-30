import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service role client — lazy init
let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}
const adminClient = new Proxy({} as SupabaseClient, { get(_t, p) { return (getAdmin() as any)[p] } })

// Anon client for optional auth — lazy init
let _anon: SupabaseClient | null = null
function getAnon(): SupabaseClient {
  if (!_anon) {
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _anon
}
const anonClient = new Proxy({} as SupabaseClient, { get(_t, p) { return (getAnon() as any)[p] } })

interface SpendInput {
  googleAds: number
  metaAds: number
  seoAgency: number
  reviewManagement: number
  directories: number
  otherMarketing: number
}

interface InlineScanData {
  score: number | null
  industry: string
  city: string
  competitor: string | null
  trustSignals: Record<string, unknown> | null
  scanId?: string | null
}

export async function POST(request: Request) {
  const body = await request.json()

  const spend: SpendInput = {
    googleAds:        Number(body.googleAds)        || 0,
    metaAds:          Number(body.metaAds)          || 0,
    seoAgency:        Number(body.seoAgency)        || 0,
    reviewManagement: Number(body.reviewManagement) || 0,
    directories:      Number(body.directories)      || 0,
    otherMarketing:   Number(body.otherMarketing)   || 0,
  }
  const total = Object.values(spend).reduce((s, v) => s + v, 0)

  // Try optional auth to get user_id for saving
  let userId: string | null = null
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (token) {
    const { data: { user } } = await anonClient.auth.getUser(token)
    if (user) userId = user.id
  }

  // Use inline scan data if provided (anonymous report page flow)
  // Otherwise fetch from Supabase (authenticated dashboard flow)
  // ax6u: null = not scanned / not measured. The old `?? 0` told the
  // model "AI Visibility Score: 0/100" for a business with no scan.
  let score: number | null
  let industry: string
  let city: string
  let competitor: string | null
  let trustSignals: Record<string, unknown> | null
  let dbScanId: string | null = null

  if (body.scanData) {
    const sd = body.scanData as InlineScanData
    score       = typeof sd.score === 'number' && Number.isFinite(sd.score) ? sd.score : null
    industry    = sd.industry    ?? 'local business'
    city        = sd.city        ?? 'your city'
    competitor  = sd.competitor  ?? null
    trustSignals = sd.trustSignals ?? null
    dbScanId    = sd.scanId      ?? null
  } else {
    // Dashboard flow: fetch latest scan for authenticated user
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: scanData } = await adminClient
      .from('rankall_scans')
      .select('id, industry, location, overall_score, competitor_name, trust_signals')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    score       = typeof scanData?.overall_score === 'number' ? scanData.overall_score : null
    industry    = scanData?.industry       ?? 'local business'
    city        = scanData?.location       ?? 'your city'
    competitor  = scanData?.competitor_name ?? null
    trustSignals = scanData?.trust_signals  ?? null
    dbScanId    = scanData?.id             ?? null
  }

  // Collect missing trust signal names
  type TrustSignal = { name: string; status: string }
  type TrustSignalGroup = TrustSignal[]
  const allSignals: TrustSignal[] = [
    ...((trustSignals?.technical ?? []) as TrustSignalGroup),
    ...((trustSignals?.directory ?? []) as TrustSignalGroup),
    ...((trustSignals?.reviews   ?? []) as TrustSignalGroup),
    ...((trustSignals?.community ?? []) as TrustSignalGroup),
  ]
  const missingSignals = allSignals
    .filter(s => s.status === 'missing' || s.status === 'danger')
    .map(s => s.name)
    .slice(0, 6)

  // b01v: NO invented competitor score. The old `score + 18` presented a
  // fabricated number to the model as data. Neither the inline scanData
  // nor the DB query below measures a competitor score (name only) —
  // so the prompt says so explicitly instead of estimating one.

  const prompt = `You are an AI recommendation intelligence analyst for Rankall. A ${industry} business in ${city} has:

AI Visibility Score: ${score != null ? `${score}/100` : 'not scanned yet — do not state or estimate a score'}
${competitor ? `Competitor: ${competitor}\nCompetitor score: not measured — do not estimate, infer, or compare against a competitor score.` : 'No top competitor detected yet.'}
Missing trust signals: ${missingSignals.length > 0 ? missingSignals.join(', ') : 'none detected'}

Monthly marketing spend:
- Google Ads: $${spend.googleAds}
- Meta / Facebook Ads: $${spend.metaAds}
- SEO Agency: $${spend.seoAgency}
- Review Management: $${spend.reviewManagement}
- Directory Listings: $${spend.directories}
- Other Marketing: $${spend.otherMarketing}
- Total: $${total}

IMPORTANT RULES FOR YOUR ANALYSIS:
1. Never recommend hiring an SEO agency or any external consultant.
2. Always frame fixes as things the business owner can do themselves using Rankall.
3. Always connect fixes back to AI visibility improvement — not generic SEO.
4. Reference Rankall's fix queue as the tool to implement every change.
5. The goal is to show that AI visibility fixes are more impactful than traditional ad spend.
6. Never suggest the business owner needs to pay anyone else — Rankall already includes everything they need.

FRAMING FOR EACH CATEGORY:
- Google Ads: drives clicks but AI platforms (ChatGPT, Gemini, Perplexity) don't see ad spend — they see trust signals, reviews, schema markup, and citations. This spend is invisible to AI recommendation engines.
- Meta / Facebook Ads: builds brand awareness but AI recommendation engines weight structured data and review velocity much higher. Zero AI visibility return on this spend.
- SEO Agency: only valuable if they are implementing FAQ schema, LocalBusiness JSON-LD, and AI-specific GEO optimizations — most agencies have no idea what GEO (Generative Engine Optimization) is. The Rankall fix queue already contains the exact schema code to implement this without an agency.
- Review Management: highest AI impact per dollar — AI platforms cite review velocity as a primary trust signal. Every new review directly increases the probability of being recommended by ChatGPT or Gemini.
- Directory Listings: AI platforms scrape structured directory data. Consistent NAP (name, address, phone) across directories is a foundational AI trust signal. Rankall's fix queue shows exactly which directories matter.
- Other Marketing: evaluate whether this spend creates structured, crawlable data that AI platforms can read. If not, it has near-zero AI visibility impact.

FOR REALLOCATION always recommend moving budget toward:
1. Review generation (highest AI impact per dollar)
2. Schema markup implementation (use Rankall fix queue — already included in your plan at no extra cost)
3. Directory citations (use Rankall fix instructions — included in plan)

END the reasoning fields with: "Your Rankall fix queue already contains the exact code and content to implement these changes — no agency needed."

Respond ONLY with valid JSON in this exact structure. The numbers in the structure below are FORMAT placeholders only — derive every number from the business's actual data above; never return a placeholder value.
{
  "categories": [
    {
      "name": "Google Ads",
      "amount": ${spend.googleAds},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence about AI visibility impact — reference that AI platforms don't see ad spend, they see trust signals"
    },
    {
      "name": "Meta / Facebook Ads",
      "amount": ${spend.metaAds},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence about AI visibility impact — reference that AI engines weight structured data over brand awareness"
    },
    {
      "name": "SEO Agency",
      "amount": ${spend.seoAgency},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence — question whether the agency does GEO/schema work; note Rankall fix queue already has this covered"
    },
    {
      "name": "Review Management",
      "amount": ${spend.reviewManagement},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence — review velocity is a primary AI trust signal; highest ROI for AI visibility"
    },
    {
      "name": "Directory Listings",
      "amount": ${spend.directories},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence — consistent NAP data feeds AI platforms; Rankall fix queue shows exactly which directories to target"
    },
    {
      "name": "Other Marketing",
      "amount": ${spend.otherMarketing},
      "aiImpact": "None|Low|Medium|High|Very High",
      "explanation": "One sentence — assess whether this creates structured crawlable data AI platforms can read"
    }
  ],
  "reallocation": {
    "moveAmount": 150,
    "fromCategory": "category name",
    "toCategory": "category name",
    "expectedImprovementPoints": 8,
    "gapClosedPercent": 40,
    "reasoning": "Two sentences: why this move improves AI visibility for this ${industry} in ${city}${competitor ? ` against ${competitor}` : ''}. End with: Your Rankall fix queue already contains the exact code and content to implement these changes — no agency needed."
  },
  "bestHundred": {
    "category": "category name",
    "action": "Specific DIY action using Rankall fix queue — no agency, no consultant",
    "expectedImpact": "Specific outcome referencing real trust signal names, point improvement, and that Rankall already includes the instructions"
  }
}

Be specific. Reference ${industry}, ${city}${competitor ? `, and competitor ${competitor}` : ''}. Reference the actual missing signals (${missingSignals.join(', ') || 'none'}). Make the business owner feel the urgency of AI visibility right now. Only output JSON.`

  // Call Claude Opus 4.8
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return Response.json({ error: `AI API error: ${err}` }, { status: 500 })
  }

  const aiData = await aiRes.json()
  const rawText: string = aiData.content?.[0]?.text ?? ''

  let analysis: object
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: rawText }
  } catch {
    analysis = { raw: rawText }
  }

  // Save to spend_intelligence (non-fatal)
  await adminClient.from('spend_intelligence').insert({
    user_id:           userId,
    scan_id:           dbScanId,
    google_ads:        spend.googleAds,
    meta_ads:          spend.metaAds,
    seo_agency:        spend.seoAgency,
    review_management: spend.reviewManagement,
    directories:       spend.directories,
    other_marketing:   spend.otherMarketing,
    total_spend:       total,
    analysis_result:   analysis,
  }).then(({ error }) => {
    if (error) console.log('spend_intelligence insert (non-fatal):', error.message)
  })

  return Response.json({
    success: true,
    analysis,
    context: { score, industry, city, competitor, total },
  })
}
