import { NextRequest, NextResponse } from 'next/server';
import { getAdminOrInternalActor } from '@/lib/apiAuth';
import { checkRateLimitDb } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

interface EmailResult {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  confidence: number;
  source: string;
}

const NOT_FOUND: EmailResult = { email: null, firstName: null, lastName: null, confidence: 0, source: 'not_found' };

async function tryApollo(businessName: string, city: string | undefined): Promise<EmailResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    q_organization_name: businessName,
    page: 1,
    per_page: 1,
    person_titles: ['owner', 'founder', 'CEO', 'president', 'managing partner', 'director'],
  };
  if (city) body.person_locations = [city];

  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error('[find-email] Apollo error:', res.status, await res.text().catch(() => ''));
    return null;
  }

  const data = await res.json();
  const person = data.people?.[0];
  if (!person?.email) return null;

  return {
    email: person.email,
    firstName: person.first_name || null,
    lastName: person.last_name || null,
    confidence: 90,
    source: 'apollo',
  };
}

async function tryHunter(businessName: string, city: string | undefined, domain: string | undefined): Promise<EmailResult | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  if (domain) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(cleanDomain)}&api_key=${apiKey}&limit=5`
    );
    const data = await res.json();
    const emails = data.data?.emails || [];
    if (emails.length > 0) {
      const best = emails.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))[0];
      return {
        email: best.value,
        firstName: best.first_name || null,
        lastName: best.last_name || null,
        confidence: best.confidence || 0,
        source: 'hunter_domain',
      };
    }
  }

  const params = new URLSearchParams({
    company: businessName,
    api_key: apiKey,
    ...(city ? { city } : {}),
  });
  const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
  const data = await res.json();
  if (data.data?.email) {
    return {
      email: data.data.email,
      firstName: data.data.first_name || null,
      lastName: data.data.last_name || null,
      confidence: data.data.score || 0,
      source: 'hunter_finder',
    };
  }

  return null;
}

const JUNK_EMAIL_PATTERNS = [
  'example.com', 'sentry', 'wix', 'wordpress', 'squarespace', 'godaddy',
  'cloudflare', 'googleapis', 'google.com', 'facebook.com', 'twitter.com',
  '@2x', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css',
  'noreply', 'no-reply', 'mailer-daemon', 'postmaster',
  'email@email', 'user@domain', 'test@', 'info@example',
  'name@domain', 'your@email', 'john@doe', 'jane@doe',
  'sample@', 'demo@', 'placeholder',
];

const FAKE_TLDS = new Set(['local','localhost','test','example','invalid','internal']);
const ESCAPE_PATTERN = /u[0-9a-f]{4}/i;

function isValidEmail(email: string): boolean {
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (ESCAPE_PATTERN.test(local)) return false;
  const tld = domain.split('.').pop()?.toLowerCase();
  if (!tld || tld.length < 2 || FAKE_TLDS.has(tld)) return false;
  if (local.length < 2 || domain.length < 4) return false;
  return true;
}

async function tryWebScrape(website: string | undefined): Promise<EmailResult | null> {
  console.log('[find-email] trying webscrape for:', website);
  if (!website) return null;

  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rankall/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const raw = html.match(emailRegex) || [];

    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const e of raw) {
      const lower = e.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      if (JUNK_EMAIL_PATTERNS.some(p => lower.includes(p))) continue;
      if (!isValidEmail(lower)) continue;
      const local = lower.split('@')[0];
      if (['user', 'email', 'test', 'admin', 'name', 'yourname', 'youremail'].includes(local)) continue;
      filtered.push(lower);
    }

    console.log('[find-email] scrape found emails:', filtered.length, 'first:', filtered[0] || 'none', 'raw:', raw.length);
    if (filtered.length === 0) return null;

    return {
      email: filtered[0],
      firstName: null,
      lastName: null,
      confidence: 70,
      source: 'website',
    };
  } catch (err) {
    console.error('[find-email] scrape error:', (err as Error)?.message || err);
    return null;
  }
}

// Back-office only (admin session or internal automation): spends Apollo /
// Hunter credits. It was unauthenticated.
const OUTREACH_RATE_LIMIT = { limit: 500, windowMs: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const actor = await getAdminOrInternalActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await checkRateLimitDb('outreach:find-email', actor, OUTREACH_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const body = await req.json();

    const target = Array.isArray(body.targets) && body.targets.length > 0 ? body.targets[0] : body;
    const businessName = target.businessName || target.name || body.businessName || body.name;
    const domain = target.domain || body.domain;
    const city = target.city || body.city;

    console.log('[find-email] lookup:', { businessName, domain, city });
    if (!businessName) return NextResponse.json({ error: 'businessName required' }, { status: 400 });

    const result =
      await tryApollo(businessName, city) ??
      await tryHunter(businessName, city, domain) ??
      await tryWebScrape(domain);

    return NextResponse.json(result ?? NOT_FOUND);
  } catch (err) {
    console.error('find-email error:', err);
    return NextResponse.json({ email: null, confidence: 0, source: 'error' });
  }
}
