import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
// P0a: server-side route — service_role (bypasses RLS); no user session here.
const supabase = getSupabaseAdmin();
import { PLATFORMS, callPlatform } from '@/lib/platforms';
import { escapeHtml } from '@/lib/escapeHtml';
import { shouldSkipEmail } from '@/lib/emailSuppression';
import { generateUnsubscribeToken } from '@/lib/outreachGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ── HELPERS ───────────────────────────────────────────────────────────

async function analyzeForMention(response: string, name: string): Promise<{
  mentioned: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'not_found';
}> {
  if (!response || response.trim().length < 20) return { mentioned: false, sentiment: 'not_found' };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { mentioned: false, sentiment: 'not_found' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Does this AI response show genuine knowledge of "${name}"? Reply JSON only: {"mentioned":true/false,"sentiment":"positive"/"neutral"/"negative"/"not_found"}\n\nResponse: "${response.slice(0, 400)}"`,
        }],
      }),
    });
    const data = await res.json();
    const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return {
      mentioned: parsed.mentioned === true,
      sentiment: (['positive','neutral','negative','not_found'].includes(parsed.sentiment) ? parsed.sentiment : 'not_found') as 'positive' | 'neutral' | 'negative' | 'not_found',
    };
  } catch {
    return { mentioned: false, sentiment: 'not_found' };
  }
}

async function getTopActionFromHaiku(name: string, specialty: string, score: number): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return 'Run a full scan to see your top priority action.';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `${name} is a ${specialty} with AI visibility score ${score}/100. Give ONE specific, actionable improvement they can do this week to improve their AI visibility. 2 sentences max.`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || 'Run a full scan to see your top priority action.';
  } catch {
    return 'Run a full scan to see your top priority action.';
  }
}

async function getReputationActions(name: string, platform: string, excerpt: string): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return '1. Run a full audit of your online presence.\n2. Respond to any negative mentions.\n3. Build positive authority signals like Wikipedia and press mentions.';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `${name}'s name was shown on ${platform} with potentially negative content: "${excerpt.slice(0, 300)}"\n\nGive 3 specific action steps to address this and improve their AI reputation. Number them 1, 2, 3.`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '1. Monitor AI platforms regularly.\n2. Build positive authority signals.\n3. Contact Rankall support for reputation management guidance.';
  } catch {
    return '1. Monitor AI platforms regularly.\n2. Build positive authority signals.\n3. Contact Rankall support for reputation management guidance.';
  }
}

async function sendWeeklyEmail(userId: string, email: string, firstName: string, name: string, specialty: string, score: number, delta: number, topAction: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) { console.warn('RESEND_API_KEY missing — skipping weekly email'); return; }
  // CAN-SPAM: never mail an unsubscribed / bounced address, nor a user who
  // turned "Weekly report" off in Settings (lib/emailSuppression).
  if (await shouldSkipEmail({ email, userId }, 'weekly_report')) return;

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const deltaText = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— No change';

  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px">
  <div style="background:white;border-radius:16px;padding:32px;border:1px solid #e2e8f0">
    <h2 style="color:#0f172a;margin-bottom:4px">Hi ${escapeHtml(firstName)} — here's your AI name recognition update</h2>
    <p style="color:#64748b;margin-bottom:24px">${date}</p>

    <div style="background:#f5f3ff;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <p style="font-size:13px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px">AI Name Recognition Score</p>
      <p style="font-size:48px;font-weight:900;color:#7c3aed;margin:0">${score}/100</p>
      <p style="color:#64748b;margin:4px 0 0">${deltaText} vs last week</p>
    </div>

    <p style="color:#374151;margin-bottom:16px">When someone searches for you on ChatGPT, Gemini, or Perplexity — this is how often your name comes up. The higher your score, the more people find <em>you</em> instead of a competitor.</p>

    <h3 style="color:#0f172a;margin-bottom:8px">Your #1 Action This Week</h3>
    <p style="color:#374151;line-height:1.7;margin-bottom:24px">${topAction}</p>

    <a href="https://rankall.io/dashboard/personal-brand" style="background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">See Your Full Name Recognition Report →</a>

    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
    <p style="font-size:12px;color:#94a3b8;margin:0">Rankall.io · Personal Brand AI Visibility · <a href="https://rankall.io/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${generateUnsubscribeToken(email)}" style="color:#94a3b8;">Unsubscribe</a></p>
  </div>
</div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: [email],
        subject: `Your AI name recognition this week, ${firstName}`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('Resend weekly email error:', err);
    }
  } catch (e) {
    console.error('sendWeeklyEmail error:', e);
  }
}

async function sendReputationAlert(userId: string, email: string, name: string, platform: string, excerpt: string, actions: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) { console.warn('RESEND_API_KEY missing — skipping reputation alert'); return; }
  // CAN-SPAM: never mail an unsubscribed / bounced address, nor a user who
  // turned "Competitor alerts" off in Settings (lib/emailSuppression).
  if (await shouldSkipEmail({ email, userId }, 'competitor_alerts')) return;

  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px">
  <div style="background:white;border-radius:16px;padding:32px;border:1px solid #fee2e2">
    <h2 style="color:#dc2626;margin-bottom:4px">⚠️ AI Reputation Alert</h2>
    <p style="color:#374151;margin-bottom:20px"><strong>${platform}</strong> may be showing concerning information when people search for you.</p>

    <div style="background:#fef2f2;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #fecaca">
      <p style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px">What it said:</p>
      <p style="font-size:13px;color:#7f1d1d;font-style:italic;margin:0">"${excerpt}"</p>
    </div>

    <h3 style="color:#0f172a;margin-bottom:8px">Here's what to do:</h3>
    <p style="color:#374151;line-height:1.7;white-space:pre-line;margin-bottom:24px">${actions}</p>

    <a href="https://rankall.io/dashboard/personal-brand" style="background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">View Full Report →</a>

    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
    <p style="font-size:12px;color:#94a3b8;margin:0">Rankall.io · AI Visibility for Professionals · <a href="https://rankall.io/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${generateUnsubscribeToken(email)}" style="color:#94a3b8;">Unsubscribe</a></p>
  </div>
</div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: [email],
        subject: `⚠️ AI Reputation Alert for ${name}`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('Resend reputation alert error:', err);
    }
  } catch (e) {
    console.error('sendReputationAlert error:', e);
  }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Bearer CRON_SECRET only (what Vercel Cron sends), fail closed.
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  try {
    // FIX 2: ensure personal_profiles table exists (safe no-op if already present)
    try {
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS personal_profiles (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid UNIQUE,
            full_name text,
            title_prefix text,
            specialty text,
            city text,
            state text,
            country text DEFAULT 'US',
            practice_name text,
            website_url text,
            years_experience integer,
            credentials text[],
            license_number text,
            linkedin_url text,
            healthgrades_url text,
            avvo_url text,
            twitter_handle text,
            google_business_url text,
            competitor_1 text,
            competitor_2 text,
            competitor_3 text,
            profile_complete boolean DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `,
      });
    } catch { /* table may already exist or RPC unavailable — continue */ }
    // Step 1: Get personal_pro users
    interface ProfileRow { user_id: string; email: string; }
    let proUsers: ProfileRow[] = [];

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id, email')
        .in('account_type', ['personal_pro', 'starter']);
      if (profileData && profileData.length > 0) {
        proUsers = profileData as ProfileRow[];
      }
    } catch (e) {
      console.warn('profiles table query failed:', e);
    }

    // Fallback: try subscriptions table
    if (proUsers.length === 0) {
      try {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('user_id, email')
          .in('plan', ['personal_pro', 'starter'])
          .eq('status', 'active');
        if (subData) proUsers = subData as ProfileRow[];
      } catch (e) {
        console.warn('subscriptions table query failed:', e);
      }
    }

    if (proUsers.length === 0) {
      return NextResponse.json({ message: 'No personal_pro users found', processed: 0 });
    }

    const results: Array<{ userId: string; status: string; error?: string }> = [];

    // Step 2: Process each user
    for (const user of proUsers) {
      try {
        // Get last scan for this user
        interface ScanRow { input: string; overall_score: number; created_at: string; }
        let lastScan: ScanRow | null = null;
        try {
          const { data: scanData } = await supabase
            .from('rankall_scans')
            .select('input, overall_score, created_at')
            .eq('user_id', user.user_id)
            .eq('intent_type', 'personal_pro')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          lastScan = scanData as ScanRow | null;
        } catch (e) {
          console.warn(`No scan found for user ${user.user_id}:`, e);
          results.push({ userId: user.user_id, status: 'skipped', error: 'no_scans' });
          continue;
        }

        if (!lastScan) {
          results.push({ userId: user.user_id, status: 'skipped', error: 'no_scans' });
          continue;
        }

        // Parse name from scan input: "Dr. Jane Smith cardiologist Chicago"
        const inputParts = lastScan.input.split(' ');
        const name = inputParts.slice(0, 2).join(' ');
        const specialty = inputParts.slice(2).join(' ') || 'professional';
        const firstName = name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || name;
        const lastScore = lastScan.overall_score;

        // Step 3: Quick 3-platform scan (ChatGPT, Gemini, Perplexity)
        const quickPlatforms = PLATFORMS.filter(p => ['ChatGPT', 'Gemini', 'Perplexity'].includes(p.name));
        const query = `Who is ${name} ${specialty}?`;

        const scanResults = await Promise.allSettled(
          quickPlatforms.map(p => callPlatform(p, query).then(response => ({ platform: p.name, response })))
        );

        const analyses = await Promise.all(
          scanResults
            .filter((r): r is PromiseFulfilledResult<{ platform: string; response: string }> => r.status === 'fulfilled')
            .map(r => analyzeForMention(r.value.response, name).then(a => ({ ...a, platform: r.value.platform, response: r.value.response })))
        );

        // Step 4: Calculate new score
        const mentionCount = analyses.filter(a => a.mentioned).length;
        const newScore = Math.round((mentionCount / Math.max(analyses.length, 1)) * 100);
        const delta = newScore - lastScore;

        // Step 5: Check for negative sentiment
        const negativeAnalyses = analyses.filter(a => a.sentiment === 'negative');

        // Step 6a: Send reputation alerts if negative
        for (const neg of negativeAnalyses) {
          const excerpt = neg.response.slice(0, 300);
          const actions = await getReputationActions(name, neg.platform, excerpt);
          await sendReputationAlert(user.user_id, user.email, name, neg.platform, excerpt, actions);
        }

        // KP history tracking: fetch latest scan and record KP data
        try {
          const { data: latestScan } = await supabase
            .from('rankall_scans')
            .select('id, knowledge_panel_data')
            .eq('user_id', user.user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (latestScan?.knowledge_panel_data) {
            const kpData = latestScan.knowledge_panel_data as { exists?: boolean; claimed?: boolean; completeness?: number };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('knowledge_panel_history') as any).insert({
              user_id: user.user_id,
              scan_id: latestScan.id,
              exists: kpData.exists ?? false,
              claimed: kpData.claimed ?? false,
              completeness: kpData.completeness ?? 0,
            }); // don't fail cron if KP history fails — wrapped in try/catch above
          }
        } catch { /* non-fatal */ }

        // Step 6b: Get top action and send weekly email
        const topAction = await getTopActionFromHaiku(name, specialty, newScore);
        await sendWeeklyEmail(user.user_id, user.email, firstName, name, specialty, newScore, delta, topAction);

        results.push({ userId: user.user_id, status: 'sent' });
      } catch (userErr) {
        console.error(`Error processing user ${user.user_id}:`, userErr);
        results.push({ userId: user.user_id, status: 'error', error: String(userErr) });
      }
    }

    return NextResponse.json({ message: 'Monitor run complete', processed: results.length, results });
  } catch (err) {
    console.error('personal-monitor cron error:', err);
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 });
  }
}
