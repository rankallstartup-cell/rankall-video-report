/* eslint-disable @typescript-eslint/no-explicit-any -- loose request mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signSvixPayload, verifySvixSignature } from '../svixVerify';

const SECRET = 'whsec_' + Buffer.from('test-signing-key-0123456789').toString('base64');
const NOW = 1_800_000_000;

describe('verifySvixSignature', () => {
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.com'] } });
  const sig = signSvixPayload('msg_1', String(NOW), body, SECRET);
  const base = { id: 'msg_1', timestamp: String(NOW), signature: `v1,${sig}`, body, secret: SECRET, nowSeconds: NOW };

  it('accepts a valid signature (also among rotated ones)', () => {
    expect(verifySvixSignature(base)).toBe(true);
    expect(verifySvixSignature({ ...base, signature: `v1,AAAA v1,${sig}` })).toBe(true);
  });
  it('rejects a tampered body, wrong id, wrong secret', () => {
    expect(verifySvixSignature({ ...base, body: body.replace('bounced', 'complained') })).toBe(false);
    expect(verifySvixSignature({ ...base, id: 'msg_2' })).toBe(false);
    expect(verifySvixSignature({ ...base, secret: 'whsec_' + Buffer.from('other').toString('base64') })).toBe(false);
  });
  it('rejects stale / future timestamps (replay)', () => {
    expect(verifySvixSignature({ ...base, nowSeconds: NOW + 301 })).toBe(false);
    expect(verifySvixSignature({ ...base, nowSeconds: NOW - 301 })).toBe(false);
  });
  it('fails closed on missing pieces', () => {
    expect(verifySvixSignature({ ...base, secret: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: null })).toBe(false);
    expect(verifySvixSignature({ ...base, id: '' })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: `v2,${sig}` })).toBe(false);
  });
});

const calls: string[] = [];
vi.mock('@/lib/outreachGuard', () => ({
  recordBounce: async (e: string) => { calls.push(`bounce:${e}`); },
  recordSpamComplaint: async (e: string) => { calls.push(`spam:${e}`); },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ insert: async () => ({}) }) }) }));

function req(body: string, headers: Record<string, string>): any {
  return { text: async () => body, headers: new Headers(headers) };
}

describe('webhooks/resend route', () => {
  beforeEach(() => { calls.length = 0; process.env.RESEND_WEBHOOK_SECRET = SECRET; });
  const body = JSON.stringify({ type: 'email.complained', data: { to: ['victim@example.com'], from: 'x@rankall.io' } });

  it('500 when the secret is unset (fails closed)', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/resend/route');
    expect((await POST(req(body, {}))).status).toBe(500);
    expect(calls).toEqual([]);
  });
  it('401 for an unsigned forged complaint — domain is not paused', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route');
    expect((await POST(req(body, {}))).status).toBe(401);
    expect(calls).toEqual([]);
  });
  it('processes a correctly signed event', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signSvixPayload('msg_9', ts, body, SECRET);
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const res = await POST(req(body, { 'svix-id': 'msg_9', 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` }));
    expect(res.status).toBe(200);
    expect(calls).toEqual(['spam:victim@example.com']);
  });
});
