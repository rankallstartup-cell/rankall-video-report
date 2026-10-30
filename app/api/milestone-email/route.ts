import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { emailDedupeKey, isoWeekKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';

// Milestone types
// score_50: first time score crosses 50
// score_75: first time score crosses 75
// new_platform: just appeared on a new platform
// decay_warning: score dropped 10+ points since last scan
// streak_7: active for 7 days in a row

let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}

type MilestoneType =
  | 'score_50' | 'score_75' | 'new_platform' | 'decay_warning' | 'streak_7'
  | 'first_fix_applied' | 'score_jump' | 'competitor_overtaken';

interface MilestonePayload {
  user_id: string;
  email: string;
  milestone: MilestoneType;
  business_name?: string;
  score?: number;
  prev_score?: number;
  new_platform?: string;
  scan_id?: string;
  // score_jump reuses prev_score (before) + score (after).
  predicted_impact?: number;   // first_fix_applied
  verify_days?: number;        // first_fix_applied — the delay the user picked
  competitor_score?: number;   // competitor_overtaken
  competitor_name?: string;    // competitor_overtaken
}

function buildEmail(payload: MilestonePayload): { subject: string; html: string } {
  const { milestone, business_name, score, prev_score, new_platform, scan_id } = payload;
  const name = business_name || 'your business';
  const reportUrl = scan_id
    ? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/report/${scan_id}`
    : `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/dashboard`;

  const base = `font-family:Inter,Arial,sans-serif;`;

  switch (milestone) {
    case 'score_50': return {
      subject: `🎉 ${name} crossed 50/100 on AI visibility`,
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="font-size:48px;font-weight:900;color:#A78BFA;margin:0;line-height:1;">${score}</p>
          <p style="color:#CBD5E1;font-size:14px;margin:8px 0 0;">/100 AI Visibility Score</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You just crossed the 50-point mark 🎉</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
          <strong>${name}</strong> now scores ${score}/100 across 12 AI platforms — past the midpoint of the scale.
        </p>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
          Keep going: each fix you apply is checked by a verification rescan, and your score history updates whenever a scan or rescan runs.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#2563EB;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">See Your Next Fixes →</a>
      </div>`,
    };

    case 'score_75': return {
      subject: `🏆 ${name} reached ${score}/100 AI visibility`,
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="font-size:48px;font-weight:900;color:#F59E0B;margin:0;line-height:1;">${score}</p>
          <p style="color:#CBD5E1;font-size:14px;margin:8px 0 0;">/100 AI Visibility Score</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You crossed 75/100 🏆</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
          <strong>${name}</strong> now scores ${score}/100. Your report shows which of the 12 AI platforms recommend you and which still don't — the remaining fixes target those.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#F59E0B;color:#0F172A;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">View Your Full Report →</a>
      </div>`,
    };

    case 'new_platform': return {
      subject: `✅ ${name} just appeared on ${new_platform || 'a new AI platform'}`,
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <p style="font-size:32px;margin:0;">✅</p>
          <p style="font-size:20px;font-weight:800;color:#059669;margin:8px 0 0;">${new_platform || 'New Platform'}</p>
          <p style="font-size:13px;color:#065F46;margin:4px 0 0;">Now recommending you</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You just appeared on ${new_platform || 'a new AI platform'} 🎉</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
          Your fixes are working. <strong>${name}</strong> now appears when someone asks ${new_platform || 'this platform'} for a recommendation in your category.
        </p>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
          Current score: <strong>${score}/100</strong>. Keep applying fixes to appear on more platforms.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#059669;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">See All Platforms →</a>
      </div>`,
    };

    case 'decay_warning': return {
      subject: `⚠️ ${name}'s AI visibility dropped — action needed`,
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <p style="font-size:32px;margin:0;">⚠️</p>
          <p style="font-size:20px;font-weight:800;color:#DC2626;margin:8px 0 0;">${prev_score} → ${score}</p>
          <p style="font-size:13px;color:#7F1D1D;margin:4px 0 0;">Score dropped ${(prev_score || 0) - (score || 0)} points</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">Your AI visibility has slipped ⚠️</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
          <strong>${name}</strong> dropped from ${prev_score} to ${score}/100 since your last scan. This usually means a competitor has improved their presence, or one of your trust signals became stale.
        </p>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
          Check your fix queue — one or two quick updates are usually enough to recover and continue climbing.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">See What Changed →</a>
      </div>`,
    };

    case 'streak_7': return {
      subject: `🔥 7-day streak — you've checked in on ${name} all week`,
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="font-size:48px;margin:0;">🔥</p>
          <p style="font-size:20px;font-weight:900;color:#F59E0B;margin:8px 0 0;">7-Day Active Streak</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You've been active for 7 days straight</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
          You've checked in on <strong>${name}</strong> 7 days in a row. Your score history updates whenever a scan or rescan runs, and every fix you apply is verified by a rescan afterwards — run a rescan any time to see where you stand.
        </p>
        <a href="${reportUrl}" style="display:inline-block;background:#2563EB;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">View Dashboard →</a>
      </div>`,
    };

    case 'first_fix_applied': return {
      subject: '🎉 You just took your first step toward AI visibility',
      html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="font-size:48px;font-weight:900;color:#A78BFA;margin:0;line-height:1;">${score ?? '—'}</p>
          <p style="color:#CBD5E1;font-size:14px;margin:8px 0 0;">/100 — your starting score</p>
        </div>
        <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You just applied your first fix 🎉</h1>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
          Hi ${name}, this is the moment most businesses never reach — they see the problem but don't act on it. You did.
        </p>
        <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:12px;">
          Rankall will rescan your business in ${typeof payload.verify_days === 'number' && payload.verify_days > 0 ? payload.verify_days : 7} days to verify the improvement, and we'll email you the results. In the meantime, here's what to expect:
        </p>
        <ul style="font-size:14px;color:#64748B;line-height:1.8;margin:0 0 24px;padding-left:20px;">
          <li>Each AI platform refreshes its data on its own schedule, so changes can take time to show</li>
          ${typeof payload.predicted_impact === 'number' && payload.predicted_impact > 0 ? `<li>Estimated impact for this fix: about +${payload.predicted_impact} points (an estimate, not a guarantee)</li>` : ''}
          <li>The verification rescan shows whether more platforms now mention you</li>
        </ul>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/dashboard/fix" style="display:inline-block;background:#2563EB;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">View your next fix →</a>
      </div>`,
    };

    case 'score_jump': {
      const before = prev_score ?? 0;
      const after = score ?? 0;
      const jump = after - before;
      return {
        subject: `📈 Your AI score just jumped ${jump} points`,
        html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="background:#0F172A;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="font-size:36px;font-weight:900;color:#fff;margin:0;line-height:1;">
              <span style="color:#64748B;">${before}</span> <span style="color:#94A3B8;">→</span> <span style="color:#22C55E;">${after}</span>
            </p>
            <p style="color:#CBD5E1;font-size:14px;margin:8px 0 0;">+${jump} points</p>
          </div>
          <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">Your AI Visibility Score improved 📈</h1>
          <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
            Hi ${name}, more AI platforms are now recommending your business. That means more customers finding you when they ask ChatGPT, Gemini, and Perplexity for recommendations in your area.
          </p>
          <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">
            Keep applying fixes to keep climbing — every point compounds into more AI-referred customers.
          </p>
          <a href="${reportUrl}" style="display:inline-block;background:#22C55E;color:#fff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">See your full improvement →</a>
        </div>`,
      };
    }

    case 'competitor_overtaken': {
      const you = score ?? 0;
      const them = payload.competitor_score ?? 0;
      const comp = payload.competitor_name || 'your competitor';
      return {
        subject: `🏆 You just passed ${comp} on AI visibility`,
        html: `<div style="${base}max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
            <div style="flex:1;min-width:130px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:18px;text-align:center;">
              <p style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">You</p>
              <p style="font-size:40px;font-weight:900;color:#059669;margin:0;line-height:1;">${you}</p>
            </div>
            <div style="display:flex;align-items:center;justify-content:center;font-size:20px;color:#94A3B8;">vs</div>
            <div style="flex:1;min-width:130px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:18px;text-align:center;">
              <p style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">${comp}</p>
              <p style="font-size:40px;font-weight:900;color:#64748B;margin:0;line-height:1;">${them}</p>
            </div>
          </div>
          <h1 style="font-size:22px;font-weight:900;color:#0F172A;margin-bottom:12px;">You just passed ${comp} 🏆</h1>
          <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:20px;">
            Hi ${name}, something just happened that most businesses never achieve. Your AI Visibility Score (${you}/100) just passed ${comp} (${them}/100). AI platforms are now recommending YOU over them.
          </p>
          <p style="font-size:15px;color:#64748B;line-height:1.7;margin-bottom:24px;">This is what winning looks like.</p>
          <a href="${reportUrl}" style="display:inline-block;background:#F59E0B;color:#0F172A;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;">See your ranking →</a>
        </div>`,
      };
    }

    default: return { subject: 'Rankall.io — update', html: '' };
  }
}

// POST /api/milestone-email
// Body: MilestonePayload
// Called from rescan-weekly cron after detecting a milestone
export async function POST(req: NextRequest) {
  // Fail closed: with CRON_SECRET unset, `Bearer ${undefined}` would match a
  // caller sending the literal "Bearer undefined".
  // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Resend not configured' }, { status: 503 });
  }

  const payload: MilestonePayload = await req.json();
  const { user_id, email, milestone } = payload;

  if (!user_id || !email || !milestone) {
    return NextResponse.json({ error: 'user_id, email, and milestone required' }, { status: 400 });
  }

  const sb = getAdminClient();

  const { subject, html } = buildEmail(payload);
  if (!html) return NextResponse.json({ error: 'Unknown milestone' }, { status: 400 });

  // ax74: one email per milestone per scan (per ISO week for scan-less
  // milestones). The key carries the discriminator — the unique index is
  // (user_id, trigger_event), so the old bare-milestone insert collided on
  // every repeat and the {error} was ignored. Claim first, then send.
  // CAN-SPAM: never mail an unsubscribed / bounced address, nor a user who
  // turned "Milestone emails" off in Settings (lib/emailSuppression).
  if (await shouldSkipEmail({ email, userId: user_id }, 'milestone_emails')) {
    return NextResponse.json({ success: true, skipped: true, reason: 'suppressed' });
  }
  const triggerEvent = emailDedupeKey(milestone, payload.scan_id ?? isoWeekKey(new Date()));
  const claim = await claimEmailSend(sb, { userId: user_id, email, triggerEvent, scanId: payload.scan_id ?? null });
  if (claim === 'duplicate') {
    return NextResponse.json({ success: true, skipped: true, reason: 'already_sent' });
  }
  if (claim === 'error') {
    return NextResponse.json({ error: 'Could not record the email (not sent, to avoid duplicates)' }, { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Rankall.io <hello@rankall.io>',
      to: [email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    await releaseEmailClaim(sb, user_id, triggerEvent);
    return NextResponse.json({ error: 'Email send failed', detail: err }, { status: 500 });
  }

  return NextResponse.json({ success: true, milestone });
}
