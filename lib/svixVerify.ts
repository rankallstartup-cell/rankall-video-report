// lib/svixVerify.ts — verify Svix-signed webhooks (Resend uses Svix).
//
// SERVER-ONLY. Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`,
// HMAC-SHA256 keyed with the base64 secret after the `whsec_` prefix, sent
// base64-encoded in `svix-signature` as space-separated `v1,<sig>` entries
// (several during secret rotation). The timestamp must be within the
// tolerance window (replay protection). Fails CLOSED on anything missing.
import { createHmac, timingSafeEqual } from 'crypto';

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixInput {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  body: string;
  secret: string | null | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}

function secretKey(secret: string): Buffer | null {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

export function signSvixPayload(id: string, timestamp: string, body: string, secret: string): string {
  const key = secretKey(secret);
  if (!key) throw new Error('invalid svix secret');
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySvixSignature(input: SvixInput): boolean {
  const { id, timestamp, signature, body, secret } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(ts)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tol = input.toleranceSeconds ?? SVIX_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tol) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(signSvixPayload(id, timestamp, body, secret), 'base64');
  } catch {
    return false;
  }
  for (const part of signature.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    let got: Buffer;
    try {
      got = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}
