import { createClient } from '@supabase/supabase-js';
import { fetchPublicUrlWithDns } from './ssrf-server';

const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'PerplexityBot',
  'ClaudeBot',
  'bingbot',
] as const;

export type AIBot = (typeof AI_BOTS)[number];

export interface CrawlerCheckResult {
  checked: boolean;
  blockedBots: AIBot[];
  rawLines: string[];
  robotsTxtFound: boolean;
}

export async function checkCrawlerAccess(websiteUrl: string): Promise<CrawlerCheckResult> {
  const empty: CrawlerCheckResult = { checked: true, blockedBots: [], rawLines: [], robotsTxtFound: false };

  let origin: string;
  try {
    const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    origin = u.origin;
  } catch {
    return { ...empty, checked: false };
  }

  let text: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    // ax89: fetchPublicUrlWithDns validates the target + every redirect hop (DNS-checked)
    // (a scan input like http://169.254.169.254 must never be fetched
    // server-side, and a public URL must not redirect to one).
    const res = await fetchPublicUrlWithDns(`${origin}/robots.txt`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RankallBot/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return empty;
    text = await res.text();
  } catch {
    return empty;
  }

  const lines = text.split('\n').map(l => l.trim());
  const blocked: AIBot[] = [];
  const matchedLines: string[] = [];

  let currentAgent: string | null = null;
  let isWildcard = false;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const agentMatch = line.match(/^User-agent:\s*(.+)/i);
    if (agentMatch) {
      currentAgent = agentMatch[1].trim();
      isWildcard = currentAgent === '*';
      continue;
    }

    const disallowMatch = line.match(/^Disallow:\s*\/\s*$/i);
    if (!disallowMatch) continue;

    // "Disallow: /" under a matching agent blocks everything
    for (const bot of AI_BOTS) {
      if (blocked.includes(bot)) continue;
      if (isWildcard || currentAgent?.toLowerCase() === bot.toLowerCase()) {
        blocked.push(bot);
        matchedLines.push(`User-agent: ${currentAgent}\nDisallow: /`);
      }
    }
  }

  return {
    checked: true,
    blockedBots: blocked,
    rawLines: matchedLines,
    robotsTxtFound: true,
  };
}

export async function storeCrawlerResult(
  scanId: string,
  result: CrawlerCheckResult,
): Promise<void> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    await sb.from('rankall_scans').update({
      crawler_blocked_bots: result.blockedBots,
      crawler_check_raw: result,
      crawler_check_done: true,
    }).eq('id', scanId);
  } catch (err) {
    console.error('[crawlerCheck] store failed:', err);
  }
}
