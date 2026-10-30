// lib/cronAuth.ts
// One cron-auth rule for every cron route: Vercel Cron sends GET with
// `Authorization: Bearer ${CRON_SECRET}`. Fail CLOSED when CRON_SECRET is
// unset (the old `if (cronSecret && …)` / `Bearer ${undefined}` checks let
// anyone in), and never accept the spoofable `x-vercel-cron` header or a
// hardcoded fallback secret.

import { NextResponse } from 'next/server';
import { safeEqual } from './apiAuth';

export type CronAuthResult = 'ok' | 'unconfigured' | 'unauthorized';

export function checkCronAuth(authorizationHeader: string | null | undefined, secret: string | undefined = process.env.CRON_SECRET): CronAuthResult {
  if (!secret) return 'unconfigured';
  // Constant-time compare (lib/apiAuth.safeEqual) — a plain === leaks the
  // matching prefix length through timing.
  return safeEqual(authorizationHeader ?? '', `Bearer ${secret}`) ? 'ok' : 'unauthorized';
}

/** null when authorised; otherwise the response to return (500 unset / 401). */
export function cronAuthFailure(req: Request): NextResponse | null {
  const r = checkCronAuth(req.headers.get('authorization'));
  if (r === 'ok') return null;
  if (r === 'unconfigured') return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
