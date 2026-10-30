import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';

async function notion(endpoint: string, method: string, body?: object) {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY not set');
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function text(content: string) { return { rich_text: [{ text: { content: content || '' } }] }; }
function title(content: string) { return { title: [{ text: { content: content || '' } }] }; }
function select(name: string) { return { select: { name: name || 'Unknown' } }; }
function num(n: number) { return { number: n ?? 0 }; }
function date(d: string) { return { date: { start: d || new Date().toISOString() } }; }

// POST /api/webhooks/notion-sync
// Auth: Bearer CRON_SECRET
// Body: { event: 'new_customer' | 'hot_lead' | 'weekly_report', data: {...} }
export async function POST(req: NextRequest) {
  // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
  const denied = cronAuthFailure(req);
  if (denied) return denied;
  if (!process.env.NOTION_API_KEY) {
    return NextResponse.json({ error: 'Notion not configured — set NOTION_API_KEY' }, { status: 503 });
  }

  const { event, data } = await req.json().catch(() => ({ event: null, data: {} }));
  if (!event) return NextResponse.json({ error: 'event required' }, { status: 400 });

  try {
    if (event === 'new_customer' && process.env.NOTION_CUSTOMERS_DB) {
      await notion('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_CUSTOMERS_DB },
        properties: {
          Name: title(data.name || 'Unknown'),
          Plan: select(data.plan || 'Trial'),
          Country: select(data.country || 'US'),
          Industry: text(data.industry || ''),
          City: text(data.city || ''),
          Score: num(data.score),
          Competitor: text(data.competitor || ''),
          Status: select('Active Trial'),
        },
      });
    }

    if (event === 'hot_lead' && process.env.NOTION_LEADS_DB) {
      await notion('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_LEADS_DB },
        properties: {
          Name: title(data.business_name || 'Unknown'),
          Score: num(data.score),
          'Video %': num(data.video_pct),
          Priority: select('High'),
          'Last Active': date(data.last_active),
        },
      });
    }

    if (event === 'weekly_report' && process.env.NOTION_REPORTS_DB) {
      await notion('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_REPORTS_DB },
        properties: {
          Name: title(`Weekly Report — ${new Date().toLocaleDateString('en-GB')}`),
          MRR: num(data.mrr),
          'New Customers': num(data.new_customers),
          'Scan Count': num(data.scan_count),
          'Top Industry': text(data.top_industry || ''),
          'Outreach Sent': num(data.outreach_sent),
        },
      });
    }

    if (event === 'blog_post' && process.env.NOTION_BLOG_DB) {
      await notion('/pages', 'POST', {
        parent: { database_id: process.env.NOTION_BLOG_DB },
        properties: {
          Name: title(data.title || 'Untitled'),
          URL: text(data.url || ''),
          Industry: text(data.industry || ''),
          City: text(data.city || ''),
          Published: date(data.published_at || new Date().toISOString()),
        },
      });
    }

    return NextResponse.json({ success: true, event });
  } catch (e: any) {
    console.error('notion-sync error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
