import { NextRequest, NextResponse } from "next/server";
import { detectBusinessMention } from "@/lib/analyser-ml";

interface PlatformResult {
  platform: string;
  response: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { query, results } = await req.json();

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ error: "results required" }, { status: 400 });
    }

    const transcript = (results as PlatformResult[])
      .filter(r => r.response)
      .map(r => `[${r.platform}]: ${r.response!.slice(0, 1200)}`)
      .join("\n\n");

      if (!transcript) {
        return NextResponse.json({ success: true, businesses: [] });
      }

    const prompt = `You are analyzing what AI platforms recommended for the search: "${query}".

Below are responses from multiple AI platforms. Extract every distinct business, company, or person that was named as a recommendation.

For each one return:
- name: the business name exactly as written
- platforms: array of platform names (from the [Platform] tags) that mentioned it
- location: city/area if stated, else null
- note: a 4-8 word descriptor if available (e.g. "accepting new patients", "4.9 stars"), else null

Rank by how many platforms mentioned each business (most-mentioned first). Return at most the top 8 businesses.

Respond ONLY with valid JSON, no markdown, no backticks, in this exact shape:
{"businesses":[{"name":"...","platforms":["ChatGPT","Gemini"],"location":"...","note":"..."}]}

Responses:
${transcript}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    let text = data.content?.[0]?.text || "{}";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed: { businesses?: any[] };
    try {
      parsed = JSON.parse(text);
    } catch {
        return NextResponse.json({ success: true, businesses: [] });
      }
    const businesses = (parsed.businesses || []).map((b: any) => {
        const uniquePlatforms = Array.isArray(b.platforms) ? [...new Set(b.platforms)] : [];
        const name = String(b.name || "").trim();
        // Deterministic mention count: scan the ACTUAL platform responses with
        // the same matcher the headline score uses (lib/analyser-ml), instead of
        // trusting the LLM's self-reported `platforms` array. Falls back to the
        // LLM count only if no results were passed to score against.
        const mentions = (results as PlatformResult[])?.length
          ? (results as PlatformResult[]).filter(r =>
              r.response ? detectBusinessMention(r.response, name) : false).length
          : uniquePlatforms.length;
        return {
          name,
          platforms: uniquePlatforms,
          mentions,
          location: b.location || null,
          note: b.note || null,
        };
      }).filter((b: any) => b.name.length > 0)
        .sort((a: any, b: any) => b.mentions - a.mentions);

    console.log('[extract-businesses] ranked:', businesses.map((b: any) => ({ name: b.name, mentions: b.mentions })));

    return NextResponse.json({ success: true, businesses });

  } catch (err) {
    console.error("Extract businesses error:", err);
    return NextResponse.json({ success: false, businesses: [] });
  }
}