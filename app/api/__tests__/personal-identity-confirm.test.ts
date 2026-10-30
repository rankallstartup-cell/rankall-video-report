import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// T7: a personal scan must never score an unconfirmed identity. The chain's
// homepage card (personalNameEdit / "No, that's not me") was replaced in
// staging by the runConfirmedPersonalScan panel; the old assertions targeted
// the removed card. The gate that matters is now SERVER-side: scan-personal
// returns 428 identity_confirm_required unless identityConfirmed === true,
// regardless of any client flag.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const home = read('app/page.tsx');
const dash = read('app/dashboard/personal-brand/page.tsx');

describe('T7 personal identity confirm — homepage flow (staging)', () => {
  it('shows an "Is this you?" panel before any personal scan', () => {
    expect(home).toContain('Is this you?');
    expect(home).toContain('personalConfirm');
    expect(home).toContain('Not me — edit details');
  });

  it('the only homepage scan-personal call is in runConfirmedPersonalScan and sends identityConfirmed:true', () => {
    const calls = home.split("fetch('/api/scan-personal'").length - 1;
    expect(calls).toBe(1);
    const fn = home.slice(home.indexOf('async function runConfirmedPersonalScan'));
    const body = fn.slice(0, fn.indexOf('signal: ppAbort.signal'));
    expect(body).toContain("fetch('/api/scan-personal'");
    expect(body).toContain('identityConfirmed: true');
  });

  it('every PERSONAL_PRO route (detected or Professional-mode override) lands on the confirm panel, never a direct scan', () => {
    // Places down → detect-query may fall back to PERSONAL_PRO; that path
    // must still stop at setPersonalConfirm, not call scan-personal.
    const start = home.indexOf("if (detectedIntent === 'PERSONAL_PRO' && detectedPersonName) {");
    expect(start).toBeGreaterThan(0);
    const branch = home.slice(start, home.indexOf('return;', start));
    expect(branch).toContain('setPersonalConfirm(');
    expect(branch).not.toContain('/api/scan-personal');
  });

  it('dashboard personal-brand sends identityConfirmed:true only after the confirm step', () => {
    expect(dash).toContain("if (!confirmed && !identityConfirmed) { setIdentityStep('confirm'); return; }");
    expect(dash).toContain('identityConfirmed: true');
  });
});

// ── Server gate (route handler with mocked deps; offline) ────────────────
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => { throw new Error('db must not be reached'); } }) }));
vi.mock('@/lib/platforms', () => ({ ACTIVE_PLATFORMS: [], callPlatform: vi.fn() }));
vi.mock('@/lib/usageLimits', () => ({ checkUsageLimit: vi.fn(async () => ({ allowed: true })), incrementUsage: vi.fn() }));
vi.mock('@/lib/resolvePlanServer', () => ({ resolvePlanServer: vi.fn(async () => ({ plan: 'free', email: '', isTrialing: false })) }));
const sessionMock = vi.fn(async () => null as null | { id: string; email: string });
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: () => sessionMock() }));

async function post(body: Record<string, unknown>, ip = '203.0.113.9') {
  const { POST } = await import('../scan-personal/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest('http://localhost/api/scan-personal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('T7 scan-personal server gate', () => {
  beforeEach(() => { sessionMock.mockReset(); sessionMock.mockResolvedValue(null); });

  it('428 when identityConfirmed is missing, even without requireConfirm', async () => {
    const res = await post({ name: 'John Smith', specialty: 'dentist', location: 'Chicago' });
    expect(res.status).toBe(428);
    expect((await res.json()).error).toBe('identity_confirm_required');
  });

  it('428 when identityConfirmed is truthy but not literally true', async () => {
    const res = await post({ name: 'John Smith', specialty: 'dentist', location: 'Chicago', identityConfirmed: 'yes', requireConfirm: false });
    expect(res.status).toBe(428);
  });

  it('a body userId that is not the session user is rejected (no IDOR)', async () => {
    sessionMock.mockResolvedValue({ id: 'me', email: 'me@x.com' });
    const res = await post({ name: 'John Smith', specialty: 'dentist', location: 'Chicago', identityConfirmed: true, userId: 'victim' });
    expect(res.status).toBe(401);
  });

  it('anonymous callers get a per-IP daily cap', async () => {
    // Bare name → 400 disambiguation happens before the cap, so use a
    // disambiguated name; the 3rd anonymous call from one IP is capped
    // before any platform/db work (db mock throws if reached → 500).
    const body = { name: 'John Smith', specialty: 'dentist', location: 'Chicago', identityConfirmed: true };
    const ip = '198.51.100.77';
    await post(body, ip);
    await post(body, ip);
    const third = await post(body, ip);
    expect(third.status).toBe(429);
  });
});
