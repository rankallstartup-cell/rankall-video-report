import { NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Rotate through industry/city combos, one per day.
const BLOG_TARGETS = [
  { industry: 'dentist', city: 'Chicago' },
  { industry: 'dentist', city: 'New York' },
  { industry: 'dentist', city: 'Los Angeles' },
  { industry: 'lawyer', city: 'Chicago' },
  { industry: 'lawyer', city: 'New York' },
  { industry: 'HVAC', city: 'Chicago' },
  { industry: 'HVAC', city: 'Houston' },
  { industry: 'restaurant', city: 'New York' },
  { industry: 'restaurant', city: 'Los Angeles' },
  { industry: 'gym', city: 'Chicago' },
  { industry: 'medical practice', city: 'Chicago' },
  { industry: 'salon', city: 'New York' },
  { industry: 'plumber', city: 'Houston' },
  { industry: 'chiropractor', city: 'Chicago' },
];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';

export async function GET(req: Request) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  // Pick today's target by day-of-year so it rotates deterministically.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const target = BLOG_TARGETS[dayOfYear % BLOG_TARGETS.length];

  const res = await fetch(`${APP_URL}/api/blog/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(target),
  });

  const data = await res.json().catch(() => ({}));
  console.log('[blog-cron] Generated:', target, res.status);

  return NextResponse.json({ success: res.ok, target, result: data });
}
