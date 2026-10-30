// lib/referralTracking.ts
// Server-side referral attribution. Shared by /api/referral/track and the Stripe
// webhook so conversions are recorded via a direct function call (a server route
// cannot reliably self-fetch a relative URL).

import { createClient } from '@supabase/supabase-js';
import { generateReferralCode } from './referralCode';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// A referral code is the uppercased first 8 hex chars of the referrer's UUID —
// i.e. the first UUID segment. So we can resolve it with an indexed range query
// on the profiles.id column instead of scanning every user. Returns the referrer
// user id, or null if not found (e.g. the referrer has no profiles row yet).
export async function resolveReferrerUserId(refCode: string): Promise<string | null> {
  const seg = (refCode || '').toLowerCase().trim();
  if (!/^[0-9a-f]{8}$/.test(seg)) return null;
  const lo = `${seg}-0000-0000-0000-000000000000`;
  const hi = `${seg}-ffff-ffff-ffff-ffffffffffff`;
  try {
    const { data } = await admin()
      .from('profiles')
      .select('id')
      .gte('id', lo)
      .lte('id', hi)
      .limit(1);
    const id = (data?.[0]?.id as string) || null;
    // Guard against a hash collision on the segment — confirm the code matches.
    return id && generateReferralCode(id) === refCode.toUpperCase() ? id : null;
  } catch {
    return null;
  }
}

export async function recordReferralConversion(input: {
  refCode: string;
  referredUserId?: string | null;
  referredEmail?: string | null;
  plan?: string | null;
  monthlyAmount?: number | null;
  status?: string;
}): Promise<{ ok: boolean; referrerUserId: string | null }> {
  const referrerUserId = await resolveReferrerUserId(input.refCode);
  // Self-referral guard: never credit a user for referring themselves.
  if (referrerUserId && input.referredUserId && referrerUserId === input.referredUserId) {
    return { ok: false, referrerUserId: null };
  }
  const monthly = typeof input.monthlyAmount === 'number' ? input.monthlyAmount : null;
  try {
    await admin().from('referral_conversions').insert({
      referrer_user_id: referrerUserId,
      referred_user_id: input.referredUserId ?? null,
      referred_email: input.referredEmail ?? null,
      plan: input.plan ?? null,
      monthly_amount: monthly,
      commission: monthly !== null ? Math.round(monthly * 0.25 * 100) / 100 : null,
      status: input.status ?? 'active',
      ref_code: input.refCode.toUpperCase(),
    });
    return { ok: true, referrerUserId };
  } catch {
    return { ok: false, referrerUserId };
  }
}
