import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canAccessScan, getSessionUser, isCronRequest } from "@/lib/apiAuth";
import { escapeHtml } from "@/lib/escapeHtml";
import { enforceTrialCap } from "@/lib/trialCaps";

// Emails a scan's report link + headline numbers.
//
// Security: the old route was an open relay — any caller could send
// arbitrary HTML (businessInput/competitor were interpolated raw) to any
// address from hello@rankall.io. Now: the signed-in scan owner (sent to
// THEIR account email), or an internal caller holding CRON_SECRET (fails
// closed when unset). The numbers come from the scan row, never the body,
// and every interpolated string is HTML-escaped.
export async function POST(req: NextRequest) {
  const trialCap = await enforceTrialCap(req, 'report_email');
  if (trialCap) return trialCap;
  try {
    const body = await req.json().catch(() => ({}));
    const scanId: string | undefined = typeof body.scanId === "string" ? body.scanId : undefined;
    if (!scanId) {
      return NextResponse.json({ error: "scanId required" }, { status: 400 });
    }

    const internal = isCronRequest(req);
    const user = internal ? null : await getSessionUser(req);
    if (!internal && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: scan } = await sb
      .from("rankall_scans")
      .select("id, user_id, input, user_business_name, competitor_name, mentioned_count, overall_score, trust_signals")
      .eq("id", scanId)
      .maybeSingle();
    if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!internal && !canAccessScan(scan, user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const email: string | null = internal
      ? (typeof body.email === "string" ? body.email : null)
      : (user?.email ?? null);
    if (!email) {
      return NextResponse.json({ error: "No email address on file" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const reportUrl = `https://rankall.io/report/${encodeURIComponent(scan.id as string)}`;
    const businessInput = escapeHtml((scan.user_business_name as string) || (scan.input as string) || "your business");
    const competitorName = escapeHtml((scan.competitor_name as string) || "your top competitor");
    const mentionedCount = Number(scan.mentioned_count) || 0;
    const trustScore = Number((scan.trust_signals as { overall?: number } | null)?.overall) || 0;
    const score = Math.max(0, Math.min(100, Math.round(Number(scan.overall_score) || 0)));
    const scoreColor = score >= 75 ? "#059669" : score >= 50 ? "#D97706" : "#DC2626";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AI Visibility Report — Rankall.io</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#0F172A;border-radius:12px;padding:10px 20px;">
        <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">rankall<span style="color:#2563EB;">.io</span></span>
      </div>
    </div>

    <!-- Main card -->
    <div style="background:#ffffff;border:1.5px solid #E2E8F0;border-radius:16px;padding:32px;margin-bottom:16px;">
      <p style="font-size:13px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">AI Visibility Report Ready</p>
      <h1 style="font-size:24px;font-weight:800;color:#0F172A;margin:0 0 8px;line-height:1.2;">Your report for<br>"${businessInput}"</h1>
      <p style="font-size:14px;color:#64748B;margin:0 0 24px;">Scanned across 9 AI platforms · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <!-- Score -->
      <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
        <p style="font-size:48px;font-weight:900;color:${scoreColor};margin:0;line-height:1;">${score}</p>
        <p style="font-size:13px;color:#64748B;margin:4px 0 0;">Your AI Visibility Score</p>
      </div>

      <!-- Key findings -->
      <div style="margin-bottom:24px;">
        <p style="font-size:13px;font-weight:700;color:#0F172A;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.08em;">Key Findings</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;">
            <p style="font-size:13px;color:#DC2626;font-weight:600;margin:0;">⚠️ ${competitorName} is appearing significantly more often than you across AI platforms</p>
          </div>
          <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px 16px;">
            <p style="font-size:13px;color:#2563EB;font-weight:600;margin:0;">📊 ${mentionedCount || 0} of 12 platforms mentioned your business</p>
          </div>
          <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:12px 16px;">
            <p style="font-size:13px;color:#059669;font-weight:600;margin:0;">✓ Trust score: ${trustScore || 0}/100 — fixes available to improve this</p>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <a href="${reportUrl}" style="display:block;background:#2563EB;border-radius:10px;padding:16px;text-align:center;text-decoration:none;margin-bottom:16px;">
        <span style="font-size:15px;font-weight:700;color:#ffffff;">View Your Full Report →</span>
      </a>
      <p style="font-size:12px;color:#94A3B8;text-align:center;margin:0;">Or copy this link: ${reportUrl}</p>
    </div>

    <!-- What's in the report -->
    <div style="background:#ffffff;border:1.5px solid #E2E8F0;border-radius:16px;padding:24px;margin-bottom:16px;">
      <p style="font-size:13px;font-weight:700;color:#0F172A;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.08em;">Your report includes</p>
      ${[
        '30+ trust signals checked across technical, directory, and review categories',
        'Real Google Business data — review count, rating, photos, claimed status',
        'AI gap narrative — exactly why your competitor ranks higher',
        '5 specific fixes with generated content ready to paste',
        'Competitor intelligence from Google local pack',
      ].map(item => `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <span style="color:#059669;font-size:14px;flex-shrink:0;">✓</span>
          <p style="font-size:13px;color:#64748B;margin:0;line-height:1.6;">${item}</p>
        </div>
      `).join('')}
    </div>

    <!-- Rescan reminder -->
    <div style="background:#0F172A;border-radius:16px;padding:24px;margin-bottom:16px;text-align:center;">
      <p style="font-size:14px;font-weight:700;color:#ffffff;margin:0 0 8px;">Apply a fix — we verify it with an automatic rescan 7 days later</p>
      <p style="font-size:13px;color:#94A3B8;margin:0 0 16px;">Click "I applied this fix" on any fix in your report. When AI platforms reflect it depends on each platform's refresh cycle — our verification rescan (7 days by default, or the date you choose) measures the real change, and we'll send you the before/after comparison.</p>
      <a href="${reportUrl}" style="display:inline-block;background:#2563EB;border-radius:8px;padding:12px 24px;text-decoration:none;">
        <span style="font-size:13px;font-weight:700;color:#ffffff;">Start fixing now →</span>
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;">
      <p style="font-size:12px;color:#94A3B8;margin:0 0 4px;">Rankall.io · AI Recommendation Intelligence</p>
      <p style="font-size:11px;color:#CBD5E1;margin:0;">You received this because you scanned your business on Rankall.io</p>
    </div>

  </div>
</body>
</html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Rankall.io <hello@rankall.io>",
        to: [email],
        subject: `Your AI Visibility Report — Score: ${score}/100`,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return NextResponse.json({ error: data.message || "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });

  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}