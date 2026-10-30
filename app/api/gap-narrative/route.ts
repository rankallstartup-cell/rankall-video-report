import { NextRequest, NextResponse } from "next/server";
import { resolveCountryFromRequest, getCountryConfig } from "@/lib/countryConfig";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canonicalFixImpact } from "@/lib/fixIntelligence";
import { canAccessScan, getSessionUser } from "@/lib/apiAuth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platformCount, country } = body;
    const scanId: string | null = typeof body.scanId === 'string' && body.scanId ? body.scanId : null;

    // Security: this was an open LLM proxy (any text in → Haiku out) that
    // also read generated_fixes for any scanId. Now the narrative is built
    // from the SCAN ROW, never from body text, and the scan must be one the
    // caller may see: their own (or admin), or an ownerless anonymous scan
    // (public by link — the report page renders those for anyone). Another
    // user's scan is refused. Per-IP/user daily cap on top.
    if (!scanId) {
      return NextResponse.json({ error: "scanId required" }, { status: 400 });
    }
    const admin = getSupabaseAdmin();
    const { data: scanRow } = await admin
      .from('rankall_scans')
      .select('id, user_id, input, competitor_name, overall_score, mentioned_count, citation_sources, trust_signals')
      .eq('id', scanId)
      .maybeSingle();
    if (!scanRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sessionUser = await getSessionUser(req);
    if (scanRow.user_id && !canAccessScan(scanRow, sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`gap-narrative:${sessionUser?.id ?? ip}`, sessionUser?.id ?? null, { limit: sessionUser ? 100 : 20 });
    if (!rl.allowed) return NextResponse.json({ error: "Rate limit reached" }, { status: 429 });

    const businessInput = scanRow.input as string | null;
    const competitor = scanRow.competitor_name as string | null;
    const currentScore = scanRow.overall_score as number | null;
    const mentionedCount = scanRow.mentioned_count as number | null;
    const citationSources = Array.isArray(scanRow.citation_sources) ? (scanRow.citation_sources as string[]) : null;
    const trustSignals = scanRow.trust_signals as { technical?: Array<{ status?: string; name?: string }>; directory?: Array<{ status?: string; name?: string }> } | null;

    // Prefer an explicit country from the report page, then cookie override, then IP geo.
    const bodyCountry = typeof country === 'string' ? country.toUpperCase() : '';
    const countryCode = (getCountryConfig(bodyCountry).code === bodyCountry && bodyCountry)
      ? bodyCountry
      : resolveCountryFromRequest(req.headers);
    const countryConfig = getCountryConfig(countryCode);

    if (!businessInput) {
      return NextResponse.json({ error: "Missing businessInput" }, { status: 400 });
    }

    const missingSources: string[] = [];
    if (trustSignals?.technical) {
      const missingTech = trustSignals.technical
        .filter((s: any) => s.status === "missing" || s.status === "danger")
        .map((s: any) => s.name);
      missingSources.push(...missingTech);
    }
    if (trustSignals?.directory) {
      const missingDir = trustSignals.directory
        .filter((s: any) => s.status === "missing" || s.status === "danger")
        .map((s: any) => s.name);
      missingSources.push(...missingDir);
    }

    const COUNTRY_NAMES: Record<string, string> = {
      US: 'the United States', GB: 'the United Kingdom', CA: 'Canada', AU: 'Australia',
      IE: 'Ireland', NZ: 'New Zealand', SG: 'Singapore', AE: 'the UAE',
      IN: 'India', PH: 'the Philippines', ZA: 'South Africa', NG: 'Nigeria',
      KE: 'Kenya', GH: 'Ghana',
    };
    // ax7z: the improvement estimate must come from the actual fix
    // queue, not the model's imagination (it previously invented
    // "35-40 points" while the queue totalled +54). Sum the top-2 fixes'
    // canonical impacts (metadata midpoints, same as the queue displays).
    // If no fixes exist yet for this scan, no points number is stated.
    let projectedImprovement: number | null = null;
    {
      try {
        const { data: fixRows } = await admin
          .from('generated_fixes')
          .select('fix_type')
          .eq('scan_id', scanId)
          .limit(50);
        const impacts = (fixRows ?? [])
          .map(r => canonicalFixImpact((r as { fix_type: string }).fix_type))
          .filter((n): n is number => n != null)
          .sort((a, b) => b - a);
        if (impacts.length > 0) {
          projectedImprovement = impacts.slice(0, 2).reduce((s, n) => s + n, 0);
        }
      } catch { /* no-number fallback below */ }
    }

    const countryName = COUNTRY_NAMES[countryCode] || countryCode;
    const marketContext = `Market context: This business is located in ${countryName}. The primary trust signals that AI platforms cite in this market are: ${countryConfig.trustSources.join(', ')}. Reference these local trust sources by name — do NOT reference US-only sources (e.g. Healthgrades, Yelp) unless they apply in ${countryName}. Use ${countryName}-appropriate spelling and business terminology.`;

    const prompt = `You are an AI visibility analyst. Write a 150-word gap narrative explaining why a business is losing to its competitor in AI search results.

${marketContext}

Business searched for: "${businessInput}"
Current AI visibility score: ${currentScore}/100
Platforms that mentioned THIS business: ${mentionedCount ?? 0} of ${Math.max(1, Math.min(20, Number(platformCount) || 12))}
Competitor detected: ${competitor || "a competitor"} — this is the business AI named instead of them. IMPORTANT: no competitor scan exists. The competitor's score, platform mentions, and citation sources were NOT measured. Do not state ANY number, count, source list, or presence claim for the competitor.
Citation sources where THIS business was found: ${citationSources?.join(", ") || "none"} — these belong to the business above, NEVER to the competitor.
Missing trust signals (this business): ${missingSources.slice(0, 5).join(", ") || "multiple signals missing"}

Write exactly 3 paragraphs:
1. State the problem clearly - the business's own standing (score + platforms mentioning them) and that AI named the competitor instead. No competitor figures exist, so none may be stated.
2. Explain the PRIMARY reason they are losing - be specific about what is missing
3. What fixing the top 2 issues will do for their score

Rules:
- Be direct and specific - use the actual business input and competitor name
- Never attribute this business's citation sources, counts, or presence to the competitor
- Do not use generic advice
- Do not use bullet points
- Sound like a consultant not a robot
- Maximum 150 words total
- NEVER state a confidence percentage or probability (e.g. "68% confident") — no confidence is measured anywhere in this report; inventing one made the same scan read 40% on one load and 68% on the next (b8b2).
- NEVER state how many platforms mention the competitor — that number is not given above, so do not invent it. Say only that the competitor is being named instead.
${projectedImprovement != null
  ? `- End with exactly this sentence: "Fixing these two issues is estimated to improve your score by approximately ${projectedImprovement} points." Use that exact figure — it comes from the fix queue; do not invent a different number.`
  : `- Do not state a points prediction — the report's fix queue carries the improvement estimate.`}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Anthropic API error:", res.status, errBody);
      return NextResponse.json({ error: "Anthropic API failed" }, { status: 500 });
    }

    const data = await res.json();
    const narrative = data.content?.[0]?.text || "";

    return NextResponse.json({ success: true, narrative });
  } catch (error) {
    console.error("Gap narrative error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}