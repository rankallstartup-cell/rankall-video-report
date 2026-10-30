import { describe, it, expect, vi } from 'vitest';
import { isHoneypotTripped, allowByDbLimit, hashIp } from '../publicFormGuard';
import { parseDemoBookingUrl } from '../demoBooking';

function fakeAdmin(count: number | null, error: unknown = null) {
  const insert = vi.fn(async () => ({ error: null }));
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.gte = async () => ({ count, error });
  return { admin: { from: () => ({ ...chain, insert }) } as never, insert };
}

describe('public form guard', () => {
  it('honeypot', () => {
    expect(isHoneypotTripped({ website_url: '' })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped({ website_url: 'x' })).toBe(true);
  });
  it('ip hash is stable and does not contain the raw ip', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
    expect(hashIp('1.2.3.4')).not.toContain('1.2.3.4');
  });
  it('blocks at the limit, records when allowed', async () => {
    const under = fakeAdmin(4);
    expect(await allowByDbLimit(under.admin, 'contact', '1.2.3.4', 5, 3600_000)).toBe(true);
    expect(under.insert).toHaveBeenCalledOnce();
    const at = fakeAdmin(5);
    expect(await allowByDbLimit(at.admin, 'contact', '1.2.3.4', 5, 3600_000)).toBe(false);
    expect(at.insert).not.toHaveBeenCalled();
  });
  it('fails open when the table is missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = fakeAdmin(null, { message: 'relation "public_form_events" does not exist' });
    expect(await allowByDbLimit(missing.admin, 'chat', '1.2.3.4', 5, 3600_000)).toBe(true);
    err.mockRestore();
  });
});

describe('demo booking url', () => {
  it('accepts only https URLs', () => {
    expect(parseDemoBookingUrl(undefined)).toBeNull();
    expect(parseDemoBookingUrl('')).toBeNull();
    expect(parseDemoBookingUrl('javascript:alert(1)')).toBeNull();
    expect(parseDemoBookingUrl('http://cal.com/x')).toBeNull();
    expect(parseDemoBookingUrl('https://cal.com/rankall.io/demo')).toBe('https://cal.com/rankall.io/demo');
  });
});
