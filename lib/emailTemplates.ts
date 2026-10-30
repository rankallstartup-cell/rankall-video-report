// lib/emailTemplates.ts
// Shared email sender. Uses the Resend HTTP API via fetch (matches the rest of the
// codebase — no `resend` SDK dependency). Returns true on success, false on any
// failure (never throws).

export async function sendEmail({
  to,
  subject,
  html,
  from = 'Rankall <hello@rankall.io>',
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('Email send failed: RESEND_API_KEY not set');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error('Email send failed:', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
    return false;
  }
}
