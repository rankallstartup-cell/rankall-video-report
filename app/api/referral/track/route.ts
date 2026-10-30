import { NextRequest, NextResponse } from 'next/server';
import { recordReferralConversion } from '@/lib/referralTracking';

export const dynamic = 'force-dynamic';

// POST { referredUserId, referredEmail, plan, monthlyAmount, refCode? }
// refCode falls back to the rankall_ref cookie when not passed in the body.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refCode = (body.refCode || req.cookies.get('rankall_ref')?.value || '').trim();
    if (!refCode) return NextResponse.json({ ok: false, reason: 'no_ref_code' });

    const result = await recordReferralConversion({
      refCode,
      referredUserId: body.referredUserId ?? null,
      referredEmail: body.referredEmail ?? null,
      plan: body.plan ?? null,
      monthlyAmount: typeof body.monthlyAmount === 'number' ? body.monthlyAmount : null,
      status: 'pending',
    });
    return NextResponse.json({ ok: result.ok, referrerFound: !!result.referrerUserId });
  } catch {
    // Never surface an error to the caller — referral tracking must not break signup/pay.
    return NextResponse.json({ ok: false });
  }
}
