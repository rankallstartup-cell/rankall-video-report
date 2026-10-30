/**
 * Rankall.io — Automated Product Tour Generator (Part 1)
 *
 * STANDALONE Node script. This is NOT a Next.js route and must NOT be imported
 * by the app. Playwright/Chromium cannot run inside Vercel serverless functions,
 * so this script is designed to run in a browser-capable environment: local dev,
 * CI, or a GitHub Actions runner.
 *
 * Run with:  npm run generate-tour
 *
 * Required env:
 *   RANKALL_PASSWORD            login password for rankallstartup@gmail.com
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   (service role — Storage upload + DB upsert + scan lookup)
 * Optional env (audio narration is skipped gracefully if unset):
 *   ELEVENLABS_API_KEY
 *   ELEVENLABS_VOICE_ID
 *
 * The browser is pre-installed at /opt/pw-browsers. Do NOT run `playwright install`.
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

type Page = import('playwright').Page;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RANKALL_EMAIL = 'rankallstartup@gmail.com';
const RANKALL_PASSWORD = process.env.RANKALL_PASSWORD || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!RANKALL_PASSWORD) {
  console.error('Missing RANKALL_PASSWORD — set it so Playwright can log in to capture dashboard pages.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BUCKET = 'demo-videos';
const BASE = 'https://www.rankall.io';

// The latest scan id is looked up once at runtime and used for the report-page steps.
let latestScanId = '';

// Collapse all runs of whitespace into single spaces and trim — keeps narration
// TTS-safe (no stray newlines or double spaces read awkwardly).
function clean(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// Hide chat widgets, cookie banners, and the country-override badge so they
// never appear in the captured screenshots.
async function hideOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const selectors = [
      '[data-chat]', '.chat-widget', '#chat-widget',
      '[class*="chatbot"]', '[class*="Chatbot"]', '[id*="chat"]',
      '[data-cookie]', '[class*="cookie"]', '[class*="Cookie"]',
      '[class*="banner"]', '[class*="Banner"]',
      '[class*="country-override"]', '[class*="override"]',
      '[class*="announcement"]', '[class*="Announcement"]',
      '[class*="exit-intent"]', '[class*="popup"]', '[class*="Popup"]',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((n) => {
        try { (n as HTMLElement).style.display = 'none'; } catch { /* ignore */ }
      });
    }
  }).catch(() => {});
}

async function highlight(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      (el as HTMLElement).style.outline = '4px solid #7c3aed';
      (el as HTMLElement).style.boxShadow = '0 0 0 4px rgba(124,58,237,0.4)';
      (el as HTMLElement).style.transition = 'all 0.3s';
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
    }
  }, selector).catch(() => {});
}

// Log in as admin so dashboard pages render real data in the screenshots.
//
// The login page's submit button has NO type="submit" attribute in the DOM
// (it's a plain <button onClick={...}>), so a selector like
// 'button[type="submit"]' matches zero elements — page.click() on it hangs
// for the full action timeout and silently fails once caught, meaning the
// form is never actually submitted. Robust locators (with .or() fallbacks
// and explicit waitFor) avoid that trap entirely.
async function loginToRankall(page: Page): Promise<void> {
  console.log('Logging in to Rankall...');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/login-debug.png' }).catch(() => {});

  const emailField = page
    .locator('input[type="email"]')
    .or(page.locator('input[name="email"]'))
    .or(page.locator('input[placeholder*="email" i]'))
    .first();
  await emailField.waitFor({ timeout: 10000 });
  await emailField.fill(RANKALL_EMAIL);
  console.log('✓ Email filled');

  const passwordField = page
    .locator('input[type="password"]')
    .or(page.locator('input[name="password"]'))
    .or(page.locator('input[placeholder*="password" i]'))
    .first();
  await passwordField.waitFor({ timeout: 10000 });
  await passwordField.fill(RANKALL_PASSWORD);
  console.log('✓ Password filled');

  const submitBtn = page
    .locator('button[type="submit"]')
    .or(page.locator('button:has-text("Sign in")'))
    .or(page.locator('button:has-text("Log in")'))
    .or(page.locator('button:has-text("Sign In")'))
    .first();
  await submitBtn.waitFor({ timeout: 5000 });
  await submitBtn.click();
  console.log('✓ Submit clicked');

  try {
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    console.log('✓ Logged in successfully');
  } catch {
    const bodyText = await page.locator('body').innerText();
    if (
      bodyText.includes('Overview') ||
      bodyText.includes('MY BUSINESS') ||
      bodyText.includes('Personal Brand')
    ) {
      console.log('✓ Logged in (content check)');
    } else {
      console.log('⚠ Login may have failed.');
      console.log('Current URL:', page.url());
      await page.screenshot({ path: '/tmp/login-failed.png' }).catch(() => {});
    }
  }
}

interface TourStep {
  id: string;
  title: string;
  duration: number;
  narration: string;
  action: (page: Page) => Promise<void>;
  tooltip: string;
  highlight?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'homepage',
    title: 'The AI Visibility Platform',
    duration: 8,
    narration: clean(
      `Welcome to Rankall — the platform that shows you exactly why ChatGPT recommends
       your competitor instead of you, and how to fix it.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    tooltip: 'The AI visibility platform for local businesses',
  },
  {
    id: 'search',
    title: 'One Search — 12 AI Platforms',
    duration: 8,
    narration: clean(
      `Enter your business name or search query. Rankall scans ChatGPT, Gemini,
       Perplexity, and 8 more AI platforms simultaneously.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      const input = page.locator('input').first();
      await input.focus().catch(() => {});
      await page.waitForTimeout(1000);
    },
    tooltip: 'One search bar scans 12 AI platforms simultaneously',
    highlight: 'input',
  },
  {
    id: 'scanning',
    title: 'Scanning 12 AI Platforms Live',
    duration: 10,
    narration: clean(
      `Watch as Rankall queries every major AI platform in real time. This is
       your actual AI visibility right now.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      const input = page.locator('input').first();
      await input.fill('best dentist in Chicago IL').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(5000);
    },
    tooltip: 'Real AI platform responses, not estimates',
  },
  {
    id: 'score',
    title: 'Your AI Visibility Score',
    duration: 10,
    narration: clean(
      `Your score out of 100 shows how prominently AI platforms recommend you.
       Most businesses score below 50. The top performers capture 3x more AI customers.`
    ),
    action: async (page) => {
      // Wait for scan to complete
      await page
        .waitForFunction(() => document.body.innerText.includes('/100'), { timeout: 60000 })
        .catch(() => {});

      // Force scroll to absolute top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });

      // Wait longer for scroll to settle
      await page.waitForTimeout(3000);

      // Verify we are at the top
      const scrollY = await page.evaluate(() => window.scrollY);
      console.log('[score] scrollY:', scrollY);
    },
    tooltip: 'Real score based on actual AI platform responses',
  },
  {
    id: 'platforms',
    title: 'Platform by Platform Breakdown',
    duration: 8,
    narration: clean(
      `See exactly which AI platforms recommend you and which recommend your
       competitor. ChatGPT and Gemini carry the most weight.`
    ),
    action: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(1500);
    },
    tooltip: 'Per-platform mentioned/not-mentioned breakdown',
  },
  {
    id: 'competitor',
    title: 'Your Competitor Is Winning',
    duration: 10,
    narration: clean(
      `This is who AI is recommending instead of you. See their score, which
       platforms prefer them, and exactly how much revenue that gap costs you every month.`
    ),
    action: async (page) => {
      if (latestScanId) {
        await page.goto(`${BASE}/report/${latestScanId}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
      }
      await highlight(page, '[data-competitor], [class*="competitor"], [class*="Competitor"]');
    },
    tooltip: 'Competitor detected automatically from AI responses',
    highlight: '[data-competitor]',
  },
  {
    id: 'revenue',
    title: 'The Revenue Gap',
    duration: 8,
    narration: clean(
      `Every month you are invisible on AI, your competitor captures customers
       that should be yours. Rankall calculates exactly how much that costs.`
    ),
    action: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(1500);
    },
    tooltip: 'Revenue gap calculated from missed AI recommendations',
  },
  {
    id: 'fix-queue',
    title: 'Your Personalized Fix Plan',
    duration: 10,
    narration: clean(
      `Rankall does not just show you the problem. It generates a specific fix
       plan for your business. Each fix is ranked by impact and comes with exact
       implementation instructions.`
    ),
    action: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(1500);
    },
    tooltip: 'Fix #1 is always free — generated code ready to use',
  },
  {
    id: 'dashboard',
    title: 'Your Complete Dashboard',
    duration: 10,
    narration: clean(
      `Your Rankall dashboard tracks everything in one place. Score history,
       competitor movement, fix progress, and weekly reports — all automated.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
    },
    tooltip: 'Everything you need to track your AI visibility',
  },
  {
    id: 'score-history',
    title: 'Track Your Improvement',
    duration: 8,
    narration: clean(
      `Watch your score improve week over week as you implement fixes. Every
       improvement is verified by rescanning all 12 AI platforms.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/score-history`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: 'Verified improvement over time',
  },
  {
    id: 'fix-engine',
    title: '13 AI-Powered Fix Tools',
    duration: 10,
    narration: clean(
      `The Fix Engine generates ready-to-use content for every fix. FAQ schema,
       LocalBusiness markup, Google Business Profile updates — all generated for
       your specific business.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/fix`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: '13 tools that generate real content for your business',
  },
  {
    id: 'trust',
    title: '35 Trust Signals Analyzed',
    duration: 8,
    narration: clean(
      `Rankall analyzes 35 trust signals that AI platforms use to decide who to
       recommend. See exactly which signals you are missing and how to fix them.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/trust`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: '35 trust signals analyzed automatically',
  },
  {
    id: 'social-content',
    title: 'AI-Generated Social Content',
    duration: 8,
    narration: clean(
      `Generate ready-to-post content for LinkedIn, Reddit, Facebook, Instagram,
       and 5 more platforms. All personalized to your business and optimized for
       AI visibility.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/social-content`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: '9 platforms, one click to generate',
  },
  {
    id: 'competitors',
    title: 'Competitor Intelligence',
    duration: 8,
    narration: clean(
      `Track your top competitors across all 12 AI platforms. Get alerted when
       they improve their score so you can respond immediately.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/competitor`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: 'Automatic competitor tracking across every platform',
  },
  {
    id: 'seo-health',
    title: 'SEO Health Score',
    duration: 8,
    narration: clean(
      `AI visibility and SEO are now connected. Rankall shows how your traditional
       SEO affects your AI recommendations and what to fix first.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/seo-health`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: 'SEO health tied directly to AI recommendations',
  },
  {
    id: 'weekly-report',
    title: 'Weekly AI Visibility Report',
    duration: 8,
    narration: clean(
      `Every Monday Rankall sends you a personalized report showing your score
       change, competitor movement, and top opportunity for the week. Completely
       automated.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2000);
    },
    tooltip: 'Automated weekly reports, no manual work',
  },
  {
    id: 'simulator',
    title: 'See Your Score After Fixes',
    duration: 10,
    narration: clean(
      `The Recommendation Simulator shows your projected score after implementing
       each fix. Know exactly what your score will be before you do the work.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/dashboard/simulator`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: 'Projected improvement based on similar businesses',
  },
  {
    id: 'global',
    title: '14 Countries Supported',
    duration: 8,
    narration: clean(
      `Rankall works for businesses in 14 countries including the US, UK, Australia,
       Canada, India, and more. Local pricing, local AI platforms, local competitor data.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });

      // Zoom out to show all plans
      await page.evaluate(() => {
        document.body.style.zoom = '0.7';
      });

      // Scroll to bottom to show country/global section
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      await page.waitForTimeout(2000);
    },
    tooltip: '14 countries, 14 currencies, local competitor data',
  },
  {
    id: 'pricing',
    title: 'Simple, Transparent Pricing',
    duration: 8,
    narration: clean(
      `Start with Personal Brand at $15 per month or Local Business at $39.
       Agencies manage unlimited clients for $259. All plans include the full
       Fix Engine and weekly reports.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });

      // Zoom out to show all plans
      await page.evaluate(() => {
        document.body.style.zoom = '0.7';
      });

      await page.waitForTimeout(2000);
    },
    tooltip: 'Transparent pricing, no hidden fees',
  },
  {
    id: 'cta',
    title: 'Scan Your Business Free',
    duration: 8,
    narration: clean(
      `See your AI Visibility Score in about 90 seconds. No credit card required. Find
       out exactly why ChatGPT recommends your competitor — and how to fix it.`
    ),
    action: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    },
    tooltip: 'Scan your business free — score in about 90 seconds',
  },
];

// Run the step action, settle, hide overlays, screenshot a 1280x720 clip, upload
// to Storage, return the public URL. Any failure returns '' so the run never aborts.
async function captureStep(page: Page, step: TourStep): Promise<string> {
  try {
    await step.action(page);
  } catch (e) {
    console.log(`  [${step.id}] action failed: ${String(e)}`);
  }

  // Let animations finish, reset any page-level zoom, then strip overlays
  // right before the shot. Zoom must be reset per-step (not once at context
  // creation) since every page.goto() loads a fresh document.
  await page.waitForTimeout(2000);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; }).catch(() => {});
  await hideOverlays(page);
  await page.waitForTimeout(300);

  let buffer: Buffer;
  try {
    buffer = await page.screenshot({
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
      type: 'png',
    });
  } catch (e) {
    console.log(`  [${step.id}] screenshot failed: ${String(e)}`);
    return '';
  }

  try {
    const path = `tour/${step.id}.png`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: true });
    if (error) {
      console.log(`  [${step.id}] screenshot upload failed: ${error.message}`);
      return '';
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.log(`  [${step.id}] screenshot upload threw: ${String(e)}`);
    return '';
  }
}

// Strip any markdown, collapse whitespace, POST to ElevenLabs, upload the mp3,
// return its public URL. Returns '' on any error or if ElevenLabs is not set.
async function generateStepAudio(step: TourStep): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return '';
  }

  const text = clean(
    step.narration
      .replace(/[*#_`>]/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
  );

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.1,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.log(`  [${step.id}] ElevenLabs error ${res.status}: ${err.slice(0, 200)}`);
      return '';
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const path = `tour/${step.id}-audio.mp3`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
    if (error) {
      console.log(`  [${step.id}] audio upload failed: ${error.message}`);
      return '';
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.log(`  [${step.id}] audio threw: ${String(e)}`);
    return '';
  }
}

async function ensureBucket(): Promise<void> {
  try {
    await supabase.storage.createBucket(BUCKET, { public: true });
    console.log(`Bucket '${BUCKET}' created.`);
  } catch (e) {
    // "already exists" is fine — ignore.
    console.log(`Bucket ensure: ${String(e)}`);
  }
}

async function loadLatestScanId(): Promise<void> {
  const { data, error } = await supabase
    .from('rankall_scans')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    console.log(`Latest scan lookup failed (report steps will use homepage state): ${error.message}`);
    return;
  }
  latestScanId = (data as { id: string } | null)?.id ?? '';
  console.log(`Latest scan id for report steps: ${latestScanId || '(none found)'}`);
}

async function generateProductTour(): Promise<void> {
  console.log('Starting Rankall product tour generation...');
  await ensureBucket();
  await loadLatestScanId();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const tourData: Array<Record<string, unknown>> = [];

  try {
    // Log in first so the dashboard / fix engine / simulator steps render real data.
    await loginToRankall(page);

    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const step = TOUR_STEPS[i];
      console.log(`Step ${i + 1}/${TOUR_STEPS.length}: ${step.id} — ${step.title}`);

      const screenshotUrl = await captureStep(page, step);
      console.log(`  screenshot: ${screenshotUrl || '(none)'}`);

      const audioUrl = await generateStepAudio(step);
      console.log(`  audio: ${audioUrl || '(none)'}`);

      tourData.push({
        id: step.id,
        title: step.title,
        duration: step.duration,
        narration: step.narration,
        tooltip: step.tooltip,
        highlight: step.highlight ?? null,
        screenshot_url: screenshotUrl,
        audio_url: audioUrl,
      });
    }
  } finally {
    await browser.close();
  }

  const { error } = await supabase
    .from('product_tour')
    .upsert({ id: 'main', steps: tourData, generated_at: new Date().toISOString() });

  if (error) {
    throw new Error(`product_tour upsert failed: ${error.message}`);
  }

  // Sync verification — confirm every step has a screenshot and audio.
  console.log('\n=== TOUR SYNC CHECK ===');
  tourData.forEach((step, i) => {
    console.log(`Step ${i + 1}: ${step.id}`);
    console.log(`  Screenshot: ${step.screenshot_url ? '✓' : '✗ MISSING'}`);
    console.log(`  Audio: ${step.audio_url ? '✓' : '✗ MISSING'}`);
    console.log(`  Duration: ${step.duration}s`);
  });
  const missingShots = tourData.filter((s) => !s.screenshot_url).length;
  const missingAudio = tourData.filter((s) => !s.audio_url).length;
  console.log(`\nSummary: ${tourData.length} steps, ${missingShots} missing screenshots, ${missingAudio} missing audio.`);
  console.log(`Done. Upserted ${tourData.length} steps into product_tour (id: main).`);
}

generateProductTour().catch((err) => {
  console.error('Product tour generation failed:', err);
  process.exit(1);
});
