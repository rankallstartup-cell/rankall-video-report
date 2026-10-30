import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cronAuth';
import { createServerClient } from '@supabase/ssr';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt: string, model = 'claude-haiku-4-5-20251001', maxTokens = 1500): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// Remove any markdown / structural artifacts so the TTS voice never reads
// symbols, section labels, or timestamps aloud.
function stripMarkdown(text: string): string {
  return (text || '')
    .replace(/#{1,6}\s+/g, '')                       // headings
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')            // bold
    .replace(/\*([\s\S]*?)\*/g, '$1')                // italics
    .replace(/\[\d+:\d+\s*[-–]\s*\d+:\d+\]/g, '')    // [0:00-0:20] timestamps
    .replace(/^\s*[-•]\s+/gm, '')                    // bullet points
    .replace(/\[([^\]]*)\]/g, '$1')                  // any [bracketed] text
    .replace(/\b(HOOK|THE SCAN|THE REVEAL|THE FIX|THE VERIFY|CTA|INTRODUCTION|CONCLUSION|OPENING|CLOSING)\b:?\s*/g, '')
    .replace(/[*#_`>]/g, '')                          // stray markdown chars
    .replace(/\n{3,}/g, '\n\n')                      // collapse blank lines
    .trim();
}

// Vercel Cron (weekly, vercel.json) sends GET — the route was POST-only.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  // Cron: Bearer CRON_SECRET only (no hardcoded fallback secret, no
  // x-cron-secret). Admins may trigger it with their session.
  const bearerMatch = checkCronAuth(req.headers.get('authorization')) === 'ok';

  // Check admin email as alternative auth
  let isAdmin = false;
  if (!bearerMatch) {
    const supabaseCheck = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabaseCheck.auth.getUser();
    isAdmin = isAdminUser(user?.email);
  }

  if (!bearerMatch && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
  );

  // Step 1: Fetch a real recent demo scan from the DB (dentist in Chicago)
  const { data: existingScan } = await supabase
    .from('rankall_scans')
    .select('score, competitor_name, competitor_score, revenue_leak, business_name, city, industry')
    .ilike('city', '%Chicago%')
    .ilike('industry', '%dentist%')
    .not('competitor_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // ax6u residual: NEVER fabricate scores. The old fallback demo
  // object (score 31, competitor 78, revenue $4,200) and the per-field
  // numeric fallbacks invented numbers and presented
  // them as a real scan's measured results — in the narration
  // (a made-up business score spoken in the narration), the animated bars, and the
  // revenue figure. If no real scan with measured numbers exists,
  // fail loudly instead of generating a video full of invented data.
  if (!existingScan || existingScan.score == null || existingScan.competitor_score == null || existingScan.revenue_leak == null) {
    return NextResponse.json({ error: 'No demo scan with measured scores available — run a real Chicago dentist scan first' }, { status: 503 });
  }
  const scanData = existingScan;

  // Fallbacks for every variable so "undefined" is never spoken aloud.
  // Scores / revenue have NO fallback — they are required above.
  const sd = scanData as Record<string, unknown>;
  const score          = sd?.score as number;
  const competitor     = (sd?.competitor_name as string) ?? 'a local competitor';
  const competitorScore= sd?.competitor_score as number;
  const revenueGap     = (sd?.revenue_gap as number) ?? (sd?.revenue_leak as number);
  const symbol         = (sd?.revenue_symbol as string) ?? '$';
  const city           = (sd?.city as string) ?? 'Chicago';
  const industry       = (sd?.industry as string) ?? 'dental practice';
  const fix1Title      = (sd?.fix1_title as string) ?? 'Google Business Profile optimization';

  // legacy aliases still used by the animated HTML further down
  const competitor_name = competitor;
  const competitor_score = competitorScore;
  const revenue_leak = revenueGap;
  // ax80: no derived numbers — the old platformsWon (competitor score as a
  // share of 11) and fixedScore (score + 23, shown as a "Verified" gain)
  // were invented.

  // Step 2: Generate script via Claude — plain, TTS-safe prose (no markdown).
  const rawScript = await callClaude(`You are writing a 3-minute audio narration script for Rankall.io.

This will be read aloud by a text-to-speech voice. It must sound completely natural when spoken.

STRICT RULES - VIOLATIONS WILL BREAK THE AUDIO:
- NO asterisks anywhere
- NO hashtags anywhere
- NO markdown formatting of any kind
- NO section headers like HOOK or CTA
- NO timestamp markers like [0:00-0:20]
- NO bold or italic markers
- NO bullet points or dashes
- NO square brackets anywhere
- NO ALL CAPS words
- ONLY plain conversational sentences

Real scan data to use:
Business score: ${score} out of 100
Competitor: ${competitor}
Competitor score: ${competitorScore} out of 100
Revenue gap: ${symbol}${revenueGap} per month
City: ${city}
Industry: ${industry}
Fix one: ${fix1Title}

Write exactly 3 minutes of natural spoken narration (approximately 450 to 500 words) covering:

Opening 20 seconds: Start with a dramatic question about someone asking ChatGPT right now for the best ${industry} in ${city}.

Next 25 seconds: Describe the Rankall scan running across 12 AI platforms simultaneously. Name the platforms: ChatGPT, Gemini, Perplexity, Grok, Copilot, Claude, DeepSeek, Mistral, Kimi, Groq, Google AI, and Meta AI.

Next 45 seconds: Reveal the scores dramatically. ${score} out of 100. ${competitor} scored ${competitorScore}. Name the revenue gap in dollars. Make it emotional and real.

Next 30 seconds: Reveal the main fix. ${fix1Title} is free. It takes 20 minutes. This is the insight that changes everything.

Next 30 seconds: Describe what happens after the fix. The score improves. More platforms recommend them. The revenue gap closes. Rankall verifies it worked.

Final 30 seconds: Call to action. Scan free at rankall.io. About 90 seconds. See your score. Find out if AI recommends you or your competitor.

Write it as continuous flowing prose. No sections. No labels. Just speech.`, 'claude-haiku-4-5-20251001', 1200);

  const script = stripMarkdown(rawScript);
  console.log('CLEAN SCRIPT PREVIEW:', script.substring(0, 200));

  const timestamp = Date.now();
  let audioUrl: string | null = null;
  const diagnostics: Record<string, unknown> = {};

  const supabaseUrlForStorage = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKeyForStorage = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  diagnostics.serviceRoleKeyPresent = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Ensure the 'demo-videos' storage bucket exists and is public. This is
  // idempotent — a "Bucket already exists" response is fine and ignored.
  async function ensureBucket() {
    try {
      const res = await fetch(`${supabaseUrlForStorage}/storage/v1/bucket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKeyForStorage}`, 'Content-Type': 'application/json', apikey: serviceKeyForStorage },
        body: JSON.stringify({ id: 'demo-videos', name: 'demo-videos', public: true }),
      });
      const body = await res.text().catch(() => '');
      diagnostics.bucketEnsure = { status: res.status, body: body.slice(0, 160) };
      console.log('BUCKET ENSURE:', res.status, body.slice(0, 160));
    } catch (e) {
      diagnostics.bucketEnsureError = String(e);
      console.log('BUCKET ENSURE ERROR:', String(e));
    }
  }
  await ensureBucket();

  // Step 3: Generate ElevenLabs audio (if configured)
  console.log('ELEVENLABS KEY EXISTS:', !!process.env.ELEVENLABS_API_KEY);
  console.log('VOICE ID EXISTS:', !!process.env.ELEVENLABS_VOICE_ID);
  diagnostics.elevenLabsKeyPresent = !!process.env.ELEVENLABS_API_KEY;
  diagnostics.voiceIdPresent = !!process.env.ELEVENLABS_VOICE_ID;
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
    const audioRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
        }),
      }
    );

    diagnostics.elevenLabsStatus = audioRes.status;
    console.log('ELEVENLABS STATUS:', audioRes.status);
    if (!audioRes.ok) {
      const errBody = await audioRes.text().catch(() => '');
      diagnostics.elevenLabsError = errBody.slice(0, 200);
      console.log('ELEVENLABS ERROR:', audioRes.status, errBody.slice(0, 200));
    }
    if (audioRes.ok) {
      const audioBuffer = await audioRes.arrayBuffer();
      diagnostics.audioBytes = audioBuffer.byteLength;
      // upsert=true so a re-run overwrites cleanly instead of 409-ing.
      const uploadRes = await fetch(
        `${supabaseUrlForStorage}/storage/v1/object/demo-videos/demo-narration-${timestamp}.mp3`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKeyForStorage}`,
            apikey: serviceKeyForStorage,
            'Content-Type': 'audio/mpeg',
            'x-upsert': 'true',
          },
          body: audioBuffer,
        }
      );
      const uploadBody = await uploadRes.text().catch(() => '');
      diagnostics.uploadStatus = uploadRes.status;
      console.log('AUDIO UPLOAD STATUS:', uploadRes.status, uploadBody.slice(0, 200));
      if (uploadRes.ok) {
        audioUrl = `${supabaseUrlForStorage}/storage/v1/object/public/demo-videos/demo-narration-${timestamp}.mp3`;
      } else {
        diagnostics.uploadError = uploadBody.slice(0, 200);
      }
    }
  }

  // Step 5: Generate animated HTML demo page
  const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rankall.io — Live Demo</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0f0f23; color: #fff; font-family: -apple-system, sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
.screen { background: #1a1a2e; border-radius: 16px; padding: 32px; max-width: 640px; width: 100%; box-shadow: 0 0 80px rgba(124,58,237,0.3); }
.logo { color: #a78bfa; font-size: 14px; font-weight: 700; letter-spacing: 2px; margin-bottom: 24px; }
.search-bar { background: #0f0f1a; border: 2px solid #1B17FF; border-radius: 12px; padding: 14px 18px; font-size: 16px; color: #fff; margin-bottom: 24px; min-height: 52px; display: flex; align-items: center; }
.cursor { display: inline-block; width: 2px; height: 18px; background: #1B17FF; margin-left: 2px; animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.scanning-label { color: #9ca3af; font-size: 13px; margin-bottom: 12px; }
.platform-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 24px; }
.platform { background: #0f0f1a; border: 1px solid #374151; border-radius: 8px; padding: 8px; text-align: center; font-size: 12px; color: #6b7280; transition: all 0.5s; }
.platform.lit { border-color: #1B17FF; color: #a78bfa; background: #1e1b4b; }
.score-section { display: flex; gap: 16px; margin-bottom: 24px; opacity: 0; transition: opacity 0.8s; }
.score-section.visible { opacity: 1; }
.score-box { flex: 1; background: #0f0f1a; border-radius: 12px; padding: 16px; text-align: center; }
.score-num { font-size: 40px; font-weight: 900; }
.score-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
.bar-section { margin-bottom: 24px; opacity: 0; transition: opacity 0.8s; }
.bar-section.visible { opacity: 1; }
.bar-row { margin-bottom: 12px; }
.bar-label { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
.bar-track { background: #0f0f1a; border-radius: 6px; height: 12px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 6px; width: 0; transition: width 1.5s ease-out; }
.revenue-section { background: #1e1b4b; border: 1px solid #4c1d95; border-radius: 12px; padding: 16px; margin-bottom: 24px; opacity: 0; transition: opacity 0.8s; }
.revenue-section.visible { opacity: 1; }
.revenue-num { font-size: 32px; font-weight: 900; color: #dc2626; }
.fix-card { background: #064e3b; border: 1px solid #065f46; border-radius: 12px; padding: 16px; opacity: 0; transition: opacity 0.8s; }
.fix-card.visible { opacity: 1; }
.fix-badge { background: #059669; color: #fff; border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 700; display: inline-block; margin-bottom: 8px; }
.verify-badge { display: inline-flex; align-items: center; gap: 6px; background: #1B17FF; color: #fff; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-top: 12px; opacity: 0; transition: opacity 0.8s; }
.verify-badge.visible { opacity: 1; }
</style>
</head>
<body>
<div class="screen">
  <div class="logo">RANKALL.IO</div>
  <div class="search-bar" id="searchBar"><span id="searchText"></span><span class="cursor"></span></div>
  <div class="scanning-label" id="scanLabel" style="display:none">Scanning 12 AI platforms simultaneously...</div>
  <div class="platform-grid" id="platformGrid" style="display:none">
    <div class="platform" id="p0">ChatGPT</div>
    <div class="platform" id="p1">Gemini</div>
    <div class="platform" id="p2">Perplexity</div>
    <div class="platform" id="p3">Grok</div>
    <div class="platform" id="p4">Copilot</div>
    <div class="platform" id="p5">Claude</div>
    <div class="platform" id="p6">DeepSeek</div>
    <div class="platform" id="p7">Mistral</div>
    <div class="platform" id="p8">Kimi</div>
    <div class="platform" id="p9">Groq</div>
    <div class="platform" id="p10">Google AI</div>
    <div class="platform" id="p11">Meta AI</div>
  </div>
  <div class="score-section" id="scoreSection">
    <div class="score-box">
      <div class="score-num" id="yourScore" style="color:#dc2626">0</div>
      <div class="score-label">Your Score /100</div>
    </div>
    <div class="score-box">
      <div class="score-num" id="compScore" style="color:#059669">0</div>
      <div class="score-label">${competitor_name ?? 'Competitor'} /100</div>
    </div>
  </div>
  <div class="bar-section" id="barSection">
    <div class="bar-row">
      <div class="bar-label"><span>You</span><span>${score}%</span></div>
      <div class="bar-track"><div class="bar-fill" id="yourBar" style="background:#1B17FF;width:0"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>${competitor_name ?? 'Competitor'}</span><span>${competitor_score}%</span></div>
      <div class="bar-track"><div class="bar-fill" id="compBar" style="background:#dc2626;width:0"></div></div>
    </div>
  </div>
  <div class="revenue-section" id="revenueSection">
    <p style="font-size:13px;color:#fca5a5;margin-bottom:8px">Monthly revenue going to competitor</p>
    <div class="revenue-num" id="revenueNum">$0</div>
  </div>
  <div class="fix-card" id="fixCard">
    <div class="fix-badge">FIX #1 — FREE</div>
    <p style="font-weight:700;margin-bottom:4px">Google Business Profile Optimization</p>
    <p style="font-size:13px;color:#6ee7b7">Add service keywords AI looks for. Takes 20 minutes. Free.</p>
    <div class="verify-badge" id="verifyBadge">✓ A verification rescan measures the real change after fixes are applied</div>
  </div>
</div>
<script>
const YOUR_SCORE = ${score};
const COMP_SCORE = ${competitor_score};
const REVENUE = ${revenue_leak};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function animateNumber(el, target, prefix, duration) {
  const start = Date.now();
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / duration);
    el.textContent = prefix + Math.round(p * target).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  tick();
}

async function runDemo() {
  // Type search query
  const searchText = 'best dentist in Chicago IL';
  const searchEl = document.getElementById('searchText');
  for (let i = 0; i <= searchText.length; i++) {
    searchEl.textContent = searchText.slice(0, i);
    await delay(60);
  }
  await delay(500);

  // Show platforms
  document.getElementById('scanLabel').style.display = 'block';
  document.getElementById('platformGrid').style.display = 'grid';
  for (let i = 0; i < 12; i++) {
    await delay(300);
    document.getElementById('p' + i).classList.add('lit');
    document.getElementById('p' + i).textContent += ' ✓';
  }
  await delay(800);

  // Show scores
  const scoreSection = document.getElementById('scoreSection');
  scoreSection.classList.add('visible');
  animateNumber(document.getElementById('yourScore'), YOUR_SCORE, '', 1200);
  animateNumber(document.getElementById('compScore'), COMP_SCORE, '', 1200);
  await delay(1500);

  // Show bars
  const barSection = document.getElementById('barSection');
  barSection.classList.add('visible');
  document.getElementById('yourBar').style.width = YOUR_SCORE + '%';
  document.getElementById('compBar').style.width = COMP_SCORE + '%';
  await delay(2000);

  // Show revenue
  const revenueSection = document.getElementById('revenueSection');
  revenueSection.classList.add('visible');
  animateNumber(document.getElementById('revenueNum'), REVENUE, '$', 1500);
  await delay(2000);

  // Show fix
  document.getElementById('fixCard').classList.add('visible');
  await delay(2000);

  // Show verify badge
  document.getElementById('verifyBadge').classList.add('visible');
  await delay(5000);

  // Loop
  runDemo();
}

runDemo();
</script>
</body>
</html>`;

  // Save HTML to Supabase Storage
  let demoPagesUrl: string | null = null;
  const htmlUploadRes = await fetch(
    `${supabaseUrlForStorage}/storage/v1/object/demo-videos/demo-animation-${timestamp}.html`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKeyForStorage}`, apikey: serviceKeyForStorage, 'Content-Type': 'text/html', 'x-upsert': 'true' },
      body: demoHtml,
    }
  );
  if (htmlUploadRes.ok) {
    demoPagesUrl = `${supabaseUrlForStorage}/storage/v1/object/public/demo-videos/demo-animation-${timestamp}.html`;
  }

  // Save to demo_videos table
  await supabase.from('demo_videos').insert({
    script,
    audio_url: audioUrl,
    demo_page_url: demoPagesUrl,
    scan_data: { competitor_name, score, competitor_score, revenue_leak },
  });

  return NextResponse.json({
    script,
    audio_url: audioUrl,
    demo_page_url: demoPagesUrl,
    scan_data: { competitor_name, score, competitor_score, revenue_leak },
    diagnostics,
  });
}
